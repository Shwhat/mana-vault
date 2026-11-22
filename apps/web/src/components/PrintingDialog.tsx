// ---------- the printing chooser: every printing of a card, newest first, with a search box ----------
import { LanguagePip, SetIcon } from "./CardMarks";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../api";
import type { ScanCard } from "../scan-state";
import { type Currency, type FinishCode, finishLabel, money, priceOf } from "../types";
import { customDialog } from "./Dialog";
import { useApp } from "../store";
import { LayoutRows, OptionsButton } from "./Options";

export type Printing = ScanCard;

/** The printing chooser is wide enough for a grid of card pictures (0.19.0); narrower screens fit it to the window. */
const CHOOSER_WIDTH = 980;

const FINISH_CODES: Record<string, FinishCode> = { nonfoil: 0, foil: 1, etched: 2 };

/** The finishes a printing is made in, as finish codes in the order regular, foil, etched. A printing without finish data offers regular. */
export const finishesOf = (printing: Pick<Printing, "finishes">): FinishCode[] => {
  const codes = printing.finishes.split(",").filter((name) => name in FINISH_CODES).map((name) => FINISH_CODES[name]!);
  return codes.length ? [...new Set(codes)].sort() : [0];
};
const FINISH_LABEL: Record<FinishCode, string> = { 0: "Regular", 1: "Foil", 2: "Etched" };

/**
 * The finish buttons of a card with only one printing (0.18.0): adding it needs no printing list, only the finish, such
 * as Regular, Foil or Surge foil, each with its price.
 */
