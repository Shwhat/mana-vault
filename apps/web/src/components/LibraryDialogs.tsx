// ---------- library dialogs: collection settings and sets, move, send, inbox and sharing ----------
import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { CollectionInput } from "../library-state";
import { entryKey } from "../library-state";
import type { Store } from "../store";
import { useApp } from "../store";
import {
  type Candidate, capitalize, type Collection, type CollectionEntry, COMPLETION_RULES, CONDITIONS, copyLabel, type DeckCard, FINISH_RULES, FINISHES, type FinishCode,
  FORMATS, formatName, LANGUAGES, type Offer, SEND_MODES, type SetInfo,
} from "../types";
import { customDialog, dialog } from "./Dialog";

/** Search box plus a checkable set list. The chosen codes are kept in `holder.sets` for the dialog's OK handler. */
function SetPicker({ holder, initial }: { holder: { sets: string[] }; initial: Array<{ code: string; name: string }> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SetInfo[]>([]);
  const [chosen, setChosen] = useState(initial);
  holder.sets = chosen.map((set) => set.code);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      request<SetInfo[]>(`/api/sets?q=${encodeURIComponent(query)}`).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const toggle = (set: { code: string; name: string }) =>
    setChosen((current) => (current.some((item) => item.code === set.code) ? current.filter((item) => item.code !== set.code) : [...current, set]));
  return (
    <div className="setpick">
      <div className="prow"><label htmlFor="set-search">Linked sets</label>
        <input id="set-search" className="search" value={query} placeholder="Find a set by name or code" onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      </div>
      <div className="chips" aria-label="Chosen sets">
        {chosen.length === 0 && <span className="note">No sets linked</span>}
        {chosen.map((set) => (
          <span className="chip" key={set.code}>{set.name} <b>{set.code.toUpperCase()}</b>
            <button type="button" aria-label={`Remove ${set.name}`} onClick={() => toggle(set)}>×</button></span>
        ))}
      </div>
      <div className="setlist" role="listbox" aria-label="Sets">
        {results.slice(0, 200).map((set) => {
          const on = chosen.some((item) => item.code === set.code);
          return (
            <label key={set.code} className={on ? "setrow on" : "setrow"}>
              <input type="checkbox" checked={on} onChange={() => toggle({ code: set.code, name: set.name })} />
              <span className="nl">{set.name}</span>
              <span className="badge">{set.code.toUpperCase()}</span>
              <span className="cnt">{set.released_at?.slice(0, 4) ?? ""}</span>
            </label>
          );
        })}
        {results.length === 0 && <div className="note pad">No sets match</div>}
      </div>
    </div>
  );
}

/** New collection when `existing` is missing, otherwise its settings. */
export function collectionDialog(store: Store, existing?: Collection) {
  const holder = { sets: existing?.sets.map((set) => set.code) ?? [] };
  dialog(existing ? "Collection settings" : "New collection", [
    ["name", "Name", existing?.realName ?? ""],
    ["description", "Description", existing?.description ?? ""],
    ["completion", "Completion rule", existing?.completion ?? "none", "select", COMPLETION_RULES],
    ["finish", "Finish rule", existing?.finish ?? "any", "select", FINISH_RULES],
    ["wishlist", "Wishlist", existing?.kind === "wishlist", "check"],
  ], async (values) => {
    const input: CollectionInput = {
      name: String(values.name), description: String(values.description),
      completion: values.completion as CollectionInput["completion"], finish: values.finish as CollectionInput["finish"],
      kind: values.wishlist ? "wishlist" : "collection", sets: holder.sets,
    };
    if (!input.name) {
      store.flash("Enter a collection name", "err");
      return false;
    }
    try {
      if (existing) await store.saveCollection(existing.id, input);
      else {
        await store.createCollection(input);
        store.setView("collection");
      }
    } catch (reason) {
      store.fail(reason, "Could not save the collection.");
      return false;
    }
  }, existing ? "Save" : "Create collection", (
    <SetPicker holder={holder} initial={existing?.sets ?? []} />
  ), 620);
}

/** Finish, condition, language, proxy, the number for trade and the copy details of one collection row. */
export function copyDialog(store: Store, entry: CollectionEntry) {
  dialog(`Copy details: ${entry.name}`, [
    ["foil", "Finish", String(entry.foil), "select", FINISHES.map(([code, label]) => [String(code), label])],
    ["condition", "Condition", entry.condition, "select", CONDITIONS],
    ["language", "Language", entry.language, "select", LANGUAGES],
    ["proxy", "Proxy", !!entry.proxy, "check"],
    ["trade", "For trade", String(entry.trade), "number"],
    ["price", "Purchase price", entry.purchase_price === null || entry.purchase_price === undefined ? "" : String(entry.purchase_price), "number"],
    ["currency", "Purchase currency", entry.price_currency ?? "USD"],
    ["added", "Date added", entry.added_at ? entry.added_at.slice(0, 10) : ""],
    ["misprint", "Misprint", !!entry.misprint, "check"],
    ["altered", "Altered", !!entry.altered, "check"],
    ["signed", "Signed", !!entry.signed, "check"],
  ], async (values) => {
    const trade = Number(values.trade);
    if (!Number.isInteger(trade) || trade < 0 || trade > entry.quantity) {
      store.flash(`Enter a number for trade from 0 to ${entry.quantity}`, "err");
      return false;
    }
    const price = values.price === "" ? null : Number(values.price);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      store.flash("Enter a purchase price of 0 or more", "err");
      return false;
    }
    const currency = String(values.currency).toUpperCase();
    if (price !== null && !/^[A-Z]{3}$/.test(currency)) {
      store.flash("Enter a three letter currency such as USD", "err");
      return false;
    }
    const added = String(values.added);
    if (added && !Number.isFinite(Date.parse(added))) {
      store.flash("Enter the date added as a date, such as 2026-08-10", "err");
      return false;
    }
    await store.editCopy(entry, {
      foil: Number(values.foil) as FinishCode, condition: values.condition as CollectionEntry["condition"], language: String(values.language),
      proxy: values.proxy === true, trade: values.proxy === true ? 0 : trade,
      extras: {
        purchase_price: price, price_currency: price === null ? null : currency, added_at: added ? new Date(added).toISOString() : entry.added_at ?? null,
        misprint: values.misprint === true, altered: values.altered === true, signed: values.signed === true,
      },
    });
  }, "Save", undefined, 460);
}

