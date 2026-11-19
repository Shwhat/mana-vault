// ---------- statistics: stat tiles and bar charts for a collection or a deck ----------
import { useState } from "react";
import { Icon } from "../icons";
import { useApp } from "../store";
import { type Bucket, COLOR_NAMES, type Currency, type Facets, money, type Stats } from "../types";

type Measure = "count" | "value";

/**
 * Horizontal bars on one baseline in the accent hue: magnitude, not identity, so every bar has the same color.
 * The figure sits at the bar's tip in text color. Hovering or focusing a row shows its tooltip; clicking it filters.
 */
function BarList({ title, buckets, measure, currency, ordered, onPick, labelOf }: {
  title: string; buckets: Bucket[]; measure: Measure; currency: Currency; ordered?: boolean;
  onPick?: (bucket: Bucket) => void; labelOf?: (bucket: Bucket) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = ordered ? buckets : [...buckets].sort((a, b) => (measure === "count" ? b.count - a.count : b.value - a.value));
  const amount = (bucket: Bucket) => (measure === "count" ? bucket.count : bucket.value);
  const max = Math.max(0, ...shown.map(amount));
  const figure = (bucket: Bucket) => (measure === "count" ? bucket.count.toLocaleString() : money(bucket.value, currency));
  const label = (bucket: Bucket) => labelOf?.(bucket) ?? bucket.label;
  const total = shown.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <section className="chartcard" aria-label={title}>
      <h4>{title}</h4>
      {shown.length === 0 && <p className="note">Nothing to show.</p>}
      <div className="bars" role="table" aria-label={title}>
        {shown.map((bucket) => {
          const width = max > 0 ? Math.max(amount(bucket) > 0 ? 1.5 : 0, (amount(bucket) / max) * 100) : 0;
          const share = total ? Math.round((bucket.count / total) * 1000) / 10 : 0;
          const tip = `${label(bucket)}: ${bucket.count.toLocaleString()} ${bucket.count === 1 ? "card" : "cards"} (${share}%), ${money(bucket.value, currency)}`;
          return (
            <div key={bucket.key} role="row" tabIndex={onPick ? 0 : -1} aria-label={tip}
              className={`barrow${onPick ? " pickable" : ""}${hover === bucket.key ? " hover" : ""}`}
              onMouseEnter={() => setHover(bucket.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(bucket.key)} onBlur={() => setHover(null)}
              onClick={() => onPick?.(bucket)} onKeyDown={(event) => { if (event.key === "Enter" && onPick) { event.stopPropagation(); onPick(bucket); } }}>
              <span role="cell" className="barlabel" title={label(bucket)}>{label(bucket)}</span>
              <span role="cell" className="bartrack">
                <span className="barfill" style={{ width: `${width}%` }} />
                <span className="barfig">{figure(bucket)}</span>
              </span>
              {hover === bucket.key && <span className="bartip" role="tooltip">{tip}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Columns in mana value order, the cap carrying the figure. */
function Curve({ buckets, measure, currency, onPick }: { buckets: Bucket[]; measure: Measure; currency: Currency; onPick?: (bucket: Bucket) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const amount = (bucket: Bucket) => (measure === "count" ? bucket.count : bucket.value);
  const max = Math.max(0, ...buckets.map(amount));
  return (
    <section className="chartcard wide" aria-label="Mana curve">
      <h4>Mana curve <span className="sub">(lands left out)</span></h4>
      <div className="cvs" role="table" aria-label="Mana curve">
        {buckets.map((bucket) => {
          const tip = `Mana value ${bucket.label}: ${bucket.count.toLocaleString()} ${bucket.count === 1 ? "card" : "cards"}, ${money(bucket.value, currency)}`;
          return (
            <div key={bucket.key} role="row" tabIndex={onPick ? 0 : -1} aria-label={tip}
              className={`cvitem${onPick ? " pickable" : ""}${hover === bucket.key ? " hover" : ""}`}
              onMouseEnter={() => setHover(bucket.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(bucket.key)} onBlur={() => setHover(null)}
              onClick={() => onPick?.(bucket)} onKeyDown={(event) => { if (event.key === "Enter" && onPick) { event.stopPropagation(); onPick(bucket); } }}>
              <span role="cell" className="cvfig">{measure === "count" ? bucket.count : money(bucket.value, currency)}</span>
              <span className="cvtrack"><span className="cvfill" style={{ height: `${max ? (amount(bucket) / max) * 100 : 0}%` }} /></span>
              <span role="cell" className="cvlabel">{bucket.label}</span>
              {hover === bucket.key && <span className="bartip" role="tooltip">{tip}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StatsPanel({ stats, kind, onFacet }: { stats: Stats | null; kind: "collection" | "deck"; onFacet?: (facet: Facets) => void }) {
  const store = useApp();
  const [measure, setMeasure] = useState<Measure>("count");
  if (!stats) return <div className="emptynote">Working out the statistics</div>;
  const currency = stats.currency;
  if (stats.cards === 0) {
    return <div className="empty"><Icon name="stats" /><b>No cards yet</b><span>Statistics appear once this {kind} has cards.</span></div>;
  }
  const pick = (facet: (bucket: Bucket) => Facets) => (onFacet ? (bucket: Bucket) => onFacet(facet(bucket)) : undefined);
  return (
    <div className="list statswrap">
      <div className="tilerow">
        <div className="stattile small"><div className="stlabel">Cards</div><div className="stvalue">{stats.cards.toLocaleString()}</div>
          <div className="stsub">{stats.entries.toLocaleString()} {kind === "deck" ? "deck entries" : "rows"}</div></div>
        <div className="stattile small"><div className="stlabel">Value ({currency.toUpperCase()})</div><div className="stvalue">{money(stats.value, currency)}</div>
          <div className="stsub">{stats.unpriced ? `${stats.unpriced.toLocaleString()} ${stats.unpriced === 1 ? "card has" : "cards have"} no price` : "Every card has a price"}</div></div>
        <div className="stattile small"><div className="stlabel">Average per card</div><div className="stvalue">{money(stats.average, currency)}</div>
          <div className="stsub">Median {money(stats.median, currency)}</div></div>
        <div className="stattile small"><div className="stlabel">Most valuable</div><div className="stvalue">{money(stats.highest?.price ?? null, currency)}</div>
          <div className="stsub">{stats.highest?.name ?? "No priced cards"}</div></div>
      </div>
      <div className="rulesline">
        <span>{kind === "deck" ? "Normal decks are priced at the cheapest printing of each card, Theme decks at the chosen printing." : "Each copy is priced in its own finish."}
          {onFacet ? " Click a bar to list those cards." : ""}</span>
        <div className="seg" role="group" aria-label="Measure">
          <button type="button" className={measure === "count" ? "on" : ""} aria-pressed={measure === "count"} onClick={() => setMeasure("count")}>Cards</button>
          <button type="button" className={measure === "value" ? "on" : ""} aria-pressed={measure === "value"} onClick={() => setMeasure("value")}>Value</button>
        </div>
        <button type="button" className="lnk" onClick={() => store.setPrefs({ currency: currency === "usd" ? "eur" : "usd" })}>
          Show in {currency === "usd" ? "euros" : "US dollars"}
        </button>
      </div>
      <div className="chartgrid">
        <Curve buckets={stats.curve} measure={measure} currency={currency} onPick={pick((bucket) => ({ curve: bucket.key }))} />
        <BarList title="Color" buckets={stats.color} measure={measure} currency={currency} labelOf={(bucket) => COLOR_NAMES[bucket.key] ?? bucket.label}
          onPick={pick((bucket) => ({ color: bucket.key }))} />
        <BarList title="Type" buckets={stats.type} measure={measure} currency={currency} onPick={pick((bucket) => ({ type: bucket.key }))} />
        <BarList title="Rarity" buckets={stats.rarity} measure={measure} currency={currency} ordered onPick={pick((bucket) => ({ rarity: bucket.key }))} />
        {stats.finish.length > 0 && <BarList title="Finish" buckets={stats.finish} measure={measure} currency={currency} ordered onPick={pick((bucket) => ({ finish: bucket.key }))} />}
        <BarList title={`Top sets by ${measure === "count" ? "cards" : "value"}`} buckets={stats.sets} measure={measure} currency={currency}
          labelOf={(bucket) => `${bucket.label} (${bucket.key.toUpperCase()})`} onPick={pick((bucket) => ({ set: bucket.key }))} />
      </div>
      <p className="note pad">Type counts a card once for each of its types, so an artifact creature appears under Artifact and Creature. Sets lists the twelve sets with the highest value.</p>
    </div>
  );
}
