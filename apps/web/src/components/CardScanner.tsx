// ---------- card scanner: live camera, continuous recognition, and the scanned list ----------
import { currentOpening, packLabel, useActiveOpening } from "../purchase-state";
import { goNextPack } from "../live";
import { choices, Picker } from "./Picker";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { request } from "../api";
import { isApp, native } from "../android/platform";
import { Icon } from "../icons";
import { guideBox, guideInVideo, loadRecognizer, readCard } from "../recognize";
import { finishCode, finishFor, hasFinish, matchText, scanCount, type ScanCard, type ScanDestination, type ScanItem, type ScanMatch } from "../scan-state";
import { type Store, useApp } from "../store";
import { CONDITIONS, type CardDetail, LANGUAGES, money, priceOf, type SetInfo } from "../types";
import { closeDialog, confirmDialog, customDialog, dialog, isDialogOpen } from "./Dialog";
import { Suggest } from "./Suggest";
import { SetIcon } from "./CardMarks";
import { deliverPurchaseScan, finishPurchaseScan, scanningForPurchase } from "./PurchaseDialogs";

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

const TORCH_CAMERA = "mana-vault.torchCamera";
const savedCamera = () => { try { return window.localStorage.getItem(TORCH_CAMERA); } catch { return null; } };
const saveCamera = (id: string) => { try { window.localStorage.setItem(TORCH_CAMERA, id); } catch { /* kept for this visit only */ } };

/**
 * Live camera with continuous autofocus, tap to focus and the light. Phones with several back cameras often give the
 * browser one without a light, so the back cameras are tried until one with a light is found; that camera is remembered.
 */
function useCamera(facing: "environment" | "user") {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState("Starting camera");
  const [note, setNote] = useState("");
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const noteTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setReady(false);
    setTorch(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera access is unavailable. Open Mana Vault over HTTPS (or localhost), or add cards by name.");
      return;
    }
    setStatus("Starting camera");
    const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const open = (deviceId?: string | null) => navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: facing }, ...size }, audio: false,
    });
    const hasTorch = (camera: MediaStream) => !!((camera.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as Capabilities).torch;
    (async () => {
      let camera: MediaStream;
      const remembered = facing === "environment" ? savedCamera() : null;
      try {
        camera = await open(remembered);
      } catch (reason) {
        if (!remembered) throw reason;
        camera = await open();
      }
      // look for a back camera with a light
      if (facing === "environment" && !hasTorch(camera) && navigator.mediaDevices.enumerateDevices) {
        const current = camera.getVideoTracks()[0]?.getSettings?.().deviceId;
        const devices = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === "videoinput" && device.deviceId && device.deviceId !== current && !/front|user|facetime/i.test(device.label));
        for (const device of devices) {
          if (!active) break;
          camera.getTracks().forEach((item) => item.stop());
          try {
            const other = await open(device.deviceId);
            if (hasTorch(other)) {
              camera = other;
              saveCamera(device.deviceId);
              break;
            }
            other.getTracks().forEach((item) => item.stop());
          } catch {
            // that camera cannot be opened; try the next
          }
          camera = await open(current);
        }
      }
      return camera;
    })().then(async (camera) => {
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
      if (isApp() && torchOnRef.current) void native().setTorch?.({ on: false }).catch(() => undefined);
    };
  }, [facing]);

  const torchOnRef = useRef(false);
  torchOnRef.current = torch;

  const showNote = useCallback((text: string) => {
    window.clearTimeout(noteTimer.current);
    setNote(text);
    noteTimer.current = window.setTimeout(() => setNote(""), 4000);
  }, []);

  /** The light: through the camera when it offers one, otherwise through the Android app. */
  const toggleTorch = useCallback(async () => {
    const next = !torch;
    const current = track.current;
    if (current) {
      try {
        await current.applyConstraints(advanced({ torch: next }));
        const settings = current.getSettings?.() as MediaTrackSettings & { torch?: boolean };
        const caps = (current.getCapabilities?.() ?? {}) as Capabilities;
        if (caps.torch || settings?.torch === next) {
          setTorch(next);
          return;
        }
      } catch {
        // this camera has no light of its own; the app may still reach one
      }
    }
    if (isApp() && native().setTorch) {
      const result = await native().setTorch!({ on: next }).catch(() => ({ ok: false, reason: "busy" }));
      if (result.ok) {
        setTorch(next);
        return;
      }
      showNote(result.reason === "none" ? "This camera has no light" : "The light could not be turned on while the camera is in use");
      return;
    }
    showNote("This camera has no light");
  }, [torch, showNote]);

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

  return { video, status, note, ready, torch, toggleTorch, focusAt };
}

