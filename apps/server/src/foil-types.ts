// Scryfall's promo types for special foils, with their display names.
export const SPECIAL_FOILS: Record<string, string> = {
  surgefoil: "Surge foil", galaxyfoil: "Galaxy foil", halofoil: "Halo foil", textured: "Textured foil", manafoil: "Mana foil",
  raisedfoil: "Raised foil", rainbowfoil: "Rainbow foil", confettifoil: "Confetti foil", oilslick: "Oil slick foil", ripplefoil: "Ripple foil",
  fracturefoil: "Fracture foil", doublerainbow: "Double rainbow foil", stepandcompleat: "Step-and-compleat foil", firstplacefoil: "First place foil",
  neonink: "Neon ink foil", invisibleink: "Invisible ink foil", gilded: "Gilded foil", silverfoil: "Silver foil", dragonscalefoil: "Dragon scale foil",
  singularityfoil: "Singularity foil", cosmicfoil: "Cosmic foil", ampersand: "Ampersand foil", embossed: "Embossed foil", headliner: "Headliner foil",
};

/** The special foil a printing is made in, or null for a plain foil. */
export function specialFoil(promoTypes: string | null | undefined): string | null {
  for (const type of String(promoTypes ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    if (SPECIAL_FOILS[type]) return SPECIAL_FOILS[type]!;
    if (type.endsWith("foil") && type.length > 4) return `${type[0]!.toUpperCase()}${type.slice(1, -4)} foil`;
  }
  return null;
}
