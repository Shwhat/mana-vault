// ---------- events other parts of the server listen to: copies added to or lowered in a collection, trades completed and
// undone. Purchase history (0.16.0) uses them to tie pulled cards to an opening and to record trades. ----------
import type { DatabaseSync } from "node:sqlite";
import type { CopyKey } from "./copies.js";

export type CopyChange = { key: CopyKey; quantity: number };

type Added = (database: DatabaseSync, userId: number, collectionId: string, items: CopyChange[]) => void;
type Lowered = (database: DatabaseSync, userId: number, collectionId: string, items: CopyChange[]) => void;
/** A completed trade, from the side of one account: what it gave and what it got, with the price of each line. */
export type TradeSide = {
  tradeId: string; userId: number; name: string; partnerName: string | null; collectionId: string | null;
  given: Array<CopyChange & { collectionId: string; price: number | null }>;
  got: Array<CopyChange & { price: number | null }>;
};

/** Copies that moved to another collection or changed printing or finish: the same physical cards, so ties follow them. */
type Moved = (database: DatabaseSync, from: { collectionId: string; key: CopyKey }, to: { collectionId: string; key: CopyKey }, quantity: number) => void;

const added: Added[] = [];
const moved: Moved[] = [];
export const onCopiesMoved = (listener: Moved) => { moved.push(listener); };
/** Called before the copies leave the source, so listeners can still count what the source holds. */
export function copiesMoved(database: DatabaseSync, from: { collectionId: string; key: CopyKey }, to: { collectionId: string; key: CopyKey }, quantity: number): void {
  if (quantity <= 0) return;
  for (const listener of moved) listener(database, from, to, quantity);
}
const lowered: Lowered[] = [];
const traded: Array<(database: DatabaseSync, side: TradeSide) => void> = [];
const reopened: Array<(database: DatabaseSync, tradeId: string) => void> = [];

export const onCopiesAdded = (listener: Added) => { added.push(listener); };
export const onCopiesLowered = (listener: Lowered) => { lowered.push(listener); };
export const onTradeDone = (listener: (database: DatabaseSync, side: TradeSide) => void) => { traded.push(listener); };
export const onTradeReopened = (listener: (database: DatabaseSync, tradeId: string) => void) => { reopened.push(listener); };

export function copiesAdded(database: DatabaseSync, userId: number | undefined, collectionId: string, items: CopyChange[]): void {
  if (!userId || !items.length) return;
  for (const listener of added) listener(database, userId, collectionId, items.filter((item) => item.quantity > 0));
}
export function copiesLowered(database: DatabaseSync, userId: number | undefined, collectionId: string, items: CopyChange[]): void {
  if (!userId || !items.length) return;
  for (const listener of lowered) listener(database, userId, collectionId, items.filter((item) => item.quantity > 0));
}
export function tradeDone(database: DatabaseSync, side: TradeSide): void {
  for (const listener of traded) listener(database, side);
}
export function tradeReopened(database: DatabaseSync, tradeId: string): void {
  for (const listener of reopened) listener(database, tradeId);
}
