// ---------- the main price source of the account making a request (0.21.0) ----------
// Every price the server works out (collection value, deck value, purchases, trades, search by price) uses the main
// price source the account chose in Settings, Prices. The source is kept for the whole request, across awaits.
import { AsyncLocalStorage } from "node:async_hooks";
import { type PriceSource, priceColumns, sourcePrice } from "./mtgjson.js";

const storage = new AsyncLocalStorage<{ source: PriceSource }>();

/** The main price source of the request being handled (TCGplayer outside a request). */
export const activeSource = (): PriceSource => storage.getStore()?.source ?? "tcgplayer";

/** Sets the main price source for the rest of the request. */
export const enterSource = (source: PriceSource) => storage.enterWith({ source });

/** Runs work with a main price source (tests and background work). */
export const withSource = <T>(source: PriceSource, work: () => T): T => storage.run({ source }, work);

/** SQL for a card's regular, foil and etched price from the main source. */
export const usdSql = (card = "c") => sourcePrice(activeSource(), "", card);
export const usdFoilSql = (card = "c") => sourcePrice(activeSource(), "_foil", card);
export const usdEtchedSql = (card = "c") => sourcePrice(activeSource(), "_etched", card);

/** The five price columns the interface reads, from the main source. */
export const priceCols = (card = "c") => priceColumns(activeSource(), card);