/** New deck: name and format. Every deck keeps the printing of each card. */
export function newDeckDialog(store: Store) {
  dialog("New deck", [
    ["name", "Deck name", ""],
    ["format", "Format", "commander", "select", FORMATS.map((format) => [format, formatName(format)])],
  ], async (values) => {
    const name = String(values.name);
    if (!name || name.length > 100) {
      store.flash(name ? "Deck names can be up to 100 characters" : "Enter a deck name", "err");
      return false;
    }
    try {
      await store.createDeck(name, String(values.format));
    } catch (reason) {
      store.fail(reason, "Could not create the deck.");
      return false;
    }
  }, "Create deck");
}

/** One free copy, as a line in a list. */
export function candidateLabel(item: Candidate): string {
  const label = copyLabel(item);
  return `${item.collectionName}: ${item.set_code.toUpperCase()} ${item.collector_number}${label ? `, ${label}` : ""}${item.proxy ? ", proxy" : ""} (${item.free} free)`;
}

/** Chooses which copies fill a deck card. The deck card takes the printing of the copy chosen. */
export async function linkDialog(store: Store, card: DeckCard) {
  let candidates: Candidate[];
  try {
    candidates = await store.loadCandidates(card.card_id, card.entry_id);
  } catch (reason) {
    return store.fail(reason, "Could not load your copies of this card.");
  }
  const current = card.links ?? [];
  if (!candidates.length && !current.length) return store.flash(`No free copy of ${card.name} is in your collections`, "err");
  const options: Array<[string, string]> = [["", "None (missing)"], ...candidates.map((item, index): [string, string] => [String(index), candidateLabel(item)])];
  dialog(`Link ${card.name}`, [
    ["copy", "Copy", candidates.length ? "0" : "", "select", options],
    ["quantity", "How many", String(card.quantity), "number"],
  ], async (values) => {
    const chosen = values.copy === "" ? null : candidates[Number(values.copy)] ?? null;
    const quantity = Number(values.quantity);
    if (chosen && (!Number.isInteger(quantity) || quantity < 1 || quantity > card.quantity)) {
      store.flash(`Enter a number from 1 to ${card.quantity}`, "err");
      return false;
    }
    await store.setDeckLinks(card, chosen ? [{ ...chosen, quantity: Math.min(quantity, chosen.free) }] : []);
  }, "Link", undefined, 520);
}

