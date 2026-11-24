type ProfileCard = {
  oracle_id: string;
  zone: string;
  color_identity?: string | null;
  oracle_text?: string | null;
};

const SIGNALS: Array<[string, RegExp]> = [
  ["Landfall", /\blandfall\b|whenever (?:a land|one or more lands)(?: you control)? enters?\b/i],
  ["Tokens", /\bcreates?\b[^\n.]{0,180}\btokens?\b/i],
  ["Food", /\bfood\b/i],
  ["Amass", /\bamass\b/i],
  ["Treasure", /\btreasure\b/i],
  ["Clues", /\bclues?\b|\binvestigate\b/i],
  ["Counters", /\b(?:\+1\/\+1|-1\/-1) counters?\b/i],
  ["Sacrifice", /\bsacrifice(?:s|d)?\b/i],
  ["Graveyard", /\bgraveyards?\b/i],
  ["Lifegain", /\bgains? \d+ life\b|\bgain life\b/i],
  ["Mill", /\bmills?\b/i],
  ["Cycling", /\bcycling\b/i],
  ["Proliferate", /\bproliferate\b/i],
];

/** Colors and repeated mechanics are signals from the main deck, not an archetype classification. */
export function deckProfile(cards: ProfileCard[]): { color_identity: string; themes: string[] } {
  const played = cards.filter((card) => card.zone === "main" || card.zone === "commander");
  const commanders = played.filter((card) => card.zone === "commander");
  const colorCards = commanders.length ? commanders : played;
  const identity = colorCards.map((card) => card.color_identity ?? "").join("");
  const color_identity = [..."WUBRG"].filter((color) => identity.includes(color)).join("") || (colorCards.length ? "C" : "");
  const matches = SIGNALS.map(([name, pattern]) => {
    const ids = new Set(played.filter((card) => pattern.test(card.oracle_text ?? "")).map((card) => card.oracle_id));
    return { name, count: ids.size };
  });
  return {
    color_identity,
    themes: matches.filter((item) => item.count >= 2).sort((a, b) => b.count - a.count).map((item) => item.name),
  };
}
