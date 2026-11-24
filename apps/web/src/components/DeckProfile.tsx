import { COLOR_NAMES, type Deck } from "../types";
import { SymbolGlyph } from "./SymbolPicker";

export function DeckProfile({ deck }: { deck: Pick<Deck, "color_identity" | "themes"> }) {
  const colors = [...(deck.color_identity ?? "")].filter((color) => "WUBRGC".includes(color));
  const themes = deck.themes ?? [];
  if (!colors.length && !themes.length) return null;
  const names = colors.map((color) => color === "C" ? "Colorless" : COLOR_NAMES[color] ?? color);
  return (
    <span className="deckprofile">
      {colors.length > 0 && <span className="deckcolors" role="img" aria-label={`Color identity: ${names.join(", ")}`} title={`Color identity: ${names.join(", ")}`}>
        {colors.map((color) => <SymbolGlyph key={color} code={color} size={16} />)}
      </span>}
      {themes.map((theme) => <span key={theme} className="badge decktheme" title="Possible theme, based on repeated card text">{theme}</span>)}
    </span>
  );
}
