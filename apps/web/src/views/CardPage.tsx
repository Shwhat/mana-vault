// ---------- card page: the card's art, text, versions with prices, rulings and what you own ----------
import { LanguagePip, SetIcon } from "../components/CardMarks";
import { SymbolText } from "../components/SymbolPicker";
import { addCardToWishlist, addMenuItems } from "../components/AddButtons";
import { PriceHistory } from "./PriceHistory";
import { useEffect, useState } from "react";
import type { Action } from "../actions";
import { request } from "../api";
import { Icon } from "../icons";
import { type Store, useApp } from "../store";
import { preconAsDeck } from "../components/Precons";
import { capitalize, type CardDetail, money, type PriceFields } from "../types";

type Version = PriceFields & {
  id: string; name: string; set_code: string; set_name: string; collector_number: string; rarity: string; image_url: string | null; finishes: string;
  released_at: string | null;
};
type Ruling = { date: string; text: string };

/** Scryfall's art crop sits beside the normal image under the same address. */
const artOf = (url: string | null) => (url && url.includes("/normal/") ? url.replace("/normal/", "/art_crop/") : url);

export function CardPage({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const id = store.cardPage!;
  const [card, setCard] = useState<(CardDetail & { power?: string | null; toughness?: string | null }) | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [tab, setTab] = useState<"versions" | "rulings" | "prices" | "stores" | "found">("versions");
  // MTGJSON details (0.21.0): every store's prices, the printed text, leadership and where the printing comes from
  const [market, setMarket] = useState<Market | null>(null);
  const [printed, setPrinted] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const currency = store.prefs.currency;

  useEffect(() => {
    let active = true;
    setCard(null);
    setError("");
    setRulings(null);
    request<CardDetail>(`/api/cards/${encodeURIComponent(id)}`).then((value) => { if (active) setCard(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load the card."); });
    request<Version[]>(`/api/cards/${encodeURIComponent(id)}/printings`).then((value) => { if (active) setVersions(value); }).catch(() => setVersions([]));
    request<Ruling[]>(`/api/cards/${encodeURIComponent(id)}/rulings`).then((value) => { if (active) setRulings(value); }).catch(() => { if (active) setRulings([]); });
    setMarket(null);
    request<Market>(`/api/cards/${encodeURIComponent(id)}/market`).then((value) => { if (active) setMarket(value); }).catch(() => { if (active) setMarket(null); });
    return () => { active = false; };
  }, [id]);

  const close = () => store.setCardPage(null);
  if (error) return <div className="view cardpage"><div className="cpbar"><button type="button" className="btn" onClick={close}>Back</button></div><div className="emptynote err">{error}</div></div>;
  if (!card) return <div className="view cardpage"><div className="emptynote">Loading the card</div></div>;

  const price = (fields: PriceFields, finish: "regular" | "foil" | "etched") => {
    return finish === "regular" ? fields.price_usd : finish === "foil" ? fields.price_usd_foil : fields.price_usd_etched;
  };
  const rows = [...versions].sort((a, b) => (a.id === card.id ? -1 : b.id === card.id ? 1 : 0));
  const owned = card.owned;
  const fab: Array<[string, () => void]> = [
    ...addMenuItems(store, card).map((item): [string, () => void] => [item.label, item.run]),
    ["Add as proxy", () => void store.addToCollection(card.id, card.name, undefined, undefined, true)],
    ["Add to wishlist", () => void addCardToWishlist(store, card)],
  ];
  return (
    <div className="view cardpage" id="view-card">
      <div className="cpart" style={artOf(card.image_url) ? { backgroundImage: `url("${artOf(card.image_url)}")` } : undefined}>
        <button type="button" className="cpback" aria-label="Back" onClick={close}>←</button>
        <span className="cpartname">{card.name}</span>
      </div>
      <div className="list cpbody">
        <div className="cphead">
          <div><h2>{card.name}</h2><div className="cptype">{card.type_line}</div></div>
          <div className="cpright"><span className="mana">{card.mana_cost ? <SymbolText text={card.mana_cost} /> : null}</span>{card.power != null && <b className="cppt">{card.power}/{card.toughness}</b>}</div>
        </div>
        {market && market.printedText && (market.printedText !== market.oracleText || (market.printedType && market.printedType !== market.typeLine)) && (
          <div className="cptextbar">
            <div className="seg" role="group" aria-label="Card text">
              <button type="button" className={printed ? "" : "on"} aria-pressed={!printed} onClick={() => setPrinted(false)}>Oracle</button>
              <button type="button" className={printed ? "on" : ""} aria-pressed={printed} onClick={() => setPrinted(true)}>Printed</button>
            </div>
            {printed && market.printedType && <span className="sub">{market.printedType}</span>}
          </div>
        )}
        {(() => {
          const text = printed && market?.printedText ? market.printedText : card.oracle_text;
          return text ? <div className="cptext">{text.split("\n").map((line, index) => <p key={index}><SymbolText text={line} /></p>)}</div> : null;
        })()}
        {market?.leadership && (market.leadership.commander || market.leadership.oathbreaker || market.leadership.brawl) && (
          <div className="cplead">{(["commander", "oathbreaker", "brawl"] as const).filter((format) => market.leadership![format]).map((format) => (
            <span key={format} className="badge">Can lead {format === "commander" ? "Commander" : format === "oathbreaker" ? "Oathbreaker" : "Brawl"}</span>
          ))}{market.isReprint && <span className="badge">Reprint</span>}</div>
        )}
        <div className="cpowned">
          {owned.allPrintings + (owned.proxies ?? 0) === 0 ? <span className="sub">Not in your collections</span> : owned.collections.map((place) => (
            <span key={place.id} className="badge">{place.name}: {place.allPrintings}{place.proxies ? ` (+${place.proxies} proxy)` : ""}</span>
          ))}
          {card.wanted.map((place) => <span key={place.id} className="badge wish">Wanted in {place.name}</span>)}
        </div>
        <div className="seg cptabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "versions"} className={tab === "versions" ? "on" : ""} onClick={() => setTab("versions")}>Versions</button>
          <button type="button" role="tab" aria-selected={tab === "rulings"} className={tab === "rulings" ? "on" : ""} onClick={() => setTab("rulings")}>Rulings</button>
          <button type="button" role="tab" aria-selected={tab === "stores"} className={tab === "stores" ? "on" : ""} onClick={() => setTab("stores")}>Prices</button>
          <button type="button" role="tab" aria-selected={tab === "prices"} className={tab === "prices" ? "on" : ""} onClick={() => setTab("prices")}>Price history</button>
          <button type="button" role="tab" aria-selected={tab === "found"} className={tab === "found" ? "on" : ""} onClick={() => setTab("found")}>Found in</button>
        </div>
        {tab === "versions" && (
          <div className="cpversions">
            <div className="cpnote sub">Market price ({currency.toUpperCase()})</div>
            {rows.map((version) => {
              const finishes = version.finishes ? version.finishes.split(",") : ["nonfoil", "foil"];
              return (
                <div key={version.id} className={version.id === card.id ? "cpver on" : "cpver"} onClick={() => store.setCardPage(version.id)}>
                  {version.image_url ? <img className="thumb-img" src={version.image_url} alt="" loading="lazy" /> : <span className="thumb-img none">MV</span>}
                  <div className="cpvermain">
                    <b><SetIcon code={version.set_code} />{version.set_name} ({version.set_code.toUpperCase()}) <LanguagePip lang={(version as { lang?: string }).lang} /></b>
                    <span className="sub">#{version.collector_number} {capitalize(version.rarity)}{version.released_at ? `, ${version.released_at.slice(0, 4)}` : ""}</span>
                  </div>
                  <div className="cpprices">
                    {finishes.includes("nonfoil") && <span><span className="sub">Normal</span> {money(price(version, "regular"), currency)}</span>}
                    {finishes.includes("foil") && <span><span className="sub">Foil</span> {money(price(version, "foil"), currency)}</span>}
                    {finishes.includes("etched") && <span><span className="sub">Etched</span> {money(price(version, "etched") ?? price(version, "foil"), currency)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === "prices" && <PriceHistory cardId={card.id} currency={currency} mainSource={market?.mainSource} />}
        {tab === "stores" && <StorePrices market={market} />}
        {tab === "found" && <FoundIn store={store} market={market} />}
        {tab === "rulings" && (
          <div className="cprulings">
            {rulings === null && <p className="note">Loading rulings</p>}
            {rulings?.length === 0 && <p className="note">No rulings</p>}
            {rulings?.map((ruling, index) => <div className="cpruling" key={index}><span className="sub">{ruling.date}</span><p>{ruling.text}</p></div>)}
          </div>
        )}
      </div>
      <button type="button" className="fab" aria-label="Card actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="menu" /></button>
      {menu && (
        <div className="fabmenu" role="menu">
          {fab.map(([label, run]) => <button key={label} type="button" role="menuitem" className="pmrow" onClick={() => { setMenu(false); run(); }}><span>{label}</span></button>)}
          {actions.scan && <button type="button" role="menuitem" className="pmrow" onClick={() => { setMenu(false); close(); actions.scan!.run(); }}><span>Scan cards</span></button>}
        </div>
      )}
    </div>
  );
}

type StoreRow = { store: string; label: string; currency: string; r: number | null; rf: number | null; re: number | null; b: number | null; bf: number | null; be: number | null };
type Market = {
  mainSource: string; prices: StoreRow[]; oracleText: string | null; typeLine: string | null; printedText: string | null; printedType: string | null;
  isReprint: boolean; isStarter: boolean; leadership: { commander: boolean; oathbreaker: boolean; brawl: boolean } | null; hasRecord: boolean;
  foundIn: Array<{ id: string; name: string; setCode: string; product: string; productLabel: string; deckName: string | null; deckCode: string | null; finishes: number[] }>;
};

const storeMoney = (value: number | null, unit: string) => (value === null ? "" : unit === "USD" ? money(value, "usd") : unit === "EUR" ? `€${value.toFixed(2)}` : `${value.toFixed(2)} tix`);

/** Prices (0.21.0): one row per store, regular, foil and etched, retail and buylist. A store with no price shows a blank cell. */
function StorePrices({ market }: { market: Market | null }) {
  if (!market) return <p className="note">Loading the prices</p>;
  const rows = [...market.prices].sort((a, b) => (a.store === market.mainSource ? -1 : b.store === market.mainSource ? 1 : 0));
  return (
    <div className="gridwrapper">
      <table className="cpstores">
        <thead><tr><th>Store</th><th>Regular</th><th>Foil</th><th>Etched</th><th>Buylist</th><th>Buylist foil</th><th>Buylist etched</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.store} className={row.store === market.mainSource ? "main" : ""}>
              <td>{row.label}{row.store === market.mainSource ? " (main)" : ""}{row.currency !== "USD" ? <span className="sub"> {row.currency === "EUR" ? "euros" : "MTGO tix"}</span> : null}</td>
              {(["r", "rf", "re", "b", "bf", "be"] as const).map((kind) => <td key={kind}>{storeMoney(row[kind], row.currency)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!market.hasRecord && <p className="note">MTGJSON has no record of this printing yet, so only Scryfall's prices are shown.</p>}
    </div>
  );
}

/** Found in (0.21.0): every sealed product and precon the printing can come from, grouped by product type. */
function FoundIn({ store, market }: { store: Store; market: Market | null }) {
  if (!market) return <p className="note">Loading the products</p>;
  if (!market.foundIn.length) return <p className="note">No product lists this printing.</p>;
  const groups = new Map<string, Market["foundIn"]>();
  for (const item of market.foundIn) groups.set(item.productLabel, [...(groups.get(item.productLabel) ?? []), item]);
  const finish = (codes: number[]) => codes.map((code) => (code === 1 ? "foil" : code === 2 ? "etched" : "regular")).join(", ");
  return (
    <div className="cpfound">
      {[...groups.entries()].map(([label, items]) => (
        <section key={label}>
          <h5>{label}</h5>
          {items.map((item) => (
            <button key={item.id} type="button" className="lnk" title={item.deckName ? "Open its decklist as a new deck" : "Find the cards this product holds"}
              onClick={() => { if (item.deckName) void preconAsDeck(store, item.deckCode ?? item.setCode.toUpperCase(), item.deckName); else { store.setFilters({ query: `in:"${item.name}"` }); store.setView("cards"); } }}>
              <SetIcon code={item.setCode} />{item.name} <span className="sub">({finish(item.finishes)})</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
