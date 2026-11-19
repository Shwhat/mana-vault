// ---------- deck builder dialogs: tags, format and editing the deck as text ----------
import { useState } from "react";
import { request } from "../api";
import { deckText } from "../deck-rules";
import type { Store } from "../store";
import { type DeckCard, FORMATS, formatName } from "../types";
import { customDialog, dialog } from "./Dialog";

/** Tags for one deck card, typed with commas between them. Tags already used in the deck are listed. */
export function tagsDialog(store: Store, card: DeckCard) {
  const used = [...new Set((store.deck?.cards ?? []).flatMap((item) => item.tags ?? []))].sort((a, b) => a.localeCompare(b));
  dialog(`Tags for ${card.name}`, [["tags", "Tags", (card.tags ?? []).join(", ")]], async (values) => {
    const tags = String(values.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 12 || tags.some((tag) => tag.length > 40)) {
      store.flash("Use up to 12 tags of up to 40 characters each", "err");
      return false;
    }
    await store.setDeckTags(card, tags);
  }, "Save", used.length ? <p className="note">Tags in this deck: {used.join(", ")}</p> : <p className="note">Separate tags with commas, such as Ramp, Card draw</p>);
}

export function formatDialog(store: Store) {
  const deck = store.deck;
  if (!deck) return store.flash("Open a deck first", "err");
  dialog("Deck format", [["format", "Format", deck.format, "select", FORMATS.map((format) => [format, formatName(format)])]], async (values) => {
    const ok = await store.updateDeckInfo({ format: String(values.format) }, `Format set to ${formatName(String(values.format))}`);
    if (!ok) return false;
  }, "Save");
}

type Report = { added: number; removed: number; changed: number; unmatched: Array<{ row: number; name: string; reason: string }> };

/** The whole deck as text. Check shows what would change; Apply makes the deck match the text. */
export function editTextDialog(store: Store) {
  const deck = store.deck;
  if (!deck) return store.flash("Open a deck first", "err");
  customDialog(`Edit ${deck.name} as text`, (close) => <EditText store={store} close={close} />, 720, "Cancel");
}

function EditText({ store, close }: { store: Store; close: () => void }) {
  const deck = store.deck!;
  const [text, setText] = useState(() => deckText(deck.cards));
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      setReport(await request<Report>(`/api/decks/${encodeURIComponent(deck.id)}/replace?preview=1`, { method: "POST", body: JSON.stringify({ text }) }));
    } catch (reason) {
      store.fail(reason, "Could not check the deck list.");
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    await store.replaceDeckText(text);
    setBusy(false);
    close();
  };
  return (
    <div className="edittext">
      <p className="note">One card per line, such as 1 Sol Ring (C21) 263, under Commander, Deck, Sideboard and Maybeboard.</p>
      <textarea aria-label="Deck list" spellCheck={false} value={text} onChange={(event) => { setText(event.target.value); setReport(null); }} />
      {report && (
        <div className="editreport">
          <b>{report.added} added, {report.changed} changed, {report.removed} removed</b>
          {report.unmatched.map((item) => (
            <div className="msg" key={`${item.row}-${item.name}`}><span className="lv w">Line {item.row}</span><span>{item.name ? <b>{item.name}: </b> : null}{item.reason}</span></div>
          ))}
          {report.unmatched.length > 0 && <p className="note err">Cards on lines that did not match are removed from the deck.</p>}
        </div>
      )}
      <div className="btnrow">
        <button type="button" className="btn" disabled={busy} onClick={() => void check()}>Check</button>
        <button type="button" className="btn primary" disabled={busy || !report} onClick={() => void apply()}>Apply</button>
      </div>
    </div>
  );
}