export function moveDialog(store: Store, entries: CollectionEntry[]) {
  const others = (store.collections ?? []).filter((item) => item.id !== store.prefs.openCollection);
  if (!entries.length) return store.flash("Pick one or more rows first", "err");
  if (!others.length) return store.flash("Create another collection to move cards into", "err");
  const single = entries.length === 1 ? entries[0]! : null;
  dialog(single ? `Move ${single.name}` : `Move ${entries.length} entries`, [
    ["to", "Move to", others[0]!.id, "select", others.map((item) => [item.id, item.name])],
    ...(single && single.quantity > 1 ? [["count", "Copies to move", String(single.quantity), "number"] as [string, string, string, "number"]] : []),
  ], async (values) => {
    const counts = new Map<string, number>();
    if (single && values.count !== undefined) {
      const count = Number(values.count);
      if (!Number.isInteger(count) || count < 1 || count > single.quantity) {
        store.flash(`Enter a whole number from 1 to ${single.quantity}`, "err");
        return false;
      }
      counts.set(entryKey(single), count);
    }
    await store.moveEntries(entries, String(values.to), counts);
  }, "Move", undefined, 440);
}

export async function sendDialog(store: Store, kind: "collection" | "deck", item: { id: string; name: string; role?: string }) {
  let people;
  try {
    people = await store.loadUsers();
  } catch (reason) {
    return store.fail(reason, "Could not load the account list.");
  }
  if (!people.length) return store.flash("There are no other accounts on this server to send to", "err");
  const modes = item.role === "member" ? SEND_MODES.filter(([mode]) => mode === "copy") : SEND_MODES;
  dialog(`Send ${kind} ${item.name}`, [
    ["to", "Send to", String(people[0]!.id), "select", people.map((person) => [String(person.id), person.name])],
    ["mode", "How", "copy", "select", modes],
  ], async (values) => {
    try {
      await store.send(kind, item.id, Number(values.to), String(values.mode));
    } catch (reason) {
      store.fail(reason, "Could not send it.");
      return false;
    }
  }, "Send", undefined, 480);
}

function acceptDialog(store: Store, offer: Offer) {
  const merge = offer.kind === "collection" && offer.mode !== "share";
  const mine = (store.collections ?? []).filter((item) => item.role === "owner" || offer.mode !== "transfer");
  const intro = offer.mode === "share"
    ? `${offer.user} is sharing this ${offer.kind} with you. You can give it your own name; it stays the same ${offer.kind} for both of you.`
    : offer.mode === "transfer" ? `${offer.user} is giving you this ${offer.kind}. It leaves their account when you accept.`
      : `${offer.user} is sending you a copy of this ${offer.kind}.`;
  dialog(`Accept ${offer.itemName}`, [
    ...(merge ? [["as", "Add it as", "new", "select", [["new", "A new collection"], ...mine.map((item): [string, string] => [item.id, `Merge into ${item.name}`])]] as [string, string, string, "select", Array<[string, string]>]] : []),
    ["name", offer.mode === "share" ? "Your name for it" : "Name", offer.itemName],
  ], async (values) => {
    const into = merge && values.as !== "new" ? String(values.as) : undefined;
    try {
      await store.accept(offer, into ? { mergeInto: into } : { name: String(values.name) });
    } catch (reason) {
      store.fail(reason, "Could not accept it.");
      return false;
    }
  }, "Accept", <p className="dlgq">{intro}</p>, 460);
}