export function FinishChoice({ printing, currency, onPick, preferred = 0 }: { printing: Printing; currency: Currency; onPick: (finish: FinishCode) => void; preferred?: FinishCode }) {
  const finishes = finishesOf(printing);
  const focus = finishes.includes(preferred) ? preferred : finishes[0];
  // the preferred finish takes the focus once the window has opened, so Enter adds it
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => first.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const price = (code: FinishCode) => money(priceOf({
    price_usd: printing.price_usd ?? null, price_usd_foil: printing.price_usd_foil ?? null, price_usd_etched: printing.price_usd_etched ?? null,
  }, code, currency), currency);
  return (
    <div className="finishchoice">
      <p className="note">{printing.name} has one printing: ({printing.set_code.toUpperCase()}) {printing.collector_number}, {printing.set_name}. Choose the finish.</p>
      <div className="btnrow" role="group" aria-label="Finish">
        {finishes.map((code) => (
          <button key={code} ref={code === focus ? first : undefined} type="button" className={code === focus ? "btn primary" : "btn"} onClick={() => onPick(code)}>
            {finishLabel(code, printing.promo_types)} <span className="muted">{price(code)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Asks only for the finish of a card with one printing. */
export function chooseFinish(title: string, printing: Printing, currency: Currency, onPick: (finish: FinishCode) => void, preferred: FinishCode = 0) {
  customDialog(title, (close) => <FinishChoice printing={printing} currency={currency} preferred={preferred} onPick={(finish) => { close(); onPick(finish); }} />, 460, "Cancel");
}

export function PrintingList({ cardId, currentId, finish, currency, onPick, single = false }: {
  cardId: string; currentId: string; finish: FinishCode; currency: Currency; onPick: (printing: Printing, finish: FinishCode) => void;
  /** Adding a card (0.18.0): one printing in one finish is taken at once, one printing in several finishes asks only the finish. */
  single?: boolean;
}) {
  const store = useApp();
  const [printings, setPrintings] = useState<Printing[] | null>(null);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
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
  useEffect(() => setPage(0), [term]);
  useEffect(() => {
    if (single && printings?.length === 1 && finishesOf(printings[0]!).length === 1) onPick(printings[0]!, finishesOf(printings[0]!)[0]!);
  }, [single, printings]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="note err">{error}</p>;
  if (!printings) return <p className="note">Loading printings</p>;
  if (single && printings.length === 1) {
    const only = printings[0]!;
    return finishesOf(only).length === 1 ? <p className="note">Adding</p> : <FinishChoice printing={only} currency={currency} preferred={finish} onPick={(code) => onPick(only, code)} />;
  }
  const layout = store.prefs.chooserLayout;
  const size = store.prefs.chooserSize;
  const priceIn = (card: Printing, code: FinishCode) => money(priceOf({
    price_usd: card.price_usd ?? null, price_usd_foil: card.price_usd_foil ?? null, price_usd_etched: card.price_usd_etched ?? null,
  }, code, currency), currency);
  // clicking a printing picks the finish in use when it has it, otherwise its first finish
  const finishFor = (card: Printing) => {
    const finishes = finishesOf(card);
    return finishes.includes(finish) ? finish : finishes[0]!;
  };
  const finishButtons = (card: Printing, isCurrent: boolean) => {
    const rowFinish = finishFor(card);
    return (
      <span className="pfinishes" role="group" aria-label={`Finishes of ${card.set_code.toUpperCase()} ${card.collector_number}`}>
        {finishesOf(card).map((code) => {
          const on = isCurrent && code === finish;
          return (
            <button key={code} type="button" className={on ? "btn small on" : code === rowFinish && layout !== "list" ? "btn small hi" : "btn small"} aria-pressed={on}
              aria-label={`${finishLabel(code, card.promo_types)} ${card.set_code.toUpperCase()} ${card.collector_number}`}
              onClick={(event) => { event.stopPropagation(); onPick(card, code); }}>
              {finishLabel(code, card.promo_types)} <span className="muted">{priceIn(card, code)}</span>
            </button>
          );
        })}
      </span>
    );
  };
  const info = (card: Printing) => (
    <>
      <b><SetIcon code={card.set_code} />{card.set_name} <LanguagePip lang={(card as { lang?: string }).lang} /></b>
      <span className="muted">({card.set_code.toUpperCase()}) {card.collector_number}{card.released_at ? `, ${card.released_at.slice(0, 4)}` : ""}</span>
    </>
  );
  // one printing: a row in List, a card picture with its details and finish buttons in Grid and Binder
  const item = (card: Printing) => {
    const isCurrent = card.id === currentId;
    const rowFinish = finishFor(card);
    const common = {
      role: "option", "aria-selected": isCurrent, tabIndex: 0,
      onClick: () => onPick(card, rowFinish),
      onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter") onPick(card, rowFinish); },
    } as const;
    if (layout === "list") {
      return (
        <div key={card.id} {...common} className={isCurrent ? "printrow active" : "printrow"}>
          {card.image_url ? <img className="pthumb" src={card.image_url} alt="" loading="lazy" /> : <span className="noimg" />}
          <span className="pinfo">{info(card)}{finishButtons(card, isCurrent)}</span>
          {isCurrent && <span className="badge">Current: {finishLabel(finish, card.promo_types).toLowerCase()}</span>}
        </div>
      );
    }
    return (
      <div key={card.id} {...common} className={isCurrent ? "printrow printcard active" : "printrow printcard"} title={`${card.set_name} ${card.collector_number}`}>
        <span className="pcpic">
          {card.image_url ? <img src={card.image_url} alt={`${card.name}, ${card.set_name} ${card.collector_number}`} loading="lazy" draggable={false} /> : <span className="pocketname">{card.name}</span>}
          {isCurrent && <span className="badge pccurrent">Current</span>}
        </span>
        <span className="pinfo">{info(card)}</span>
        {finishButtons(card, isCurrent)}
      </div>
    );
  };
  const pages = Math.max(1, Math.ceil(shown.length / 9));
  const pageShown = layout === "binder" ? shown.slice(page * 9, page * 9 + 9) : shown;
  return (
    <div className={`printpick layout-${layout}`}>
      <div className="printhead">
        <input className="search" autoFocus value={term} onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the printing shown selected (or the first one found); Down moves into the list
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              const pick = shown.find((card) => card.id === currentId) ?? shown[0];
              if (pick) onPick(pick, finishFor(pick));
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              (event.currentTarget.closest(".printpick")?.querySelector(".printrow") as HTMLElement | null)?.focus();
            }
          }}
          placeholder="Find a set, code or number" aria-label="Find a printing" />
        <OptionsButton title="Printing chooser options">
          <LayoutRows name="Printings" layout={layout} size={size} onLayout={(chooserLayout) => store.setPrefs({ chooserLayout })} onSize={(chooserSize) => store.setPrefs({ chooserSize })} />
        </OptionsButton>
      </div>
      <p className="note">{shown.length} of {printings.length} printings</p>
      <div className={`printlist ${layout === "list" ? "" : `printgrid size-${layout === "binder" ? "binder" : size}`}`} role="listbox" aria-label="Printings">
        {pageShown.map(item)}
      </div>
      {layout === "binder" && pages > 1 && (
        <div className="binderpager">
          <button type="button" className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next page</button>
        </div>
      )}
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
    ), CHOOSER_WIDTH, "Cancel");
    return;
  }
  customDialog(title, (close) => (
    <TwoSteps name={name} max={max} render={(count) => (
      <PrintingList cardId={cardId} currentId={currentId} finish={current} currency={options.currency} onPick={pickWith(close, count)} />
    )} />
  ), CHOOSER_WIDTH, "Cancel");
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