// mode: which areas the next read uses; it stays while reads find a card and moves on after a miss
type Tracker = { candidate: string | null; hits: number; misses: number; held: string | null; mode: number };
type Picker = { name: string; options: ScanCard[] };

/** A short tone when a card is added. */
function beep() {
  try {
    const AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.frequency.value = 880;
    volume.gain.setValueAtTime(0.08, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);
    tone.connect(volume).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + 0.16);
    tone.onended = () => void context.close();
  } catch {
    // no sound is fine
  }
}

/** The printings a scan may become under the scanner's set and promo filters, newest first. */
export function allowedPrintings(options: ScanCard[], sets: string[], ignorePromos: boolean): ScanCard[] {
  return options.filter((card) => (!sets.length || sets.includes(card.set_code)) && (!ignorePromos || !card.promo));
}

export default function CardScanner({ phone = false, onClose }: { phone?: boolean; onClose: () => void }) {
  const store = useApp();
  const { prefs } = store;
  // a scanner opened from a purchase window gives the purchase window back when it closes
  useEffect(() => () => finishPurchaseScan(), []);
  const camera = useCamera(prefs.scanCamera);
  const frame = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState("Loading text recognition");
  const [engine, setEngine] = useState<"loading" | "ready" | "failed">("loading");
  const [listOpen, setListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [warning, setWarning] = useState("");
  const [guide, setGuide] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; id: number } | null>(null);
  const tracker = useRef<Tracker>({ candidate: null, hits: 0, misses: 0, held: null, mode: 0 });
  const live = useRef({ store, listOpen, settingsOpen, picker });
  live.current = { store, listOpen, settingsOpen, picker };

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

  /** Adds a printing to the scanned list with the copy details chosen in the bottom strip and settings. */
  const accept = useCallback((card: ScanCard) => {
    const current = live.current.store;
    const { prefs: settings } = current;
    current.addScanned(card, finishFor(card, settings.scanFoil), 1, { condition: settings.scanCondition, language: settings.scanLanguage, proxy: settings.scanProxy });
    if (settings.scanVibrate) navigator.vibrate?.(60);
    if (settings.scanSounds) beep();
    setWarning("");
    setHint(`Added ${card.name}`);
  }, []);

  /** A card was read: check it against the set filter, then add it, or ask which printing when more than one fits. */
  const resolve = useCallback(async (match: ScanMatch) => {
    const card = match.card!;
    const { scanSets: sets, scanIgnorePromos: ignorePromos, scanQuick: quick } = live.current.store.prefs;
    if (match.by === "printing") {
      if (sets.length && !sets.includes(card.set_code)) {
        setWarning(`Not in set: ${card.name} (${card.set_code.toUpperCase()})`);
        return;
      }
      accept(card);
      return;
    }
    let options: ScanCard[] = [card];
    try {
      options = await request<ScanCard[]>(`/api/cards/${encodeURIComponent(card.id)}/printings`);
    } catch {
      options = [card];
    }
    const allowed = allowedPrintings(options, sets, ignorePromos);
    if (!allowed.length) {
      setWarning(`Not in set: ${card.name}`);
      return;
    }
    if (allowed.length === 1 || quick) accept(allowed[0]!);
    else setPicker({ name: card.name, options: allowed });
  }, [accept]);

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
    void resolve(match);
  }, [resolve]);

  // the scanning loop: about twice a second while the camera and text recognition are ready
  useEffect(() => {
    if (engine !== "ready") return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const started = performance.now();
        const element = camera.video.current;
        const box = frame.current;
        const { listOpen: list, settingsOpen: settings, picker: choosing, store: current } = live.current;
        const paused = document.hidden || isDialogOpen() || list || settings || !!choosing || !!current.cardPage;
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
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isDialogOpen()) return;
      if (live.current.picker) setPicker(null);
      else if (live.current.settingsOpen) setSettingsOpen(false);
      else if (!phone && !live.current.store.contextMenu) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phone, onClose]);

  const tapFocus = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, .scanpicker, .scansettings")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setFocus({ x, y, id: Date.now() });
    void camera.focusAt(x / rect.width, y / rect.height);
  };

  const filters = prefs.scanSets.length + (prefs.scanIgnorePromos ? 1 : 0);
  // the active opening (0.18.0): scanned cards added to its collection are tied to it
  const opening = useActiveOpening();
  const status = camera.status || camera.note || warning || hint;
  const count = scanCount(store.scanItems);
  const last = store.scanItems[0] ?? null;
  const total = useMemo(() => store.scanItems.reduce((sum, item) => sum + (item.proxy ? 0 : (priceOf({
    price_usd: item.card.price_usd ?? null, price_usd_foil: item.card.price_usd_foil ?? null, price_usd_etched: item.card.price_usd_etched ?? null,
  }, finishCode(item), prefs.currency) ?? 0) * item.quantity), 0), [store.scanItems, prefs.currency]);

  const view = (
    <div className="scancam" ref={frame} onPointerUp={tapFocus}>
      <video ref={camera.video} autoPlay playsInline muted aria-label="Live camera preview" />
      {guide && <div className="scanguide" aria-hidden="true" style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }}><i /><i /><i /><i /></div>}
      {focus && <div className="scanfocus" key={focus.id} style={{ left: focus.x - 30, top: focus.y - 30 }} aria-hidden="true" />}
      <p className={warning && !camera.status ? "scanstatus warn" : "scanstatus"} role="status">{status}</p>
      {prefs.scanShowTotal && <p className="scantotal">{money(total, prefs.currency)}</p>}
      {opening && (
        <p className="scanopening" role="note">Scanning into: {opening.name}{packLabel(opening) ? ` (${packLabel(opening)})` : ""}
          {opening.hasNext && <button type="button" className="btn small" onClick={(event) => { event.stopPropagation(); void goNextPack(store); }}>Next pack</button>}</p>
      )}
      <div className="scanrail">
        <div className="scantools">
          {phone && (
            <button type="button" className="scantool" aria-label="Scanned list" title="Scanned list" onClick={() => setListOpen(true)}>
              <Icon name="listin" />{count > 0 && <span className="cbadge">{count}</span>}
            </button>
          )}
          <button type="button" className={camera.torch ? "scantool on" : "scantool"} aria-label="Torch" title="Torch"
            aria-pressed={camera.torch} disabled={!camera.ready} onClick={() => void camera.toggleTorch()}>
            <Icon name="torch" />
          </button>
          <button type="button" className="scantool" aria-label="Scanner settings" title="Scanner settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="gear" />{filters > 0 && <span className="cbadge">{filters}</span>}
          </button>
        </div>
        {prefs.scanSets.map((code) => (
          <button key={code} type="button" className="scanlock" title={`Only cards from ${code.toUpperCase()}`} onClick={() => setSettingsOpen(true)}>
            {code.toUpperCase()} <span aria-hidden="true">🔒</span>
          </button>
        ))}
        {prefs.scanProxy && <span className="scanlock proxy">PROXY</span>}
      </div>
      {picker && <PrintingPicker picker={picker} onPick={(card) => { setPicker(null); accept(card); }} onClose={() => { setPicker(null); setHint("Point the camera at a card and fill the outline"); }} />}
      {settingsOpen && <ScanSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );

  const strip = (
    <>
      {last && <LastCard item={last} />}
      <NextStrip />
    </>
  );

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

