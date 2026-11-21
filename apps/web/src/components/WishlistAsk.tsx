// ---------- which wishlist to lower (0.17.0): a card added that is on more than one wishlist lowers the one the person
// chooses, or none. A batch of cards asks once, one line per card. ----------
import { useEffect, useState } from "react";
import { request } from "../api";
import type { WishChange } from "../library-state";
import { type Store, useApp } from "../store";
import { customDialog } from "./Dialog";
import { Picker } from "./Picker";

export type WishAsk = { cardId: string; name: string; quantity: number; wishlists: Array<{ collectionId: string; name: string; wanted: number }> };
const EVENT = "mana-vault:wishask";

/** Asks which wishlist the cards added lower (the window opens from WishAskHost). */
export function askWishlists(ask: WishAsk[] | undefined) {
  if (ask?.length) window.dispatchEvent(new CustomEvent(EVENT, { detail: ask }));
}

function WishChoice({ store, ask, close }: { store: Store; ask: WishAsk[]; close: () => void }) {
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(ask.map((item) => [item.cardId, item.wishlists[0]!.collectionId])));
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    const items = ask.filter((item) => chosen[item.cardId] && chosen[item.cardId] !== "none")
      .map((item) => ({ cardId: item.cardId, quantity: item.quantity, collectionId: chosen[item.cardId] }));
    if (!items.length) { close(); return; }
    try {
      const { wishlist } = await request<{ wishlist: WishChange[] }>("/api/wishlists/lower", { method: "POST", body: JSON.stringify({ items }) });
      store.pushUndo({
        label: "Lower wishlists",
        undo: async () => { await store.restoreWishes(wishlist, "before"); await store.refreshAfterChange(); },
        redo: async () => { await store.restoreWishes(wishlist, "after"); await store.refreshAfterChange(); },
      });
      close();
      await store.refreshAfterChange();
      store.flash(`${wishlist.length} wishlist ${wishlist.length === 1 ? "entry" : "entries"} lowered`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not lower the wishlist.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <p className="dlgq">{ask.length === 1 ? "This card is" : "These cards are"} on more than one wishlist. Which wishlist should each lower?</p>
      <table className="dtable">
        <tbody>
          {ask.map((item) => (
            <tr key={item.cardId}>
              <td><b>{item.quantity}x {item.name}</b></td>
              <td><Picker label={`Wishlist for ${item.name}`} value={chosen[item.cardId] ?? "none"} onChange={(value) => setChosen({ ...chosen, [item.cardId]: value })}
                options={[...item.wishlists.map((list) => ({ value: list.collectionId, label: list.name, detail: `${list.wanted} wanted` })), { value: "none", label: "None" }]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btnrow end"><button type="button" className="btn primary" onClick={() => void save()}>Lower wishlists</button></div>
    </div>
  );
}

/** Listens for cards that wait for a wishlist choice and asks once per batch. */
export function WishAskHost() {
  const store = useApp();
  useEffect(() => {
    const open = (event: Event) => {
      const ask = (event as CustomEvent<WishAsk[]>).detail;
      // after the add's own window closes
      window.setTimeout(() => customDialog("Lower which wishlist?", (close) => <WishChoice store={store} ask={ask} close={close} />, 560, "Not now"), 50);
    };
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, [store]);
  return null;
}
