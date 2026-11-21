// ---------- pick or open: one click picks a collection or deck as the add target, a second click soon after opens it ----------
import type { KeyboardEvent } from "react";
import { isApp } from "../android/platform";

/** How long after the first click a second click on the same row counts as a double click (or double tap). */
export const DOUBLE_CLICK_MS = 450;

let last = { key: "", at: 0 };

/**
 * Props for a collection or deck row. A single click (or tap) runs `pick`; a second click on the same row
 * within DOUBLE_CLICK_MS runs `open`. Mouse and touch behave the same. Enter opens; Space picks.
 * In the Android app one tap opens (0.15.0): the deck or collection that is open is where cards go.
 */
export function pickOrOpen(key: string, pick: () => void, open: () => void) {
  return {
    onClick: () => {
      if (isApp()) return open();
      const now = Date.now();
      if (last.key === key && now - last.at < DOUBLE_CLICK_MS) {
        last = { key: "", at: 0 };
        open();
      } else {
        last = { key, at: now };
        pick();
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); open(); }
      else if (event.key === " ") { event.preventDefault(); pick(); }
    },
    tabIndex: 0,
  };
}
