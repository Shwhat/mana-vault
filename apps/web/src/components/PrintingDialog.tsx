// ---------- the printing chooser: every printing of a card, newest first, with a search box ----------
import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import type { ScanCard } from "../scan-state";
import { type Currency, type FinishCode, money, priceOf } from "../types";
import { customDialog } from "./Dialog";

export type Printing = ScanCard;

const FINISH_CODES: Record<string, FinishCode> = { nonfoil: 0, foil: 1, etched: 2 };

/** The finishes a printing is made in, as finish codes in the order regular, foil, etched. A printing without finish data offers regular. */
export const finishesOf = (printing: Pick<Printing, "finishes">): FinishCode[] => {
  const codes = printing.finishes.split(",").filter((name) => name in FINISH_CODES).map((name) => FINISH_CODES[name]!);
  return codes.length ? [...new Set(codes)].sort() : [0];
};
const FINISH_LABEL: Record<FinishCode, string> = { 0: "Regular", 1: "Foil", 2: "Etched" };

function PrintingList({ cardId, currentId, finish, currency, onPick }: {
  cardId: string; currentId: string; finish: FinishCode; currency: Currency; onPick: (printing: Printing, finish: FinishCode) => void;
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
  const priceIn = (card: Printing, code: FinishCode) => money(priceOf({
    price_usd: card.price_usd ?? null, price_usd_foil: card.price_usd_foil ?? null, price_usd_etched: card.price_usd_etched ?? null,
    price_eur: card.price_eur ?? null, price_eur_foil: card.price_eur_foil ?? null,
  }, code, currency), currency);
  return (
    <div className="printpick">
      <input className="search" autoFocus value={term} onChange={(event) => setTerm(event.target.value)}
        placeholder="Find a set, code or number" aria-label="Find a printing" />
      <p className="note">{shown.length} of {printings.length} printings</p>
      <div className="printlist" role="listbox" aria-label="Printings">
        {shown.map((card) => {
          const finishes = finishesOf(card);
          const isCurrent = card.id === currentId;
          // clicking the row picks the finish in use when the printing has it, otherwise its first finish
          const rowFinish = finishes.includes(finish) ? finish : finishes[0]!;
          return (
            <div key={card.id} role="option" aria-selected={isCurrent} tabIndex={0}
              className={isCurrent ? "printrow active" : "printrow"}
              onClick={() => onPick(card, rowFinish)} onKeyDown={(event) => { if (event.key === "Enter") onPick(card, rowFinish); }}>
              {card.image_url ? <img src={card.image_url} alt="" loading="lazy" /> : <span className="noimg" />}
              <span className="pinfo">
                <b>{card.set_name}</b>
                <span className="muted">({card.set_code.toUpperCase()}) {card.collector_number}{card.released_at ? `, ${card.released_at.slice(0, 4)}` : ""}</span>
                <span className="pfinishes" role="group" aria-label={`Finishes of ${card.set_code.toUpperCase()} ${card.collector_number}`}>
                  {finishes.map((code) => {
                    const on = isCurrent && code === finish;
                    return (
                      <button key={code} type="button" className={on ? "btn small on" : "btn small"} aria-pressed={on}
                        aria-label={`${FINISH_LABEL[code]} ${card.set_code.toUpperCase()} ${card.collector_number}`}
                        onClick={(event) => { event.stopPropagation(); onPick(card, code); }}>
                        {FINISH_LABEL[code]} <span className="muted">{priceIn(card, code)}</span>
                      </button>
                    );
                  })}
                </span>
              </span>
              {isCurrent && <span className="badge">Current: {FINISH_LABEL[finish].toLowerCase()}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The "How many" box of the chooser, for a card with more than one copy. */
function HowMany({ max, value, onChange }: { max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="howmany">How many to change
      <input type="number" min={1} max={max} value={value} aria-label="How many to change"
        onChange={(event) => onChange(Math.max(1, Math.min(max, Math.floor(Number(event.target.value) || 1))))} />
      <span className="muted">of {max}</span>
    </label>
  );
}

/**
 * Opens the printing chooser. `onPick` runs with the printing and finish chosen: another printing, or another finish of
 * the same printing (such as its foil version). Choosing the current printing in its current finish does nothing.
 * With `quantity` above 1 the chooser asks how many of the copies change (all by default); the rest stay as they are.
 */
export function choosePrinting(name: string, cardId: string, currentId: string,
  options: { finish?: FinishCode; currency: Currency; quantity?: number; title?: string; allowCurrent?: boolean },
  onPick: (printing: Printing, finish: FinishCode, count: number) => void) {
  const current = options.finish ?? 0;
  const max = Math.max(1, options.quantity ?? 1);
  let count = max;
  function Body({ close }: { close: () => void }) {
    const [value, setValue] = useState(max);
    return (
      <>
        {max > 1 && <HowMany max={max} value={value} onChange={(next) => { setValue(next); count = next; }} />}
        <PrintingList cardId={cardId} currentId={currentId} finish={current} currency={options.currency}
          onPick={(printing, finish) => {
            close();
            if (options.allowCurrent || printing.id !== currentId || finish !== current) onPick(printing, finish, Math.min(max, count));
          }} />
      </>
    );
  }
  customDialog(options.title ?? `Change printing of ${name}`, (close) => <Body close={close} />, 600, "Cancel");
}
