// ---------- trade dialogs: new, rename, complete, send and the share link ----------
import { customDialog, dialog } from "./Dialog";
import { type Store, useApp } from "../store";
import type { Trade } from "../trade-state";

/** The collections that can receive cards: owned or shared collections, not wishlists. */
const receivers = (store: Store) => (store.collections ?? []).filter((item) => item.kind !== "wishlist");
const defaultReceiver = (store: Store) => {
  const list = receivers(store);
  return list.find((item) => item.id === store.prefs.targetCollection)?.id ?? list[0]?.id ?? "";
};

export function newTradeDialog(store: Store) {
  dialog("New trade", [["name", "Name", `Trade ${new Date().toLocaleDateString()}`]], async (values) => {
    if (!String(values.name).trim()) { store.flash("Give the trade a name", "err"); return false; }
    await store.newTrade(String(values.name).trim());
  }, "Start trade");
}

export function renameTradeDialog(store: Store, trade: Trade) {
  dialog("Rename trade", [["name", "Name", trade.name]], async (values) => {
    if (!String(values.name).trim()) { store.flash("Give the trade a name", "err"); return false; }
    await store.renameTrade(trade, String(values.name).trim());
  }, "Rename");
}

export function completeTradeDialog(store: Store, trade: Trade) {
  const gets = trade.lines.some((line) => line.side === "get");
  const list = receivers(store);
  if (gets && !list.length) return store.flash("Create a collection for the cards you get first", "err");
  dialog(`Complete ${trade.name}`, gets ? [["into", "Cards you get go to", defaultReceiver(store), "select", list.map((item) => [item.id, item.name])]] : [],
    async (values) => { await store.completeTrade(trade, gets ? String(values.into) : null); }, "Complete trade", undefined, 480);
}

export async function sendTradeDialog(store: Store, trade: Trade) {
  let people;
  try {
    people = await store.loadUsers();
  } catch (reason) {
    return store.fail(reason, "Could not load the account list.");
  }
  if (!people.length) return store.flash("There are no other accounts on this server to send to", "err");
  const list = receivers(store);
  if (!list.length) return store.flash("Create a collection for the cards you get first", "err");
  dialog(`Send ${trade.name}`, [
    ["to", "Send to", String(trade.with?.id ?? people[0]!.id), "select", people.map((person) => [String(person.id), person.name])],
    ["into", "Cards you get go to", trade.collectionId ?? defaultReceiver(store), "select", list.map((item) => [item.id, item.name])],
  ], async (values) => { await store.sendTrade(trade, Number(values.to), String(values.into)); }, "Send", undefined, 480);
}

export function acceptTradeDialog(store: Store, trade: Trade) {
  const list = receivers(store);
  if (!list.length) return store.flash("Create a collection for the cards you get first", "err");
  dialog(`Accept ${trade.name}`, [["into", "Cards you get go to", trade.collectionId ?? defaultReceiver(store), "select", list.map((item) => [item.id, item.name])]],
    async (values) => { await store.acceptTrade(trade, String(values.into)); }, "Accept trade", undefined, 480);
}

/** The public link to your trade binder: the cards you marked for trade, readable without signing in. */
export function shareBinderDialog(store: Store) {
  void store.loadShare();
  customDialog("Share trade binder", () => <ShareBody />, 520);
}

function ShareBody() {
  const store = useApp();
  const token = store.shareToken;
  const url = token ? `${window.location.origin}/share/${token}` : "";
  return (
    <div className="sharebody">
      {token === undefined && <p className="note">Loading</p>}
      {token === null && <button type="button" className="btn primary" onClick={() => void store.makeShare()}>Make a link</button>}
      {token && (
        <>
          <input className="sharelink" readOnly value={url} aria-label="Share link" onFocus={(event) => event.target.select()} />
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={() => void navigator.clipboard.writeText(url).then(() => store.flash("Link copied"), () => store.flash("Could not copy to the clipboard", "err"))}>Copy link</button>
            <button type="button" className="btn" onClick={() => void store.makeShare()}>New link</button>
            <button type="button" className="btn" onClick={() => void store.stopShare()}>Turn off</button>
          </div>
        </>
      )}
    </div>
  );
}