/** Which printing a scan is: a row of card pictures over the lower half of the camera. */
function PrintingPicker({ picker, onPick, onClose }: { picker: Picker; onPick: (card: ScanCard) => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const words = filter.trim().toLowerCase();
  const shown = picker.options.filter((card) => !words || `${card.set_name} ${card.set_code}`.toLowerCase().includes(words));
  return (
    <div className="scanpicker" role="dialog" aria-label={`Choose the printing of ${picker.name}`}>
      <div className="scanpickhead">
        <input className="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter sets" aria-label="Filter sets" />
        <button type="button" className="btn small" onClick={onClose} aria-label="Skip this card">Skip</button>
      </div>
      <div className="scanpickrow">
        {shown.map((card) => (
          <button key={card.id} type="button" className="scanpick" onClick={() => onPick(card)} aria-label={`${card.set_name} ${card.set_code.toUpperCase()} ${card.collector_number}`}>
            {card.image_url ? <img src={card.image_url} alt="" /> : <span className="scanpickname">{card.name}</span>}
            <span className="scanpicklabel">{card.set_name} ({card.set_code.toUpperCase()}) #{card.collector_number}</span>
          </button>
        ))}
        {!shown.length && <p className="note">No set matches</p>}
      </div>
    </div>
  );
}

/** Scanner settings: how scans are matched, what is added, and what the camera screen shows. */
function ScanSettings({ onClose }: { onClose: () => void }) {
  const store = useApp();
  const { prefs } = store;
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState<SetInfo[]>([]);
  useEffect(() => {
    if (!query.trim()) {
      setSets([]);
      return;
    }
    const timer = window.setTimeout(() => {
      request<SetInfo[]>(`/api/sets?q=${encodeURIComponent(query.trim())}`).then(setSets).catch(() => setSets([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const check = (key: "scanQuick" | "scanSounds" | "scanVibrate" | "scanProxy" | "scanIgnorePromos" | "scanFoil" | "scanShowTotal" | "scanShowOwned", label: string) => (
    <label className="scancheck"><input type="checkbox" checked={prefs[key]} onChange={(event) => store.setPrefs({ [key]: event.target.checked })} /><span>{label}</span></label>
  );
  return (
    <div className="scansettings" role="dialog" aria-label="Scanner settings">
      <div className="scanpickhead"><b>Settings</b><button type="button" className="btn small" onClick={onClose}>Done</button></div>
      <div className="scansetbody">
        {check("scanQuick", "Quick mode (takes the first matching printing)")}
        {check("scanSounds", "Play sounds")}
        {check("scanVibrate", "Vibrate")}
        {check("scanProxy", "Mark as proxy")}
        <label className="scanselect">Camera
          <Picker label="Camera" value={prefs.scanCamera} onChange={(value) => store.setPrefs({ scanCamera: value === "user" ? "user" : "environment" })}
            options={choices([["environment", "Back camera"], ["user", "Front camera"]])} />
        </label>
        <h4>Filters</h4>
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Set" aria-label="Find a set" />
        {sets.length > 0 && (
          <div className="scansetlist">
            {sets.slice(0, 30).map((set) => (
              <button key={set.code} type="button" className="pmrow" onClick={() => {
                if (!prefs.scanSets.includes(set.code)) store.setPrefs({ scanSets: [...prefs.scanSets, set.code] });
                setQuery("");
              }}><SetIcon code={set.code} />{set.name} <span className="badge">{set.code.toUpperCase()}</span></button>
            ))}
          </div>
        )}
        <div className="chips">
          {prefs.scanSets.map((code) => (
            <span className="chip" key={code}>{code.toUpperCase()}
              <button type="button" aria-label={`Remove ${code.toUpperCase()}`} onClick={() => store.setPrefs({ scanSets: prefs.scanSets.filter((item) => item !== code) })}>×</button></span>
          ))}
        </div>
        {check("scanIgnorePromos", "Ignore promos")}
        {check("scanFoil", "Prefer foil if possible")}
        <h4>On screen</h4>
        {check("scanShowTotal", "Display total value")}
        {check("scanShowOwned", "Display copies in collection")}
      </div>
    </div>
  );
}

/** The finish, condition and language the next scans get, and +1 for the last card. */
function NextStrip() {
  const store = useApp();
  const { prefs } = store;
  const last = store.scanItems[0] ?? null;
  return (
    <div className="scanstrip" role="group" aria-label="Next scans">
      <button type="button" className={prefs.scanFoil ? "on" : ""} aria-pressed={prefs.scanFoil} title="Normal or foil for the next scans"
        onClick={() => store.setPrefs({ scanFoil: !prefs.scanFoil })}>{prefs.scanFoil ? "Foil" : "Normal"}</button>
      <Picker label="Condition for the next scans" value={prefs.scanCondition} onChange={(value) => store.setPrefs({ scanCondition: value })}
        options={CONDITIONS.map(([code, name]) => ({ value: code, label: code, detail: name }))} />
      <Picker label="Language for the next scans" value={prefs.scanLanguage} onChange={(value) => store.setPrefs({ scanLanguage: value })}
        options={LANGUAGES.map(([code, name]) => ({ value: code, label: code.toUpperCase(), detail: name }))} />
      <button type="button" disabled={!last} title="Add another copy of the last card" onClick={() => last && store.updateScanItem(last.key, { quantity: last.quantity + 1 })}>+1</button>
    </div>
  );
}

/** Opens the edit dialog for a scanned row: quantity, finish, printing, condition, language and proxy. */
async function editItem(store: Store, item: ScanItem) {
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
    ["condition", "Condition", item.condition ?? "NM", "select", CONDITIONS],
    ["language", "Language", item.language ?? "en", "select", LANGUAGES],
    ["proxy", "Proxy", !!item.proxy, "check"],
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
    store.updateScanItem(item.key, { quantity, card, foil, condition: String(values.condition), language: String(values.language), proxy: values.proxy === true });
  }, "Save");
}

function LastCard({ item }: { item: ScanItem }) {
  const store = useApp();
  const [owned, setOwned] = useState<number | null>(null);
  const show = store.prefs.scanShowOwned;
  useEffect(() => {
    if (!show) return;
    let active = true;
    request<CardDetail>(`/api/cards/${encodeURIComponent(item.card.id)}`).then((detail) => { if (active) setOwned(detail.owned.allPrintings); }).catch(() => setOwned(null));
    return () => { active = false; };
  }, [show, item.card.id, store.collections]);
  return (
    <div className="scanlast">
      <button type="button" className="scanlastcard" onClick={() => store.setCardPage(item.card.id)} aria-label={`Open ${item.card.name}`}>
        {item.card.image_url ? <img className="thumb-img" src={item.card.image_url} alt="" /> : <span className="thumb-img none">No image</span>}
        <span className="scanlastname"><b>{item.quantity}x {item.card.name}</b><span>{item.card.set_name} {printingLabel(item.card)}
          {item.foil ? " Foil" : ""}{item.proxy ? " Proxy" : ""}{show && owned !== null ? `, ${owned} in collection` : ""}</span></span>
      </button>
      <button type="button" className="btn small scanedit" aria-label={`Edit ${item.card.name}`} onClick={() => void editItem(store, item)}><Icon name="rename" /><span>Edit</span></button>
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
      store.addScanned(match.card, finishFor(match.card, store.prefs.scanFoil), 1,
        { condition: store.prefs.scanCondition, language: store.prefs.scanLanguage, proxy: store.prefs.scanProxy });
      store.flash(`${match.card.name} added to the scanned list`);
      setName("");
    } catch (reason) {
      store.fail(reason, "Could not look up that name.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!items.length) return;
    if (await confirmDialog("Clear scanned list", `Remove all ${count} scanned card${count === 1 ? "" : "s"} from the list?`, "Clear")) {
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
        <Suggest className="search" mode="name" value={name} onValue={setName} placeholder="Add a card by name" aria-label="Add a card by name" maxLength={120} />
        <button type="submit" className="btn" aria-label="Add by name" title="Add by name" disabled={busy || !name.trim()}><b>+</b></button>
      </form>
      <div className="scanrows">
        {!items.length && <p className="note scanempty">No cards scanned</p>}
        {items.map((item) => (
          <div className="row scanrow" key={item.key} data-key={item.key} onClick={() => store.setCardPage(item.card.id)}>
            {item.card.image_url ? <img className="thumb-img" src={item.card.image_url} alt="" /> : <span className="thumb-img none">No image</span>}
            <div className="scanrowtext">
              <b>{item.quantity}x {item.card.name}</b>
              <span>{item.card.set_name} {printingLabel(item.card)} {item.foil ? <span className="badge foil">Foil</span> : <span className="badge">Normal</span>}
                {item.condition && item.condition !== "NM" && <span className="badge">{item.condition}</span>}
                {item.language && item.language !== "en" && <span className="badge">{item.language.toUpperCase()}</span>}
                {item.proxy && <span className="badge proxy">PROXY</span>}</span>
              <span className="muted">{timeAgo(item.at)}</span>
            </div>
            <button type="button" className="btn small" aria-label={`Edit ${item.card.name}`} title="Edit" onClick={(event) => { event.stopPropagation(); void editItem(store, item); }}><Icon name="rename" /></button>
            <button type="button" className="btn small" aria-label={`Remove ${item.card.name}`} title="Remove" onClick={(event) => { event.stopPropagation(); store.removeScanItem(item.key); }}><Icon name="del" /></button>
          </div>
        ))}
      </div>
      <div className="scanlistfoot">
        <button type="button" className="btn" onClick={() => void clear()} disabled={!items.length}><Icon name="clear" /> Clear</button>
        <button type="button" className="btn primary" onClick={() => addToWindow(store, items, onClose)} disabled={!items.length}>Add to...</button>
      </div>
    </div>
  );
}

const NEW_COLLECTION = "new-collection";
const PURCHASE = "purchase:this";
const NEW_DECK = "new-deck";
const DECK_COLLECTION = "deck-collection";

/**
 * Where the scanned cards go: a collection or a deck, or a new one of either. A deck also asks which collection
 * receives the copies, filled in with the one used for that deck last time.
 */
function AddToWindow({ items, done }: { items: ScanItem[]; done: () => void }) {
  const store = useApp();
  const collections = (store.collections ?? []).filter((item) => item.kind === "collection" || items.every((scan) => !scan.proxy));
  const owned = collections.filter((item) => item.kind === "collection");
  // an active opening (0.18.0) fills in its collection, so scanned pulls are tied to it
  const opening = currentOpening();
  const openingCollection = opening?.collectionId && collections.some((item) => item.id === opening.collectionId) ? opening.collectionId : null;
  const preferred = openingCollection ?? collections.find((item) => item.id === store.prefs.targetCollection)?.id ?? collections[0]?.id ?? NEW_COLLECTION;
  // the collection or deck selected last is filled in
  const forPurchase = scanningForPurchase();
  const [target, setTarget] = useState(forPurchase ? PURCHASE : openingCollection ? `collection:${openingCollection}` : store.prefs.addTo === "deck" && store.deck ? `deck:${store.deck.id}` : `collection:${preferred}`);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, id] = target.split(":") as ["collection" | "deck", string];
  const deck = kind === "deck" ? store.decks.find((item) => item.id === id) ?? null : null;
  const deckName = deck?.name ?? name.trim();
  const remembered = deck?.collection_id && owned.some((item) => item.id === deck.collection_id) ? deck.collection_id : null;
  const [receiver, setReceiver] = useState<string>(remembered ?? DECK_COLLECTION);
  useEffect(() => { setReceiver(remembered ?? DECK_COLLECTION); }, [remembered, target]);
  const count = scanCount(items);

  const run = async () => {
    if (busy) return;
    if (target === PURCHASE) {
      closeDialog();
      deliverPurchaseScan(store, items);
      done();
      return;
    }
    setBusy(true);
    try {
      let destination: ScanDestination;
      if (kind === "collection") {
        let collectionId = id;
        if (id === NEW_COLLECTION) {
          if (!name.trim()) return store.flash("Enter a name for the new collection", "err");
          collectionId = (await store.createCollection({ name: name.trim(), description: "", completion: "none", finish: "any", kind: "collection", sets: [] })).id;
        }
        destination = { kind: "collection", id: collectionId, name: store.collectionName(collectionId) === "the collection" ? name.trim() : store.collectionName(collectionId) };
      } else {
        let deckId = id;
        if (id === NEW_DECK) {
          if (!name.trim()) return store.flash("Enter a name for the new deck", "err");
          deckId = (await store.createDeck(name.trim(), "casual", false)).id;
        }
        let collectionId = receiver;
        if (receiver === DECK_COLLECTION) {
          collectionId = (await store.createCollection({ name: deckName, description: "", completion: "none", finish: "any", kind: "collection", sets: [] })).id;
        }
        if (collectionId !== remembered) {
          await request(`/api/decks/${encodeURIComponent(deckId)}`, { method: "PATCH", body: JSON.stringify({ collectionId }) }).catch(() => undefined);
          await store.reloadDecks();
        }
        destination = { kind: "deck", id: deckId, name: deckName, collectionId, collectionName: store.collectionName(collectionId) };
      }
      if (await store.addScannedTo(destination, items)) {
        closeDialog();
        done();
      }
    } catch (reason) {
      store.fail(reason, "Could not add the scanned cards.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="iowin">
      <div className="prow"><label htmlFor="add-target">Add {count} to</label>
        <Picker id="add-target" label={`Add ${count} to`} value={target} onChange={setTarget} options={[
          ...(forPurchase ? [{ value: PURCHASE, label: "This purchase", group: "Purchase" }] : []),
          ...collections.map((item) => ({ value: `collection:${item.id}`, label: item.id === openingCollection ? `${item.name} (Opening: ${opening!.name})` : item.kind === "wishlist" ? `Wishlist: ${item.name}` : item.name, group: "Collections" })),
          { value: `collection:${NEW_COLLECTION}`, label: "New collection...", group: "Collections" },
          ...store.decks.map((item) => ({ value: `deck:${item.id}`, label: item.name, group: "Decks" })),
          { value: `deck:${NEW_DECK}`, label: "New deck...", group: "Decks" },
        ]} />
      </div>
      {(id === NEW_COLLECTION || id === NEW_DECK) && (
        <div className="prow"><label htmlFor="add-name">Name</label><input id="add-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></div>
      )}
      {kind === "deck" && (
        <div className="prow"><label htmlFor="add-receiver">Copies go into</label>
          <Picker id="add-receiver" label="Copies go into" value={receiver} onChange={setReceiver}
            options={[{ value: DECK_COLLECTION, label: `New collection: ${deckName || "named after the deck"}` }, ...owned.map((item) => ({ value: item.id, label: item.name }))]} />
        </div>
      )}
      <div className="btnrow end"><button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>Add</button></div>
    </div>
  );
}

function addToWindow(store: Store, items: ScanItem[], onClose?: () => void) {
  customDialog("Add scanned cards", () => <AddToWindow items={items} done={() => onClose?.()} />, 480, "Cancel");
  void store;
}
