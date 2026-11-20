// ---------- the printing chooser: every printing of a card, newest first, with a search box ----------
import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import type { ScanCard } from "../scan-state";
import { type Currency, type FinishCode, money, priceOf } from "../types";
import { customDialog } from "./Dialog";

export type Printing = ScanCard;

const FINISH_NAMES: Record<string, string> = { nonfoil: "Regular", foil: "Foil", etched: "Etched" };

function PrintingList({ cardId, currentId, finish, currency, onPick }: {
  cardId: string; currentId: string; finish: FinishCode; currency: Currency; onPick: (printing: Printing) => void;
}) {
  const [printings, setPrintings] = useState<Printing[] | null>(null);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    let active = true;
    request<Printing[]>(`/api/cards/${encodeURIComponent(cardId)}/printings`)
      .then((list) => { if (active) setPrintings(list); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load the printings."); });
    return () => { active = false; };
  }, [cardId]);
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (printings ?? []).filter((card) => {
    const text = `${card.set_name} ${card.set_code} ${card.collector_number} ${card.released_at ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }), [printings, words]);
  if (error) return <p className="note err">{error}</p>;
  if (!printings) return <p className="note">Loading printings</p>;
  return (
    <div className="printpick">
      <input className="search" autoFocus value={term} onChange={(event) => setTerm(event.target.value)}
        placeholder="Find a set, code or number" aria-label="Find a printing" />
      <p className="note">{shown.length} of {printings.length} printings</p>
      <div className="printlist" role="listbox" aria-label="Printings">
        {shown.map((card) => (
          <div key={card.id} role="option" aria-selected={card.id === currentId} tabIndex={0}
            className={card.id === currentId ? "printrow active" : "printrow"}
            onClick={() => onPick(card)} onKeyDown={(event) => { if (event.key === "Enter") onPick(card); }}>
            {card.image_url ? <img src={card.image_url} alt="" loading="lazy" /> : <span className="noimg" />}
            <span className="pinfo">
              <b>{card.set_name}</b>
              <span className="muted">({card.set_code.toUpperCase()}) {card.collector_number}{card.released_at ? `, ${card.released_at.slice(0, 4)}` : ""}</span>
              <span className="muted">{card.finishes.split(",").filter(Boolean).map((name) => FINISH_NAMES[name] ?? name).join(", ")}</span>
            </span>
            <span className="pprice">{money(priceOf({
              price_usd: card.price_usd ?? null, price_usd_foil: card.price_usd_foil ?? null, price_usd_etched: card.price_usd_etched ?? null,
              price_eur: card.price_eur ?? null, price_eur_foil: card.price_eur_foil ?? null,
            }, finish, currency), currency)}</span>
            {card.id === currentId && <span className="badge">Current</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Opens the printing chooser. `onPick` runs with the printing chosen; choosing the current one does nothing. */
export function choosePrinting(name: string, cardId: string, currentId: string, options: { finish?: FinishCode; currency: Currency }, onPick: (printing: Printing) => void) {
  customDialog(`Change printing of ${name}`, (close) => (
    <PrintingList cardId={cardId} currentId={currentId} finish={options.finish ?? 0} currency={options.currency}
      onPick={(printing) => {
        close();
        if (printing.id !== currentId) onPick(printing);
      }} />
  ), 560, "Cancel");
}
