// ---------- what each tab was showing (0.21.0): kept for the session, so switching away from a tab and back opens it
// where it was left. Keys start with the tab's view name ("purchases:open"). Pressing a tab's button while already on
// it clears its keys, so it goes back to its first screen. Signing out reloads the page, which clears everything. ----------
import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useState } from "react";

const memory = new Map<string, unknown>();
const RESET = "mana-vault:reset-tab";

/** Like useState, but the value is kept while the tab is closed. */
export function useKept<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const first = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [value, setValue] = useState<T>(() => (memory.has(key) ? memory.get(key) as T : first()));
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((previous) => {
      const resolved = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      memory.set(key, resolved);
      return resolved;
    });
  }, [key]);
  useEffect(() => {
    const reset = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (key.startsWith(`${tab}:`)) setValue(first());
    };
    window.addEventListener(RESET, reset);
    return () => window.removeEventListener(RESET, reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, set];
}

/** Keeps the scroll position of an element while its tab is closed. */
export function useKeptScroll(key: string, ref: RefObject<HTMLElement | null>, ready = true): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || !ready) return;
    const saved = memory.get(`${key}:scroll`);
    if (typeof saved === "number") {
      element.scrollTop = saved;
      // content that loads a moment later is scrolled again
      window.setTimeout(() => { if (element.scrollTop !== saved) element.scrollTop = saved; }, 60);
    }
    const save = () => memory.set(`${key}:scroll`, element.scrollTop);
    element.addEventListener("scroll", save, { passive: true });
    return () => element.removeEventListener("scroll", save);
  }, [key, ref, ready]);
}

/** Clears what a tab was showing, so it opens on its first screen. */
export function resetTab(tab: string): void {
  for (const key of [...memory.keys()]) if (key.startsWith(`${tab}:`)) memory.delete(key);
  window.dispatchEvent(new CustomEvent(RESET, { detail: tab }));
}

/** Reads a kept value outside a component (tests and the tab switch). */
export const keptValue = (key: string) => memory.get(key);
