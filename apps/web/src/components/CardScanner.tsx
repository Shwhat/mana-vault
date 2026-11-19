// ---------- card scanner: live camera, continuous recognition, and the scanned list ----------
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { request } from "../api";
import { Icon } from "../icons";
import { guideBox, guideInVideo, loadRecognizer, readCard } from "../recognize";
import { finishFor, hasFinish, matchText, scanCount, scanTargets, type ScanCard, type ScanItem, type ScanMatch } from "../scan-state";
import { useApp } from "../store";
import { confirmDialog, dialog, isDialogOpen } from "./Dialog";

type Capabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; pointsOfInterest?: unknown };
const advanced = (value: Record<string, unknown>) => ({ advanced: [value] }) as unknown as MediaTrackConstraints;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "A moment ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleDateString();
}

const printingLabel = (card: Pick<ScanCard, "set_code" | "collector_number">) => `${card.set_code.toUpperCase()} #${card.collector_number}`;

/** Live camera with continuous autofocus, tap to focus and the torch. */
function useCamera(facing: "environment" | "user") {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState("Starting camera");
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setReady(false);
    setTorch(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera access is unavailable. Open Mana Vault over HTTPS (or localhost), or add cards by name.");
      return;
    }
    setStatus("Starting camera");
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(async (camera) => {
      if (!active) {
        camera.getTracks().forEach((item) => item.stop());
        return;
      }
      stream = camera;
      const first = camera.getVideoTracks()[0] ?? null;
      track.current = first;
      if (video.current) {
        video.current.srcObject = camera;
        await video.current.play().catch(() => undefined);
      }
      const caps = (first?.getCapabilities?.() ?? {}) as Capabilities;
      if (caps.focusMode?.includes("continuous")) await first?.applyConstraints(advanced({ focusMode: "continuous" })).catch(() => undefined);
      if (!active) return;
      setTorch(caps.torch ? false : null);
      setStatus("");
      setReady(true);
    }).catch((reason: unknown) => {
      if (!active) return;
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        setStatus("Camera permission was denied. Allow camera access in your browser settings, or add cards by name.");
      } else if (reason instanceof DOMException && reason.name === "NotFoundError") {
        setStatus("No camera was found. Add cards by name instead.");
      } else {
        setStatus(`Could not start camera: ${message(reason)}`);
      }
    });
    return () => {
      active = false;
      stream?.getTracks().forEach((item) => item.stop());
      track.current = null;
      if (video.current) video.current.srcObject = null;
    };
  }, [facing]);

  const toggleTorch = useCallback(async () => {
    if (torch === null || !track.current) return;
    try {
      await track.current.applyConstraints(advanced({ torch: !torch }));
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }, [torch]);

  /** Focuses on a point of the preview (0 to 1 across and down) where the camera allows it, then returns to continuous focus. */
  const focusAt = useCallback(async (x: number, y: number) => {
    const current = track.current;
    if (!current) return;
    const caps = (current.getCapabilities?.() ?? {}) as Capabilities;
    const modes = caps.focusMode ?? [];
    try {
      if (caps.pointsOfInterest) await current.applyConstraints(advanced({ pointsOfInterest: [{ x, y }], focusMode: modes.includes("single-shot") ? "single-shot" : "continuous" }));
      else if (modes.includes("single-shot")) await current.applyConstraints(advanced({ focusMode: "single-shot" }));
      if (modes.includes("continuous")) {
        await sleep(1500);
        await current.applyConstraints(advanced({ focusMode: "continuous" }));
      }
    } catch {
      // some cameras refuse focus changes; continuous focus stays on
    }
  }, []);

  return { video, status, ready, torch, toggleTorch, focusAt };
}

// mode: which areas the next read uses; it stays while reads find a card and moves on after a miss
type Tracker = { candidate: string | null; hits: number; misses: number; held: string | null; mode: number };

