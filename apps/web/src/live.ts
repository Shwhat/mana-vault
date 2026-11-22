// ---------- live updates (0.18.0): changes made on another device or by someone sharing with you show at once ----------
import { useEffect, useRef } from "react";
import { CLIENT_ID } from "./api";
import { apiUrl, appSettings, isApp, saveSettings } from "./android/platform";
import { loadPrefs, prefsPending, type Prefs } from "./prefs";
import { currentOpening, type Opening, reloadOpening, setActiveOpening } from "./purchase-state";
import type { Store } from "./store";
import { confirmDialog } from "./components/Dialog";

export type ChangeArea = "library" | "decks" | "purchases" | "trades" | "inbox" | "prints" | "prefs" | "opening" | "other";
type ChangeEvent = { areas: ChangeArea[]; by: number; at: number; opening?: Opening | null };

/** Sent on the window when purchases changed elsewhere, so the Purchases view loads its list and entry again. */
export const PURCHASES_CHANGED = "mana-vault:purchases-changed";

/** Preferences that follow the account from device to device; where each device is working (open deck, target) does not. */
const SHARED_PREFS: Array<keyof Prefs> = [
  "theme", "cardLayout", "pricesOnPictures", "listGroups", "searchSort", "searchAllPrintings", "proxySheet", "workspaces",
  "scanVibrate", "scanFoil", "scanQuick", "scanSounds", "scanSets", "scanIgnorePromos", "scanProxy", "scanCondition", "scanLanguage", "scanShowTotal", "scanShowOwned",
];

/** Opens the scanner on the active opening: its collection becomes where cards go. */
export function startOpeningScan(store: Store) {
  const opening = currentOpening();
  if (!opening) return store.flash("No opening is active", "err");
  if (opening.collectionId) store.targetCollection(opening.collectionId);
  store.setPrefs({ addTo: "collection" });
  store.setCardPage(null);
  store.setScannerOpen(true);
  store.flash(`Scanning into ${opening.name}`);
}

/** Tells the phone's background check about the opening it already knows, so it does not offer it again. */
function rememberOpening(opening: Opening | null) {
  if (isApp() && appSettings().lastOpening !== (opening?.id ?? "")) void saveSettings({ lastOpening: opening?.id ?? "" }).catch(() => undefined);
}

/** A new opening started on another device: the app offers to start scanning into it. */
function offerScan(store: Store, opening: Opening) {
  if (!isApp() || store.scannerOpen) return;
  void confirmDialog("Opening started", `${opening.name} was opened on another device. Start scanning the cards into it?`, "Start scanning")
    .then((yes) => { if (yes) startOpeningScan(store); });
}

/** Listens to the server's change stream while the page or app is open, and loads what changed. */
export function useLiveUpdates(store: Store) {
  const live = useRef(store);
  live.current = store;
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let stopped = false;
    let retry: number | undefined;
    let wasOpen = false;
    const address = () => isApp()
      ? apiUrl(`/api/events?client=${CLIENT_ID}&device=${encodeURIComponent(appSettings().token)}`)
      : `/api/events?client=${CLIENT_ID}`;

    const apply = (event: ChangeEvent) => {
      const current = live.current;
      const areas = new Set(event.areas);
      if (areas.has("library") || areas.has("decks") || areas.has("purchases") || areas.has("trades") || areas.has("inbox")) {
        void current.refreshAfterChange();
        if (current.view === "cards") current.search.reload();
      }
      if (areas.has("inbox")) void current.reloadOffers();
      if (areas.has("trades")) void current.reloadTrades();
      if (areas.has("prints")) void current.loadPrintList();
      if (areas.has("purchases") || areas.has("opening")) window.dispatchEvent(new Event(PURCHASES_CHANGED));
      if (event.opening !== undefined) {
        const before = currentOpening();
        setActiveOpening(event.opening);
        rememberOpening(event.opening);
        if (event.opening && event.opening.id !== before?.id) offerScan(current, event.opening);
      } else if (areas.has("purchases")) {
        void reloadOpening();
      }
      if (areas.has("prefs") && !prefsPending()) {
        void loadPrefs().then((saved) => {
          if (prefsPending()) return;
          live.current.adoptPrefs(Object.fromEntries(SHARED_PREFS.map((key) => [key, saved[key]])) as Partial<Prefs>);
        });
      }
    };

    const connect = () => {
      if (stopped || (isApp() && !appSettings().token)) return;
      source = new EventSource(address(), { withCredentials: !isApp() });
      source.addEventListener("hello", (message) => {
        const hello = JSON.parse((message as MessageEvent<string>).data) as { opening: Opening | null };
        setActiveOpening(hello.opening);
        rememberOpening(hello.opening);
        // back after a dropped connection: load what may have changed meanwhile
        if (wasOpen) apply({ areas: ["library", "decks", "purchases", "trades", "inbox", "prints"], by: 0, at: Date.now() });
        wasOpen = true;
      });
      source.addEventListener("change", (message) => {
        try {
          apply(JSON.parse((message as MessageEvent<string>).data) as ChangeEvent);
        } catch {
          // a damaged message is skipped
        }
      });
      source.onerror = () => {
        // the browser tries again on its own; a closed stream (signed out, server restarted) is opened again here
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          retry = window.setTimeout(connect, 5000);
        }
      };
    };
    connect();
    // the app opened again from the background: the stream may have been stopped while it was away
    const visible = () => {
      if (document.visibilityState !== "visible" || !source || source.readyState !== EventSource.CLOSED) return;
      window.clearTimeout(retry);
      connect();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      source?.close();
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
}
