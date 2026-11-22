// ---------- pick or open: how a click on a collection or deck works (0.18.0) ----------
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

/** How long between two taps on a touch screen counts as a double tap. */
export const DOUBLE_TAP_MS = 350;

let lastTap = { key: "", at: 0 };
let pointer = "mouse";

/**
 * Props for a collection or deck row in the Collections and Decks panels.
 *
 * - `opensOnClick` (the Collection and Deck tabs): one click or tap opens it.
 * - Otherwise (card search and the other tabs): one click or tap picks it as where cards go and the view stays. A true
 *   double click (the system's double-click speed) or a double tap opens it in its tab. A slow second click only picks
 *   it again.
 *
 * Enter opens; Space picks.
 */
export function pickOrOpen(key: string, pick: () => void, open: () => void, opensOnClick = false) {
  return {
    onPointerDown: (event: PointerEvent) => { pointer = event.pointerType; },
    onClick: (event: MouseEvent) => {
      if (opensOnClick) return open();
      if (pointer === "touch") {
        const now = Date.now();
        if (lastTap.key === key && now - lastTap.at < DOUBLE_TAP_MS) {
          lastTap = { key: "", at: 0 };
          return open();
        }
        lastTap = { key, at: now };
        return pick();
      }
      if (event.detail >= 2) return open();
      pick();
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); open(); }
      else if (event.key === " ") { event.preventDefault(); pick(); }
    },
    tabIndex: 0,
  };
}