export default function CardScanner({ phone = false, onClose }: { phone?: boolean; onClose: () => void }) {
  const store = useApp();
  const { prefs } = store;
  const camera = useCamera(prefs.scanCamera);
  const frame = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState("Loading text recognition");
  const [engine, setEngine] = useState<"loading" | "ready" | "failed">("loading");
  const [listOpen, setListOpen] = useState(false);
  const [guide, setGuide] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; id: number } | null>(null);
  const tracker = useRef<Tracker>({ candidate: null, hits: 0, misses: 0, held: null, mode: 0 });
  const live = useRef({ store, listOpen });
  live.current = { store, listOpen };

  // the outline drawn over the preview, kept in step with the preview size
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setGuide(guideBox(element.clientWidth, element.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    loadRecognizer().then(() => {
      if (!active) return;
      setEngine("ready");
      setHint("Point the camera at a card and fill the outline");
    }).catch((reason: unknown) => {
      if (!active) return;
      setEngine("failed");
      setHint(`Text recognition could not start: ${message(reason)}`);
    });
    return () => { active = false; };
  }, []);

  const accept = useCallback((card: ScanCard) => {
    const current = live.current.store;
    current.addScanned(card, finishFor(card, current.prefs.scanFoil));
    if (current.prefs.scanVibrate) navigator.vibrate?.(60);
    setHint(`Added ${card.name}`);
  }, []);

  const handle = useCallback((match: ScanMatch | null) => {
    const state = tracker.current;
    if (!match?.card) {
      state.misses++;
      state.mode = (state.mode + 1) % 3;
      state.candidate = null;
      state.hits = 0;
      // the card has left the outline: the same card can be counted again
      if (state.misses >= 2) {
        state.held = null;
        setHint("Point the camera at a card and fill the outline");
      }
      return;
    }
    state.misses = 0;
    if (state.candidate === match.card.id) state.hits++;
    else {
      state.candidate = match.card.id;
      state.hits = 1;
    }
    const sure = match.by === "printing" && match.score >= 0.85;
    if (state.hits < 2 && !sure) {
      if (state.held !== match.card.oracle_id) setHint(`Reading ${match.card.name}`);
      return;
    }
    if (state.held === match.card.oracle_id) return;
    state.held = match.card.oracle_id;
    accept(match.card);
  }, [accept]);

  // the scanning loop: about twice a second while the camera and text recognition are ready
  useEffect(() => {
    if (engine !== "ready") return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const started = performance.now();
        const element = camera.video.current;
        const box = frame.current;
        const paused = document.hidden || isDialogOpen() || live.current.listOpen;
        const testing = !!window.__manaVaultScanText;
        if (!paused && box && element && (testing || (camera.ready && element.videoWidth))) {
          try {
            const card = guideInVideo(element.videoWidth || 1, element.videoHeight || 1, box.clientWidth || 1, box.clientHeight || 1);
            // after a read that finds no card, the next read tries wider areas, then a smaller card in the middle
            const modes = ["card", "wide", "small"] as const;
            const text = await readCard(element, card, modes[tracker.current.mode]);
            const match = text && (text.lines.length || text.info.trim()) ? await matchText(text.lines, text.info) : null;
            if (!stopped) handle(match);
          } catch (reason) {
            if (!stopped) setHint(`Scanning stopped for a moment: ${message(reason)}`);
          }
        }
        await sleep(Math.max(120, 450 - (performance.now() - started)));
      }
    })();
    return () => { stopped = true; };
  }, [engine, camera.ready, camera.video, handle]);

  useEffect(() => {
    if (phone) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDialogOpen()) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phone, onClose]);

  const tapFocus = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setFocus({ x, y, id: Date.now() });
    void camera.focusAt(x / rect.width, y / rect.height);
  };

  const openSettings = () => dialog("Scanner settings", [
    ["vibrate", "Vibrate when a card is added", prefs.scanVibrate, "check"],
    ["foil", "New scans are foil", prefs.scanFoil, "check"],
    ["camera", "Camera", prefs.scanCamera, "select", [["environment", "Back camera"], ["user", "Front camera"]]],
  ], (values) => {
    store.setPrefs({ scanVibrate: values.vibrate === true, scanFoil: values.foil === true, scanCamera: values.camera === "user" ? "user" : "environment" });
    store.flash("Scanner settings saved");
  }, "Save");

  const status = camera.status || hint;
  const count = scanCount(store.scanItems);
  const last = store.scanItems[0] ?? null;

  const view = (
    <div className="scancam" ref={frame} onPointerUp={tapFocus}>
      <video ref={camera.video} autoPlay playsInline muted aria-label="Live camera preview" />
      {guide && <div className="scanguide" aria-hidden="true" style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }}><i /><i /><i /><i /></div>}
      {focus && <div className="scanfocus" key={focus.id} style={{ left: focus.x - 30, top: focus.y - 30 }} aria-hidden="true" />}
      <p className="scanstatus" role="status">{status}</p>
      <div className="scantools">
        {phone && (
          <button type="button" className="scantool" aria-label="Scanned list" title="Scanned list" onClick={() => setListOpen(true)}>
            <Icon name="listin" />{count > 0 && <span className="cbadge">{count}</span>}
          </button>
        )}
        <button type="button" className={camera.torch ? "scantool on" : "scantool"} aria-label="Torch" title={camera.torch === null ? "Torch (this camera has none)" : "Torch"}
          aria-pressed={camera.torch === true} disabled={camera.torch === null} onClick={() => void camera.toggleTorch()}>
          <Icon name="torch" />
        </button>
        <button type="button" className="scantool" aria-label="Scanner settings" title="Scanner settings" onClick={openSettings}><Icon name="gear" /></button>
      </div>
    </div>
  );

  const strip = last && <LastCard item={last} onOpen={phone ? () => setListOpen(true) : undefined} />;

  if (phone) {
    return (
      <div className="scanphone">
        {view}
        {strip}
        {listOpen && (
          <div className="sheetwrap" onMouseDown={(event) => { if (event.target === event.currentTarget) setListOpen(false); }}>
            <section className="sheet scansheet" role="dialog" aria-modal="true" aria-label="Scanned list">
              <ScanList onClose={() => setListOpen(false)} />
            </section>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="scanner-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="scanwin" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="dlghead scanhead"><span id="scanner-title">Scan cards</span><button type="button" className="btn small" onClick={onClose}>Close</button></div>
        <div className="scanbody">
          <div className="scanleft">{view}{strip}</div>
          <div className="scanright"><ScanList /></div>
        </div>
      </section>
    </div>
  );
}

/** Opens the edit dialog for a scanned row: quantity, finish and printing. */
async function editItem(store: ReturnType<typeof useApp>, item: ScanItem) {
  let printings: ScanCard[] = [item.card];
  try {
    printings = await request<ScanCard[]>(`/api/cards/${encodeURIComponent(item.card.id)}/printings`);
  } catch (reason) {
    store.fail(reason, "Could not load the printings of this card.");
  }
  dialog(`Edit ${item.card.name}`, [
    ["quantity", "Quantity", String(item.quantity), "number"],
    ["finish", "Finish", item.foil ? "foil" : "regular", "select", [["regular", "Normal"], ["foil", "Foil"]]],
    ["printing", "Printing", item.card.id, "select", printings.map((card): [string, string] => [card.id, `${card.set_name} (${printingLabel(card)})${card.released_at ? `, ${card.released_at.slice(0, 4)}` : ""}`])],
  ], (values) => {
    const quantity = Number(values.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      store.flash("Enter a quantity from 1 to 999", "err");
      return false;
    }
    const card = printings.find((option) => option.id === values.printing) ?? item.card;
    const foil = values.finish === "foil";
    if (!hasFinish(card, foil)) {
      store.flash(`${printingLabel(card)} is not printed in ${foil ? "foil" : "a normal finish"}`, "err");
      return false;
    }
    store.updateScanItem(item.key, { quantity, card, foil });
  }, "Save");
}

function LastCard({ item, onOpen }: { item: ScanItem; onOpen?: () => void }) {
  const store = useApp();
  const other = !item.foil;
  return (
    <div className="scanlast">
      <button type="button" className="scanlastcard" onClick={onOpen} disabled={!onOpen} aria-label={onOpen ? "Open the scanned list" : undefined}>
        {item.card.image_url ? <img className="thumb-img" src={item.card.image_url} alt="" /> : <span className="thumb-img none">No image</span>}
        <span className="scanlastname"><b>{item.card.name}</b><span>{item.card.set_name} {printingLabel(item.card)}</span></span>
      </button>
      <div className="scanpill">
        <button type="button" className={item.foil ? "on" : ""} disabled={!hasFinish(item.card, other)}
          title={hasFinish(item.card, other) ? "Switch between normal and foil" : "This printing has one finish"}
          onClick={() => store.updateScanItem(item.key, { foil: other })}>{item.foil ? "Foil" : "Normal"}</button>
        <button type="button" title="Choose another printing" onClick={() => void editItem(store, item)}>{printingLabel(item.card)}</button>
        <button type="button" title="Add another copy" onClick={() => store.updateScanItem(item.key, { quantity: item.quantity + 1 })}>+1</button>
      </div>
    </div>
  );
}

function ScanList({ onClose }: { onClose?: () => void }) {
  const store = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const items = store.scanItems;
  const count = scanCount(items);

  // keeps the "minutes ago" times current
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const addByName = async (event: FormEvent) => {
    event.preventDefault();
    const text = name.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const match = await matchText([text], "");
      if (!match.card) {
        store.flash(`No card name is close to "${text}"`, "err");
        return;
      }
      store.addScanned(match.card, finishFor(match.card, store.prefs.scanFoil));
      store.flash(`${match.card.name} added to the scanned list`);
      setName("");
    } catch (reason) {
      store.fail(reason, "Could not look up that name.");
    } finally {
      setBusy(false);
    }
  };

  const addTo = () => {
    const targets = scanTargets(store.collections, store.decks);
    if (!targets.length) {
      store.flash("Create a collection first (Collection menu, New collection)", "err");
      return;
    }
    const preferred = targets.find((target) => target.kind === "collection" && target.id === store.prefs.targetCollection) ?? targets[0]!;
    const zone = store.prefs.zone === "main" ? "the main deck" : `the ${store.prefs.zone}`;
    dialog("Add scanned cards", [
      ["target", "Add to", `${preferred.kind}:${preferred.id}`, "select",
        targets.map((target): [string, string] => [`${target.kind}:${target.id}`, target.label])],
    ], async (values) => {
      const target = targets.find((option) => `${option.kind}:${option.id}` === values.target);
      if (!target) return false;
      const done = await store.addScannedTo(target, items);
      if (done) onClose?.();
    }, "Add", <p className="note">{`${count} card${count === 1 ? "" : "s"} are added as one undo step. Cards added to a deck go to ${zone}.`}</p>);
  };

  const clear = async () => {
    if (!items.length) return;
    if (await confirmDialog("Clear scanned list", `Remove all ${count} scanned card${count === 1 ? "" : "s"} from the list? Nothing has been added yet.`, "Clear")) {
      store.clearScanItems();
      store.flash("Scanned list cleared");
    }
  };

  return (
    <div className="scanlist">
      <div className="scanlisthead">
        <b>{count} card{count === 1 ? "" : "s"} scanned</b>
        {onClose && <button type="button" className="btn" onClick={onClose}>Close</button>}
      </div>
      <form className="scanadd" onSubmit={(event) => void addByName(event)}>
        <input className="search" value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a card by name" aria-label="Add a card by name" maxLength={120} />
        <button type="submit" className="btn" aria-label="Add by name" title="Add by name" disabled={busy || !name.trim()}><b>+</b></button>
      </form>
      <div className="scanrows">
        {!items.length && <p className="note scanempty">Scanned cards appear here. Nothing is added to a collection or deck until you choose Add to.</p>}
        {items.map((item) => (
          <div className="row scanrow" key={item.key} data-key={item.key}>
            {item.card.image_url ? <img className="thumb-img" src={item.card.image_url} alt="" /> : <span className="thumb-img none">No image</span>}
            <div className="scanrowtext">
              <b>{item.quantity}x {item.card.name}</b>
              <span>{item.card.set_name} {printingLabel(item.card)} {item.foil ? <span className="badge foil">Foil</span> : <span className="badge">Normal</span>}</span>
              <span className="muted">{timeAgo(item.at)}</span>
            </div>
            <button type="button" className="btn small" aria-label={`Edit ${item.card.name}`} title="Edit" onClick={() => void editItem(store, item)}><Icon name="rename" /></button>
            <button type="button" className="btn small" aria-label={`Remove ${item.card.name}`} title="Remove" onClick={() => store.removeScanItem(item.key)}><Icon name="del" /></button>
          </div>
        ))}
      </div>
      <div className="scanlistfoot">
        <button type="button" className="btn" onClick={() => void clear()} disabled={!items.length}><Icon name="clear" /> Clear</button>
        <button type="button" className="btn primary" onClick={addTo} disabled={!items.length}>Add to...</button>
      </div>
    </div>
  );
}
