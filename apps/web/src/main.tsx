import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Action, useActions } from "./actions";
import { request, SignedOutError } from "./api";
import { AppSignIn, checkForUpdate, showSyncProblems } from "./android/AppScreens";
import { onSignedOut } from "./android/net";
import { PROBLEM_EVENT, startSync, SYNCED_EVENT, type SyncProblem } from "./android/offline";
import { clearSettings, isApp, loadSettings, native, signedIn, watchBackButton } from "./android/platform";
import CardScanner from "./components/CardScanner";
import { closeDialog, DialogHost, isDialogOpen } from "./components/Dialog";
import { DesktopShell, PhoneShell } from "./components/Shell";
import { applyTheme, loadPrefs, type Prefs, watchSystemTheme } from "./prefs";
import { type Store, StoreContext, useStoreState } from "./store";
import type { User } from "./types";
import "./style.css";

function useNarrow() {
  const query = "(max-width: 899px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setNarrow(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return narrow;
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable);
}

function useKeyboard(store: Store, actions: Record<string, Action>) {
  useEffect(() => {
    const run = (id: string) => {
      const action = actions[id];
      if (action && !action.disabled) action.run();
    };
    const onKey = (event: KeyboardEvent) => {
      if (isDialogOpen() || document.getElementById("dropdown") || store.scannerOpen) return;
      const typing = isTyping(event.target);
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && !event.altKey) {
        const key = event.key.toLowerCase();
        if (typing && (key === "z" || key === "y")) return;
        if (key === "z") { event.preventDefault(); run(event.shiftKey ? "redo" : "undo"); }
        else if (key === "y") { event.preventDefault(); run("redo"); }
        else if (key === "n") { event.preventDefault(); run("newDeck"); }
        else if (key === "o") { event.preventDefault(); run("openDeck"); }
        else if (key === "a" && !typing && store.view === "collection") { event.preventDefault(); run("pickAll"); }
        return;
      }
      if (typing || event.altKey) return;
      switch (event.key) {
        case "/": event.preventDefault(); run("find"); break;
        case "1": run("view.cards"); break;
        case "2": run("view.collection"); break;
        case "3": run("view.deck"); break;
        case "4": run("view.trade"); break;
        case "w": case "W": run("wishlist.add"); break;
        case "e": case "E": run("copy.details"); break;
        case "b": case "B": run("collection.binder"); break;
        case "t": case "T": run("trade.give"); break;
        case "g": case "G": run("trade.get"); break;
        case "PageDown": case "PageUp":
          if (store.view === "collection" && store.prefs.collectionLayout === "binder") {
            event.preventDefault();
            store.setBinderPage(Math.max(0, store.binderPage + (event.key === "PageDown" ? 1 : -1)));
          }
          break;
        case "f": case "F": run("foil"); break;
        case "z": case "Z": run("zone.cycle"); break;
        case "c": case "C": run("collection.target"); break;
        case "Delete":
          if (store.view === "collection" && store.checked.size) { event.preventDefault(); run("removePicked"); }
          break;
        case "Enter":
          if (!store.selection) return;
          event.preventDefault();
          run(event.shiftKey ? "addDeck" : "addCollection");
          break;
        case "ArrowDown": event.preventDefault(); store.moveSelection(1); break;
        case "ArrowUp": event.preventDefault(); store.moveSelection(-1); break;
        case "Escape":
          if (store.contextMenu) store.setContextMenu(null);
          else if (store.cardPage) store.setCardPage(null);
          else if (store.view === "about") store.closeAbout();
          else {
            store.select(null);
            store.setChecked(new Set());
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, actions]);
}

function App({ user, prefs }: { user: User; prefs: Prefs }) {
  const store = useStoreState(user, prefs);
  const actions = useActions(store);
  // the Android app always uses the phone layout
  const narrow = useNarrow() || isApp();
  useKeyboard(store, actions);
  useEffect(() => watchSystemTheme(() => store.prefs.theme), [store.prefs.theme]);
  useAppFeatures(store, actions);
  return (
    <StoreContext.Provider value={store}>
      {narrow ? <PhoneShell actions={actions} /> : <DesktopShell actions={actions} />}
      <DialogHost />
      {store.scannerOpen && !narrow && !store.cardPage && <CardScanner onClose={() => store.setScannerOpen(false)} />}
    </StoreContext.Provider>
  );
}

/** What the Android app adds: the Back button, sync results, offers opened from a notification and the update check. */
function useAppFeatures(store: Store, actions: Record<string, Action>) {
  const live = useRef(store);
  live.current = store;
  const liveActions = useRef(actions);
  liveActions.current = actions;
  useEffect(() => {
    if (!isApp()) return;
    const stopBack = watchBackButton({
      closeDialog: () => {
        if (!isDialogOpen()) return false;
        closeDialog();
        return true;
      },
      leaveView: () => {
        const current = live.current;
        if (current.contextMenu) current.setContextMenu(null);
        else if (current.cardPage) current.setCardPage(null);
        else if (current.scannerOpen) current.setScannerOpen(false);
        else if (current.view === "about") current.closeAbout();
        else if (current.view !== "home") current.setView("home");
        else return false;
        return true;
      },
    });
    const synced = () => { void live.current.refreshAfterChange(); void live.current.reloadOffers(); };
    const problems = (event: Event) => showSyncProblems((event as CustomEvent<SyncProblem[]>).detail);
    window.addEventListener(SYNCED_EVENT, synced);
    window.addEventListener(PROBLEM_EVENT, problems);
    void native().takeLaunchOffer().then(({ offer }) => { if (offer) void live.current.reloadOffers().then(() => liveActions.current.inbox?.run()); }).catch(() => undefined);
    let offerHandle: { remove: () => Promise<void> } | null = null;
    void native().addListener("offer", () => { void live.current.reloadOffers().then(() => liveActions.current.inbox?.run()); })
      .then((handle) => { offerHandle = handle; }).catch(() => undefined);
    void checkForUpdate();
    return () => {
      stopBack();
      void offerHandle?.remove();
      window.removeEventListener(SYNCED_EVENT, synced);
      window.removeEventListener(PROBLEM_EVENT, problems);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The Android app: the sign-in screen until this phone is signed in, then the app with sync. */
function AppRoot() {
  const [ready, setReady] = useState<"loading" | "signin" | "app">("loading");
  useEffect(() => {
    void loadSettings().then(() => setReady(signedIn() ? "app" : "signin"));
    return onSignedOut(() => {
      void clearSettings().then(() => setReady("signin"));
    });
  }, []);
  useEffect(() => {
    if (ready === "app") startSync();
  }, [ready]);
  if (ready === "loading") return <div className="bootmsg">Loading Mana Vault</div>;
  if (ready === "signin") return <AppSignIn onDone={() => window.location.reload()} />;
  return <WebRoot />;
}

function Root() {
  return isApp() ? <AppRoot /> : <WebRoot />;
}

function WebRoot() {
  const [boot, setBoot] = useState<{ user: User; prefs: Prefs } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([request<User>("/api/me"), loadPrefs()])
      .then(([user, prefs]) => {
        applyTheme(prefs.theme);
        setBoot({ user, prefs });
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof SignedOutError)) setError(reason instanceof Error ? reason.message : "Mana Vault could not start.");
      });
  }, []);
  if (error) return <div className="bootmsg err">{error} <button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button></div>;
  if (!boot) return <div className="bootmsg">Loading Mana Vault</div>;
  return <App user={boot.user} prefs={boot.prefs} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD && !isApp()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}
