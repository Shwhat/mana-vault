// ---------- precons (0.21.0): every preconstructed deck MTGJSON lists, added as a new deck or to a collection ----------
import { useEffect, useState } from "react";
import { request } from "../api";
import type { Store } from "../store";
import { CollectionPicker } from "./CollectionPicker";
import { customDialog } from "./Dialog";

type Precon = { code: string; name: string; type: string; setName: string; releasedAt: string | null; kept: boolean };

function PreconList({ onPick }: { onPick: (precon: Precon) => void }) {
  const [term, setTerm] = useState("");
  const [list, setList] = useState<Precon[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      request<Precon[]>(`/api/precons?q=${encodeURIComponent(term.trim())}`).then(setList).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the precons."));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [term]);
  return (
    <div className="preconlist">
      <input aria-label="Find a precon" autoFocus value={term} placeholder="Find a precon by name, set or type" onChange={(event) => setTerm(event.target.value)} />
      {error && <p className="note err">{error}</p>}
      {list === null && !error && <p className="note">Loading the precons</p>}
      {list?.length === 0 && <p className="note">No precon matches. The precon list arrives with the MTGJSON update.</p>}
      <div className="list preconrows" role="listbox" aria-label="Precons">
        {list?.map((precon) => (
          <button key={`${precon.code}:${precon.name}`} type="button" role="option" aria-selected={false} className="wsrow preconrow" onClick={() => onPick(precon)}>
            <b>{precon.name}</b><span className="sub">{precon.setName}{precon.releasedAt ? `, ${precon.releasedAt}` : ""}{precon.type ? `, ${precon.type}` : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Makes a new deck from a precon: commander, main board and side board, in the printings and finishes the decklist names. */
export async function preconAsDeck(store: Store, code: string, name: string) {
  try {
    store.flash(`Making ${name}`);
    const made = await request<{ id: string; name: string; cards: number; missing: number }>("/api/precons/deck", { method: "POST", body: JSON.stringify({ code, name }) });
    await store.refreshAfterChange();
    store.pushUndo({
      label: `Deck ${made.name} from its precon`,
      undo: async () => { await request(`/api/decks/${encodeURIComponent(made.id)}`, { method: "DELETE" }); await store.refreshAfterChange(); },
      redo: async () => { store.flash("Add the precon as a deck again from the Decks menu", "err"); },
    });
    store.openDeck?.(made.id);
    store.setView("deck");
    store.flash(`${made.name} made with ${made.cards} cards${made.missing ? `. ${made.missing} are not in the card database` : ""}`);
  } catch (reason) {
    store.fail(reason, "Could not make the deck.");
  }
}

/** Add precon as deck...: chooses a precon and makes a new deck from it. */
export const preconDeckDialog = (store: Store) =>
  customDialog("Add precon as deck", (close) => <PreconList onPick={(precon) => { close(); void preconAsDeck(store, precon.code, precon.name); }} />, 620, "Cancel");

function PreconToCollection({ store, close }: { store: Store; close: () => void }) {
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection" && item.role === "owner");
  const [precon, setPrecon] = useState<Precon | null>(null);
  const [collectionId, setCollectionId] = useState(store.prefs.openCollection && owned.some((item) => item.id === store.prefs.openCollection) ? store.prefs.openCollection : owned[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!precon || !collectionId || busy) return;
    setBusy(true);
    try {
      const result = await request<{ name: string; added: Array<{ cardId: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number }>; cards: number; missing: number }>(
        "/api/precons/collection", { method: "POST", body: JSON.stringify({ code: precon.code, name: precon.name, collectionId }) });
      const where = store.collectionName(collectionId);
      store.pushUndo({
        label: `Add ${result.name} to ${where}`,
        // one undo step: every card of the precon comes back out
        undo: async () => {
          const current = await request<Array<{ id: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number }>>(`/api/collections/${encodeURIComponent(collectionId)}/cards`);
          const items = result.added.map((item) => {
            const have = current.find((row) => row.id === item.cardId && row.foil === item.foil && row.condition === item.condition && row.language === item.language && row.proxy === item.proxy)?.quantity ?? 0;
            return { ...item, quantity: Math.max(0, have - item.quantity) };
          });
          await request(`/api/collections/${encodeURIComponent(collectionId)}/cards`, { method: "PUT", body: JSON.stringify({ items }) });
          await store.refreshAfterChange();
        },
        redo: async () => {
          await request("/api/precons/collection", { method: "POST", body: JSON.stringify({ code: precon.code, name: precon.name, collectionId }) });
          await store.refreshAfterChange();
        },
      });
      await store.refreshAfterChange();
      close();
      store.flash(`${result.cards} cards of ${result.name} added to ${where}${result.missing ? `. ${result.missing} are not in the card database` : ""}`);
    } catch (reason) {
      store.fail(reason, "Could not add the precon.");
      setBusy(false);
    }
  };
  if (!precon) return <PreconList onPick={setPrecon} />;
  return (
    <div className="purchaseedit">
      <p><b>{precon.name}</b> <span className="sub">{precon.setName}</span> <button type="button" className="btn small" onClick={() => setPrecon(null)}>Choose another</button></p>
      <div className="prow"><label htmlFor="pc-coll">Add to</label>
        <CollectionPicker store={store} id="pc-coll" label="Collection" value={collectionId} list={owned} onChange={setCollectionId} suggest={precon.name} /></div>
      <p className="note">Every card is added as a Near Mint English copy, in the printing and finish the decklist names.</p>
      <div className="btnrow end"><button type="button" className="btn primary" disabled={!collectionId || busy} onClick={() => void add()}>Add cards</button></div>
    </div>
  );
}

/** Add precon to collection...: every card of a precon as copies in a collection, as one undo step. */
export const preconCollectionDialog = (store: Store) =>
  customDialog("Add precon to collection", (close) => <PreconToCollection store={store} close={close} />, 620, "Cancel");
