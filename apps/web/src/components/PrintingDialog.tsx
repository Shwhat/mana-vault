// ---------- the printing chooser: every printing of a card, newest first, with a search box ----------
import { LanguagePip, SetIcon } from "./CardMarks";
import React, { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import type { ScanCard } from "../scan-state";
import { type Currency, type FinishCode, finishLabel, money, priceOf } from "../types";
import { customDialog } from "./Dialog";

export type Printing = ScanCard;

const FINISH_CODES: Record<string, FinishCode> = { nonfoil: 0, foil: 1, etched: 2 };

/** The finishes a printing is made in, as finish codes in the order regular, foil, etched. A printing without finish data offers regular. */
export const finishesOf = (printing: Pick<Printing, "finishes">): FinishCode[] => {
  const codes = printing.finishes.split(",").filter((name) => name in FINISH_CODES).map((name) => FINISH_CODES[name]!);
  return codes.length ? [...new Set(codes)].sort() : [0];
};
const FINISH_LABEL: Record<FinishCode, string> = { 0: "Regular", 1: "Foil", 2: "Etched" };

export function PrintingList({ cardId, currentId, finish, currency, onPick }: {
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
    const text = `${card.set_name} ${card.set_code} ${card.collector_number} ${card.released_at ?? ""} ${(card as { lang?: string }).lang ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }), [printings, words]);
  if (error) return <p className="note err">{error}</p>;
  if (!printings) return <p className="note">Loading printings</p>;
  const priceIn = (card: Printing, code: FinishCode) => money(priceOf({
    price_usd: card.price_usd ?? null, price_usd_foil: card.price_usd_foil ?? null, price_usd_etched: card.price_usd_etched ?? null,
  }, code, currency), currency);
  return (
    <div className="printpick">
      <input className="search" autoFocus value={term} onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          // Enter takes the printing shown selected (or the first one found); Down moves into the list
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            const pick = shown.find((card) => card.id === currentId) ?? shown[0];
            if (pick) {
              const finishes = finishesOf(pick);
              onPick(pick, finishes.includes(finish) ? finish : finishes[0]!);
            }
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            (event.currentTarget.parentElement?.querySelector(".printrow") as HTMLElement | null)?.focus();
          }
        }}
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
                <b><SetIcon code={card.set_code} />{card.set_name} <LanguagePip lang={(card as { lang?: string }).lang} /></b>
                <span className="muted">({card.set_code.toUpperCase()}) {card.collector_number}{card.released_at ? `, ${card.released_at.slice(0, 4)}` : ""}</span>
                <span className="pfinishes" role="group" aria-label={`Finishes of ${card.set_code.toUpperCase()} ${card.collector_number}`}>
                  {finishes.map((code) => {
                    const on = isCurrent && code === finish;
                    return (
                      <button key={code} type="button" className={on ? "btn small on" : "btn small"} aria-pressed={on}
                        aria-label={`${finishLabel(code, card.promo_types)} ${card.set_code.toUpperCase()} ${card.collector_number}`}
                        onClick={(event) => { event.stopPropagation(); onPick(card, code); }}>
                        {finishLabel(code, card.promo_types)} <span className="muted">{priceIn(card, code)}</span>
                      </button>
                    );
                  })}
                </span>
              </span>
              {isCurrent && <span className="badge">Current: {finishLabel(finish, card.promo_types).toLowerCase()}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** How many to change, asked as its own step before the printings (0.17.0): starts at 1, with - and + buttons and All. */
function HowManyStep({ name, max, onNext }: { name: string; max: number; onNext: (count: number) => void }) {
  const [value, setValue] = useState(1);
  const set = (next: number) => setValue(Math.max(1, Math.min(max, Math.floor(next) || 1)));
  return (
    <div className="howmanystep">
      <p className="dlgq">How many of the {max} copies of {name} change printing?</p>
      <div className="howmanybig">
        <button type="button" className="btn" aria-label="One fewer" onClick={() => set(value - 1)} disabled={value <= 1}>-</button>
        <input type="number" autoFocus min={1} max={max} value={value} aria-label="How many to change" onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onNext(value); } }}
          onChange={(event) => set(Number(event.target.value))} />
        <button type="button" className="btn" aria-label="One more" onClick={() => set(value + 1)} disabled={value >= max}>+</button>
        <button type="button" className={value === max ? "btn on" : "btn"} onClick={() => setValue(max)}>All {max}</button>
      </div>
      <div className="btnrow end"><button type="button" className="btn primary" onClick={() => onNext(value)}>Choose the printing</button></div>
    </div>
  );
}

/**
 * Opens the printing chooser. `onPick` runs with the printing and finish chosen: another printing, or another finish of
 * the same printing (such as its foil version). Choosing the current printing in its current finish does nothing.
 * With `quantity` above 1 the chooser first asks how many of the copies change (1 to start with); the rest stay as they are.
 */
export function choosePrinting(name: string, cardId: string, currentId: string,
  options: { finish?: FinishCode; currency: Currency; quantity?: number; title?: string; allowCurrent?: boolean },
  onPick: (printing: Printing, finish: FinishCode, count: number) => void) {
  const current = options.finish ?? 0;
  const max = Math.max(1, options.quantity ?? 1);
  const pickWith = (close: () => void, count: number) => (printing: Printing, finish: FinishCode) => {
    close();
    if (options.allowCurrent || printing.id !== currentId || finish !== current) onPick(printing, finish, count);
  };
  const title = options.title ?? `Change printing of ${name}`;
  if (max <= 1) {
    customDialog(title, (close) => (
      <PrintingList cardId={cardId} currentId={currentId} finish={current} currency={options.currency} onPick={pickWith(close, 1)} />
    ), 600, "Cancel");
    return;
  }
  customDialog(title, (close) => (
    <TwoSteps name={name} max={max} render={(count) => (
      <PrintingList cardId={cardId} currentId={currentId} finish={current} currency={options.currency} onPick={pickWith(close, count)} />
    )} />
  ), 600, "Cancel");
}

/** The how-many step, then the printing list for that many copies, in one window. */
function TwoSteps({ name, max, render }: { name: string; max: number; render: (count: number) => React.ReactNode }) {
  const [count, setCount] = useState<number | null>(null);
  if (count === null) return <HowManyStep name={name} max={max} onNext={setCount} />;
  return (
    <>
      <p className="dlgq">Changing {count} of {max}. <button type="button" className="lnk" onClick={() => setCount(null)}>Change how many</button></p>
      {render(count)}
    </>
  );
}
