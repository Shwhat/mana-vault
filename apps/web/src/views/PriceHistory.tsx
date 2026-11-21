// ---------- price history of one printing: a line chart of the saved prices with a hover readout and a table ----------
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../api";
import { type Currency, money } from "../types";

type PricePoint = { day: string; usd: number | null; usdFoil: number | null; usdEtched: number | null };
type Finish = "regular" | "foil" | "etched";

const valueOf = (point: PricePoint, finish: Finish, _currency: Currency): number | null => {
  return finish === "regular" ? point.usd : finish === "foil" ? point.usdFoil : point.usdEtched ?? point.usdFoil;
};

const WIDTH = 560;
const HEIGHT = 200;
const PAD = { left: 48, right: 12, top: 12, bottom: 26 };

/** Saved prices of a printing, one line for the finish chosen; prices are saved with each card database update. */
export function PriceHistory({ cardId, currency }: { cardId: string; currency: Currency }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [finish, setFinish] = useState<Finish>("regular");
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let live = true;
    setPoints(null);
    request<PricePoint[]>(`/api/cards/${encodeURIComponent(cardId)}/prices`).then((list) => { if (live) setPoints(list); }).catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [cardId]);

  const offered = useMemo(() => (["regular", "foil", "etched"] as Finish[])
    .filter((item) => (points ?? []).some((point) => valueOf(point, item, currency) !== null && !(item === "etched" && point.usdEtched === null))), [points, currency]);
  const shown = offered.includes(finish) ? finish : offered[0] ?? "regular";
  const series = useMemo(() => (points ?? []).map((point) => ({ day: point.day, value: valueOf(point, shown, currency) }))
    .filter((point): point is { day: string; value: number } => point.value !== null), [points, shown, currency]);

  if (points === null) return <p className="note">Loading the price history</p>;
  if (!series.length) return <p className="note">No price history yet. Prices are saved with each card database update.</p>;

  const times = series.map((point) => Date.parse(point.day));
  const [first, last] = [Math.min(...times), Math.max(...times)];
  const top = Math.max(...series.map((point) => point.value)) * 1.1 || 1;
  const x = (time: number) => PAD.left + (last === first ? (WIDTH - PAD.left - PAD.right) / 2 : ((time - first) / (last - first)) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => PAD.top + (1 - value / top) * (HEIGHT - PAD.top - PAD.bottom);
  const path = series.map((point, index) => `${index ? "L" : "M"}${x(times[index]!).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const ticks = [0, top / 2, top];
  const near = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const at = ((clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < series.length; index += 1) if (Math.abs(x(times[index]!) - at) < Math.abs(x(times[best]!) - at)) best = index;
    return best;
  };
  const point = hover === null ? null : series[hover];
  return (
    <div className="pricehist">
      <div className="phbar">
        {offered.length > 1 && (
          <div className="seg" role="group" aria-label="Finish">
            {offered.map((item) => (
              <button key={item} type="button" className={item === shown ? "on" : ""} aria-pressed={item === shown} onClick={() => setFinish(item)}>
                {item === "regular" ? "Regular" : item === "foil" ? "Foil" : "Etched"}
              </button>
            ))}
          </div>
        )}
        <span className="sub grow">{series.length} saved {series.length === 1 ? "price" : "prices"}, {currency.toUpperCase()}</span>
        <button type="button" className="btn small" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <table className="phtable">
          <thead><tr><th>Day</th><th>Price</th></tr></thead>
          <tbody>{[...series].reverse().map((item) => <tr key={item.day}><td>{item.day}</td><td>{money(item.value, currency)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="phchart">
          <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Price history, ${series.length} prices from ${series[0]!.day} to ${series[series.length - 1]!.day}`}
            onMouseMove={(event) => setHover(near(event.clientX))} onMouseLeave={() => setHover(null)}
            onTouchMove={(event) => setHover(near(event.touches[0]!.clientX))}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="phgrid" />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="phaxis">{money(tick, currency)}</text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 6} className="phaxis">{series[0]!.day}</text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="phaxis">{series[series.length - 1]!.day}</text>
            <path d={path} className="phline" />
            {series.length === 1 && <circle cx={x(times[0]!)} cy={y(series[0]!.value)} r={4} className="phdot" />}
            {point && hover !== null && (
              <g>
                <line x1={x(times[hover]!)} x2={x(times[hover]!)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="phcross" />
                <circle cx={x(times[hover]!)} cy={y(point.value)} r={4} className="phdot" />
              </g>
            )}
          </svg>
          {point && <div className="phtip" role="status">{point.day}: <b>{money(point.value, currency)}</b></div>}
        </div>
      )}
    </div>
  );
}
