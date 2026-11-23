// ---------- notes (0.22.0): pictures added in the Android app while offline, shown from the phone until they are sent ----------
const local = new Map<string, string>();

/** Keeps a picture's data address under its server address until the picture reaches the server. */
export function keepLocalFile(url: string, dataUrl: string) {
  local.set(url, dataUrl);
}

export const localFile = (url: string) => local.get(url);

/** Sent by the Android app when a queued page change met a newer save on the server. */
export const NOTE_CLASH = "mana-vault-note-clash";
