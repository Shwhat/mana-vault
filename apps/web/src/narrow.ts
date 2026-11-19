// ---------- the phone layout: narrow windows and the Android app ----------
import { useEffect, useState } from "react";
import { isApp } from "./android/platform";

const QUERY = "(max-width: 899px)";

/** True while the window is narrower than 900 px. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const listener = () => setNarrow(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return narrow;
}

/** True when the phone layout is shown: a narrow window, or always in the Android app. */
export function usePhone() {
  return useNarrow() || isApp();
}
