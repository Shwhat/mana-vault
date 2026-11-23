// ---------- price history of one printing (0.21.0): one line per store for the finish chosen, with a store picker, a
// crosshair readout, a legend and a table. Prices in US dollars share one chart; Cardmarket (euros) and Cardhoarder
// (MTGO tix) are shown on their own, since one chart never mixes units. ----------
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../api";
import { type Currency, money } from "../types";

type ScryfallPoint = { day: string; usd: number | null; usdFoil: number | null; usdEtched: number | null };
type StorePoint = { store: string; day: string; r: number | null; rf: number | null; re: number | null };
type Finish = "regular" | "foil" | "etched";

/** Each store, with its unit and its fixed color slot (color follows the store, never its rank). */
export const STORE_SERIES: Array<{ id: string; label: string; unit: "USD" | "EUR" | "Tix"; slot: number }> = [
  { id: "tcgplayer", label: "TCGplayer", unit: "USD", slot: 1 },
  { id: "cardkingdom", label: "Card Kingdom", unit: "USD", slot: 2 },
  { id: "cardsphere", label: "CardSphere", unit: "USD", slot: 3 },
  { id: "scryfall", label: "Scryfall", unit: "USD", slot: 4 },
  { id: "cardmarket", label: "Cardmarket", unit: "EUR", slot: 5 },
  { id: "cardhoarder", label: "Cardhoarder", unit: "Tix", slot: 6 },
];

const amount = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? "" : unit === "USD" ? money(value, "usd") : unit === "EUR" ? `€${value.toFixed(2)}` : `${value.toFixed(2)} tix`;

const WIDTH = 560;
const HEIGHT = 220;
const PAD = { left: 52, right: 86, top: 12, bottom: 26 };

/** The last price of a series on or before a day. */
const at = (points: Array<{ day: string; value: number }>, day: string) => {
  let found: number | null = null;
  for (const point of points) {
    if (point.day > day) break;
    found = point.value;
  }
  return found;
};

