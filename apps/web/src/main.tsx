import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Action, useActions } from "./actions";
import { request, SignedOutError } from "./api";
import CardScanner from "./components/CardScanner";
import { DialogHost, isDialogOpen } from "./components/Dialog";
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
          if (store.view === "about") store.closeAbout();
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
  const narrow = useNarrow();
  useKeyboard(store, actions);
  useEffect(() => watchSystemTheme(() => store.prefs.theme), [store.prefs.theme]);
  return (
    <StoreContext.Provider value={store}>
      {narrow ? <PhoneShell actions={actions} /> : <DesktopShell actions={actions} />}
      <DialogHost />
      {store.scannerOpen && (
        <CardScanner
          onClose={() => store.setScannerOpen(false)}
          onRecognized={(name) => {
            store.setScannerOpen(false);
            store.setView("cards");
            store.setFilters({ query: `name:"${name.replaceAll('"', "")}"` });
            store.flash(`Searching for ${name}. Check the results before adding a card.`);
          }}
        />
      )}
    </StoreContext.Provider>
  );
}

function Root() {
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

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}
