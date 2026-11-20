// ---------- proxy state: the print list, kept per account on the server ----------
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import type { Faces, PrintCard, PrintLine } from "./proxy-print";

export type ProxyDeps = {
  flash: (text: string, kind?: "ok" | "err") => void;
  fail: (reason: unknown, fallback: string) => void;
};

/** A card as it is added to the print list: any card row the app shows has these details. */
export type CardForPrint = {
  id: string; oracle_id?: string; name: string; type_line?: string; set_code: string; set_name?: string; collector_number: string;
  image_url?: string | null; custom?: boolean; hasBack?: boolean; back_image_url?: string | null;
};

const toPrintCard = (card: CardForPrint): PrintCard => ({
  id: card.id, oracle_id: card.oracle_id ?? card.id, name: card.name, type_line: card.type_line ?? "", set_code: card.set_code, set_name: card.set_name ?? "",
  collector_number: card.collector_number, image_url: card.image_url ?? null, custom: !!card.custom,
  hasBack: card.hasBack ?? !!card.back_image_url,
});

export function useProxyState({ flash, fail }: ProxyDeps) {
  const [lines, setLines] = useState<PrintLine[] | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef<PrintLine[] | null>(null);
  latest.current = lines;

  const loadPrintList = useCallback(async () => {
    try {
      setLines(await request<PrintLine[]>("/api/proxies/list"));
    } catch (reason) {
      fail(reason, "Could not load the print list.");
    }
  }, [fail]);

  // changes are saved a moment after the last one, so typing a count does not send a request per key;
  // a change still waiting is sent when the page closes
  const pending = useRef<PrintLine[] | null>(null);
  const send = useCallback((next: PrintLine[], keepalive = false) => request("/api/proxies/list", {
    method: "PUT", keepalive, body: JSON.stringify({ lines: next.map(({ id, cardId, count, faces }) => ({ id, cardId, count, faces })) }),
  }), []);
  const flush = useCallback((keepalive = false) => {
    window.clearTimeout(saveTimer.current);
    const next = pending.current;
    pending.current = null;
    if (next) void send(next, keepalive).catch((reason: unknown) => fail(reason, "Could not save the print list."));
  }, [send, fail]);
  const save = useCallback((next: PrintLine[]) => {
    window.clearTimeout(saveTimer.current);
    pending.current = next;
    saveTimer.current = window.setTimeout(() => flush(), 400);
  }, [flush]);
  useEffect(() => {
    const leave = () => flush(true);
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); flush(true); };
  }, [flush]);

  const changeLines = useCallback((change: (current: PrintLine[]) => PrintLine[]) => {
    const next = change(latest.current ?? []);
    latest.current = next;
    setLines(next);
    save(next);
  }, [save]);

  /** Adds cards to the print list. A card already listed with the same faces gets its count raised. */
  const addToPrintList = useCallback(async (cards: Array<{ card: CardForPrint; count: number; faces?: Faces }>, label?: string) => {
    if (latest.current === null) await loadPrintList();
    if (!cards.length) return flash("There are no cards to add", "err");
    const next = [...(latest.current ?? [])];
    for (const { card, count, faces = "front" } of cards) {
      const index = next.findIndex((line) => line.cardId === card.id && line.faces === faces);
      if (index >= 0) next[index] = { ...next[index]!, count: Math.min(100, next[index]!.count + count) };
      else next.push({ id: crypto.randomUUID(), cardId: card.id, count: Math.min(100, Math.max(1, count)), faces, card: toPrintCard(card) });
    }
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    try {
      // saved at once, then read back so each line has its card's details (such as a back face)
      await send(next.slice(0, 1000));
      await loadPrintList();
    } catch (reason) {
      return fail(reason, "Could not add the cards to the print list.");
    }
    const total = cards.reduce((sum, item) => sum + item.count, 0);
    flash(`${label ?? `${total} ${total === 1 ? "card" : "cards"}`} added to the print list`);
  }, [flash, fail, loadPrintList, send]);

  const setPrintLine = useCallback((id: string, change: Partial<Pick<PrintLine, "count" | "faces" | "cardId" | "card">>) => {
    changeLines((current) => current.map((line) => (line.id === id ? { ...line, ...change } : line)));
  }, [changeLines]);

  const removePrintLine = useCallback((id: string) => changeLines((current) => current.filter((line) => line.id !== id)), [changeLines]);
  const clearPrintList = useCallback(() => changeLines(() => []), [changeLines]);

  return { printList: lines, loadPrintList, addToPrintList, setPrintLine, removePrintLine, clearPrintList };
}
