// ---------- New collection... in every list where a collection is chosen as a destination (0.21.0) ----------
import { useState } from "react";
import type { Store } from "../store";
import { NEW_COLLECTION, type Values } from "./Dialog";
import { type Choice, Picker } from "./Picker";

/** The choices of a collection field: the collections, then New collection... last. */
export const collectionChoices = (list: Array<{ id: string; name: string; cardCount?: number }>, detail = false): Choice[] =>
  [...list.map((item) => ({ value: item.id, label: item.name, ...(detail && item.cardCount !== undefined ? { detail: `${item.cardCount} cards` } : {}) })), { value: NEW_COLLECTION, label: "New collection..." }];

/** The same choices for a form dialog's select field. */
export const collectionFields = (list: Array<{ id: string; name: string }>): Array<[string, string]> => [...list.map((item): [string, string] => [item.id, item.name]), [NEW_COLLECTION, "New collection..."]];

/** Makes a new collection with a name. Resolves with its id, or null when the name is empty. */
export async function makeCollection(store: Store, name: string): Promise<string | null> {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) {
    store.flash("Enter a name for the new collection", "err");
    return null;
  }
  const created = await store.createCollection({ name: trimmed, description: "", completion: "none", finish: "any", kind: "collection", sets: [] });
  return created.id;
}

/** The collection chosen in a form dialog's field: an existing one, or a new one made now. Null keeps the dialog open. */
export async function chosenCollection(store: Store, values: Values, key: string): Promise<string | null> {
  const value = String(values[key] ?? "");
  if (value !== NEW_COLLECTION) return value;
  return makeCollection(store, String(values[`${key}:name`] ?? ""));
}

/**
 * A collection picker with New collection... last. Choosing it asks for a name, filled with a suggestion; Create makes
 * the collection and picks it, Cancel keeps the collection chosen before.
 */
export function CollectionPicker({ store, id, label, value, list, onChange, suggest = "", disabled, prefix, detail = false }: {
  store: Store; id?: string; label: string; value: string; list: Array<{ id: string; name: string; cardCount?: number }>; onChange: (id: string) => void;
  suggest?: string; disabled?: boolean; prefix?: string; detail?: boolean;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // a collection made here is listed at once, even where the list was read before it was made (a window already open)
  const [made, setMade] = useState<Array<{ id: string; name: string }>>([]);
  const shown = [...list, ...made.filter((item) => !list.some((other) => other.id === item.id))];
  const create = async () => {
    if (naming === null || busy) return;
    setBusy(true);
    try {
      const id = await makeCollection(store, naming);
      if (id) {
        setMade((value) => [...value, { id, name: naming.trim().slice(0, 100) }]);
        setNaming(null);
        onChange(id);
      }
    } catch (reason) {
      store.fail(reason, "Could not make the collection.");
    } finally {
      setBusy(false);
    }
  };
  if (naming !== null) {
    return (
      <span className="newcollection">
        <input aria-label="Name of the new collection" placeholder="Name of the new collection" autoFocus maxLength={100} value={naming}
          onChange={(event) => setNaming(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void create(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNaming(null); }
          }} />
        <button type="button" className="btn small primary" disabled={busy || !naming.trim()} onClick={() => void create()}>Create</button>
        <button type="button" className="btn small" onClick={() => setNaming(null)}>Cancel</button>
      </span>
    );
  }
  return (
    <Picker id={id} label={label} prefix={prefix} value={value} disabled={disabled} options={collectionChoices(shown, detail)}
      onChange={(next) => { if (next === NEW_COLLECTION) setNaming(suggest); else onChange(next); }} />
  );
}