export function PriceHistory({ cardId, currency: _currency, mainSource = "tcgplayer" }: { cardId: string; currency: Currency; mainSource?: string }) {
  const [scryfall, setScryfall] = useState<ScryfallPoint[] | null>(null);
  const [stores, setStores] = useState<StorePoint[] | null>(null);
  const [finish, setFinish] = useState<Finish>("regular");
  const [picked, setPicked] = useState("usd");
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let live = true;
    setScryfall(null);
    setStores(null);
    request<ScryfallPoint[]>(`/api/cards/${encodeURIComponent(cardId)}/prices`).then((list) => { if (live) setScryfall(list); }).catch(() => { if (live) setScryfall([]); });
    request<StorePoint[]>(`/api/cards/${encodeURIComponent(cardId)}/store-history`).then((list) => { if (live) setStores(list); }).catch(() => { if (live) setStores([]); });
    return () => { live = false; };
  }, [cardId]);

  // every store's points for each finish
  const all = useMemo(() => {
    const map = new Map<string, Record<Finish, Array<{ day: string; value: number }>>>();
    const put = (store: string, which: Finish, day: string, value: number | null) => {
      if (value === null || value === undefined) return;
      const entry = map.get(store) ?? { regular: [], foil: [], etched: [] };
      entry[which].push({ day, value });
      map.set(store, entry);
    };
    for (const point of scryfall ?? []) {
      put("scryfall", "regular", point.day, point.usd);
      put("scryfall", "foil", point.day, point.usdFoil);
      put("scryfall", "etched", point.day, point.usdEtched);
    }
    for (const point of stores ?? []) {
      put(point.store, "regular", point.day, point.r);
      put(point.store, "foil", point.day, point.rf);
      put(point.store, "etched", point.day, point.re);
    }
    for (const entry of map.values()) for (const list of Object.values(entry)) list.sort((a, b) => a.day.localeCompare(b.day));
    return map;
  }, [scryfall, stores]);

  const offered = (["regular", "foil", "etched"] as Finish[]).filter((item) => [...all.values()].some((entry) => entry[item].length));
  const shownFinish = offered.includes(finish) ? finish : offered[0] ?? "regular";
  const storesWith = STORE_SERIES.filter((store) => all.get(store.id)?.[shownFinish].length);
  const choices = [...(storesWith.some((store) => store.unit === "USD") ? [{ value: "usd", label: "US dollar stores" }] : []), ...storesWith.map((store) => ({ value: store.id, label: store.label }))];
  const choice = choices.some((item) => item.value === picked) ? picked : choices[0]?.value ?? "usd";
  // the main price source is drawn first, then the others in their fixed order
  const series = (choice === "usd" ? storesWith.filter((store) => store.unit === "USD") : storesWith.filter((store) => store.id === choice))
    .sort((a, b) => (a.id === mainSource ? -1 : b.id === mainSource ? 1 : 0))
    .map((store) => ({ ...store, points: all.get(store.id)![shownFinish] }));
  const unit = series[0]?.unit ?? "USD";

  if (scryfall === null || stores === null) return <p className="note">Loading the price history</p>;
  if (!series.length) return <p className="note">No price history yet. Prices are saved with each card database update and each day's MTGJSON prices.</p>;

  const days = [...new Set(series.flatMap((item) => item.points.map((point) => point.day)))].sort();
  const times = days.map((day) => Date.parse(day));
  const [first, last] = [times[0]!, times[times.length - 1]!];
  const top = Math.max(...series.flatMap((item) => item.points.map((point) => point.value))) * 1.1 || 1;
  const x = (time: number) => PAD.left + (last === first ? (WIDTH - PAD.left - PAD.right) / 2 : ((time - first) / (last - first)) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => PAD.top + (1 - value / top) * (HEIGHT - PAD.top - PAD.bottom);
  const pathOf = (points: Array<{ day: string; value: number }>) => points.map((point, index) => `${index ? "L" : "M"}${x(Date.parse(point.day)).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const ticks = [0, top / 2, top];
  const near = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const position = ((clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < days.length; index += 1) if (Math.abs(x(times[index]!) - position) < Math.abs(x(times[best]!) - position)) best = index;
    return best;
  };
  const day = hover === null ? null : days[hover]!;
  // direct labels at the line ends, nudged apart so they never overlap
  const ends = series.map((item) => ({ id: item.id, label: item.label, y: y(item.points[item.points.length - 1]!.value) })).sort((a, b) => a.y - b.y);
  for (let index = 1; index < ends.length; index += 1) if (ends[index]!.y - ends[index - 1]!.y < 12) ends[index]!.y = ends[index - 1]!.y + 12;
  return (
    <div className="pricehist">
      <div className="phbar">
        {offered.length > 1 && (
          <div className="seg" role="group" aria-label="Finish">
            {offered.map((item) => (
              <button key={item} type="button" className={item === shownFinish ? "on" : ""} aria-pressed={item === shownFinish} onClick={() => setFinish(item)}>
                {item === "regular" ? "Regular" : item === "foil" ? "Foil" : "Etched"}
              </button>
            ))}
          </div>
        )}
        {choices.length > 1 && (
          <div className="seg" role="group" aria-label="Store">
            {choices.map((item) => (
              <button key={item.value} type="button" className={item.value === choice ? "on" : ""} aria-pressed={item.value === choice} onClick={() => setPicked(item.value)}>{item.label}</button>
            ))}
          </div>
        )}
        <span className="sub grow">{days.length} {days.length === 1 ? "day" : "days"}, {unit === "USD" ? "US dollars" : unit === "EUR" ? "euros" : "MTGO tix"}</span>
        <button type="button" className="btn small" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {series.length > 1 && (
        <div className="phlegend" aria-label="Stores">
          {series.map((item) => <span key={item.id} className="phkey"><i className={`phswatch s${item.slot}`} />{item.label}{item.id === mainSource ? " (main)" : ""}</span>)}
        </div>
      )}
      {table ? (
        <table className="phtable">
          <thead><tr><th>Day</th>{series.map((item) => <th key={item.id}>{item.label}</th>)}</tr></thead>
          <tbody>{[...days].reverse().map((item) => <tr key={item}><td>{item}</td>{series.map((store) => <td key={store.id}>{amount(at(store.points, item), store.unit)}</td>)}</tr>)}</tbody>
        </table>
      ) : (
        <div className="phchart">
          <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Price history of ${series.map((item) => item.label).join(", ")}, from ${days[0]} to ${days[days.length - 1]}`}
            onMouseMove={(event) => setHover(near(event.clientX))} onMouseLeave={() => setHover(null)}
            onTouchMove={(event) => setHover(near(event.touches[0]!.clientX))}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="phgrid" />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="phaxis">{amount(tick, unit)}</text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 6} className="phaxis">{days[0]}</text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="phaxis">{days[days.length - 1]}</text>
            {[...series].reverse().map((item) => (
              <g key={item.id}>
                <path d={pathOf(item.points)} className={`phline s${item.slot}`} />
                {item.points.length === 1 && <circle cx={x(Date.parse(item.points[0]!.day))} cy={y(item.points[0]!.value)} r={4} className={`phdot s${item.slot}`} />}
              </g>
            ))}
            {series.length <= 4 && ends.map((end) => <text key={end.id} x={WIDTH - PAD.right + 6} y={end.y + 4} className="phlabel">{end.label}</text>)}
            {day && hover !== null && (
              <g>
                <line x1={x(times[hover]!)} x2={x(times[hover]!)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="phcross" />
                {series.map((item) => {
                  const value = at(item.points, day);
                  return value === null ? null : <circle key={item.id} cx={x(times[hover]!)} cy={y(value)} r={4} className={`phdot s${item.slot}`} />;
                })}
              </g>
            )}
          </svg>
          {day && (
            <div className="phtip" role="status">
              <b>{day}</b>
              {series.map((item) => <div key={item.id}><i className={`phswatch s${item.slot}`} />{item.label} <b>{amount(at(item.points, day), item.unit) || "no price"}</b></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