function InboxList() {
  const store = useApp();
  const { inbox, sent } = store.offers;
  const mode = (offer: Offer) => (offer.mode === "copy" ? "Copy" : offer.mode === "share" ? "Share" : "Transfer");
  return (
    <div className="inbox">
      <h4>Waiting for you</h4>
      {inbox.length === 0 && <p className="note">Nothing is waiting</p>}
      {inbox.map((offer) => (
        <div className="wsrow" key={offer.id}>
          <span><b>{offer.itemName}</b> <span className="badge">{offer.kind === "collection" ? "Collection" : "Deck"}</span> <span className="badge main">{mode(offer)}</span>
            <span className="sub"> from {offer.user}</span></span>
          <span className="btnrow">
            <button type="button" className="btn small primary" onClick={() => acceptDialog(store, offer)}>Accept...</button>
            <button type="button" className="btn small" onClick={() => void store.decline(offer).catch((reason) => store.fail(reason, "Could not decline it."))}>Decline</button>
          </span>
        </div>
      ))}
      <h4>Sent by you, not yet answered</h4>
      {sent.length === 0 && <p className="note">No offers waiting</p>}
      {sent.map((offer) => (
        <div className="wsrow" key={offer.id}>
          <span><b>{offer.itemName}</b> <span className="badge main">{mode(offer)}</span><span className="sub"> to {offer.user}</span></span>
          <button type="button" className="btn small" onClick={() => void store.cancelOffer(offer).catch((reason) => store.fail(reason, "Could not cancel it."))}>Cancel offer</button>
        </div>
      ))}
    </div>
  );
}

export function inboxDialog(store: Store) {
  void store.reloadOffers();
  customDialog("Inbox", () => <InboxList />, 560);
}

function SharingList({ kind }: { kind: "collection" | "deck" }) {
  const store = useApp();
  const item = kind === "collection" ? store.collections?.find((entry) => entry.id === store.prefs.openCollection) : store.deck;
  const busy = useRef(false);
  if (!item) return <p className="note">Nothing is open</p>;
  if (item.role === "member") return <p className="dlgq">{item.name} is shared with you by {item.owner?.name}. Only the owner can change who it is shared with.</p>;
  return (
    <div>
      {!item.sharedWith?.length && <p className="note">Not shared</p>}
      {item.sharedWith?.map((person) => (
        <div className="wsrow" key={person.id}><span>{person.name}</span>
          <button type="button" className="btn small" onClick={() => {
            if (busy.current) return;
            busy.current = true;
            void store.stopSharing(kind, item.id, person).catch((reason) => store.fail(reason, "Could not stop sharing.")).finally(() => { busy.current = false; });
          }}>Stop sharing</button></div>
      ))}
    </div>
  );
}

export function sharingDialog(store: Store, kind: "collection" | "deck") {
  customDialog(kind === "collection" ? "Collection sharing" : "Deck sharing", () => <SharingList kind={kind} />, 420);
}

export function renameDeckDialog(store: Store) {
  const deck = store.deck;
  if (!deck) return store.flash("Open a deck first", "err");
  dialog("Rename deck", [["name", "Deck name", deck.realName ?? deck.name]], async (values) => {
    const name = String(values.name);
    if (!name || name.length > 100) {
      store.flash(name ? "Deck names can be up to 100 characters" : "Enter a deck name", "err");
      return false;
    }
    try {
      await store.renameDeck(name);
    } catch (reason) {
      store.fail(reason, "Could not rename the deck.");
      return false;
    }
  }, "Rename");
}
