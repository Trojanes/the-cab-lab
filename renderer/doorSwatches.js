// Screen swatches for the door colour catalogue (materials.js DOOR_SERIES).
// Display only: job.json and the generators carry the colour *name*; this
// table says what that name looks like in the 3D view.
//
// Values are the "Digital Colour Values" (HEX) on EGR StyleLite's colour
// pages — screen approximations; a physical sample decides the real colour.
//   finish  matte    TruMatte-like: flat, soft sheen
//           gloss    TruGloss-like: clear high-gloss surface
//           metallic Silver TruGloss (Gloss Metallic) finish on our own base
//                    colour: flakes in the body under a clear gloss surface

const EGR = "https://egrdecor.com/";

export const DOOR_SWATCHES = {
  "Gloss White": { hex: 0xeff3f4, finish: "gloss", source: "Arctic TruGloss", url: `${EGR}arctic-trugloss` },
  "Gloss Ash": { hex: 0xc6c2bb, finish: "gloss", source: "Ash TruGloss", url: `${EGR}ash-trugloss` },
  "Gloss Sand": { hex: 0xd7c8ba, finish: "gloss", source: "Sand TruGloss", url: `${EGR}sand-trugloss` },

  "Metallic White": { hex: 0xeff3f4, finish: "metallic", source: "Arctic colour · Silver TG metallic finish", url: `${EGR}arctic-trugloss` },
  "Metallic Silver": { hex: 0xc8c4be, finish: "metallic", source: "Silver TruGloss", url: `${EGR}silver-trugloss` },
  "Metallic Charcoal": { hex: 0x676a6c, finish: "metallic", source: "Slate colour · Silver TG metallic finish", url: `${EGR}slate-trugloss` },
  "Metallic Black": { hex: 0x3b3b3d, finish: "metallic", source: "Carbon colour · Silver TG metallic finish", url: `${EGR}carbon-trumatte` },

  "SuperMatt White": { hex: 0xf2f2ef, finish: "matte", source: "Arctic TruMatte", url: `${EGR}arctic-trumatte` },
  // Light grey. Silver TG's own value is Ash's on screen, so Shade keeps it apart from Ash.
  "SuperMatt Silver": { hex: 0x81807a, finish: "matte", source: "Shade TruMatte", url: `${EGR}shade-trumatte` },
  "SuperMatt Charcoal": { hex: 0x686b6c, finish: "matte", source: "Slate TruMatte", url: `${EGR}slate-trumatte` },
  // The page lists sRGB 56 56 61 next to HEX 3B3B3D; the HEX is used.
  "SuperMatt Black": { hex: 0x3b3b3d, finish: "matte", source: "Carbon TruMatte", url: `${EGR}carbon-trumatte` },
  "SuperMatt Forest Green": { hex: 0x858679, finish: "matte", source: "Rainforest TruMatte", url: `${EGR}rainforest-trumatte` },
  "SuperMatt Deep Ocean": { hex: 0x3f5460, finish: "matte", source: "Oceanic TruMatte", url: `${EGR}oceanic-trumatte` },
  "SuperMatt Ash": { hex: 0xc6c2bb, finish: "matte", source: "Ash TruMatte", url: `${EGR}ash-trumatte` },
  // StyleLite has no matte Sand: Sand's colour with our matte finish.
  "SuperMatt Sand": { hex: 0xd7c8ba, finish: "matte", source: "Sand colour · matte finish", url: `${EGR}sand-trugloss` },
};

// Textured HPL: one 1 m × 1 m image per decor (renderer/textures/hpl, 2048 px from
// the 4096 px originals). The wood grain runs along the image's width; Felt
// Grey is a felt with no direction. `hex` is the image average, for UI chips.
const HPL_TEXTURE_MM = 1000;
const hpl = (name, hex, grained = true) => ({
  hex,
  finish: "wood",
  texture: new URL(`./textures/hpl/${name}.jpg`, import.meta.url).href,
  textureMm: HPL_TEXTURE_MM,
  grained,
  source: `Textured HPL ${name}`,
  url: null,
});
Object.assign(DOOR_SWATCHES, {
  "Pale Driftwood": hpl("Pale Driftwood", 0xc0bfbc),
  "Natural Beech": hpl("Natural Beech", 0xdab78c),
  "Smoked Driftwood": hpl("Smoked Driftwood", 0x665f5b),
  "Felt Grey": hpl("Felt Grey", 0x8b929c, false),
  "Urban Walnut": hpl("Urban Walnut", 0x89644a),
  "Washed Elm": hpl("Washed Elm", 0xc1bab0),
  "Chestnut": hpl("Chestnut", 0xcba370),
  "Frosted Ash": hpl("Frosted Ash", 0xabafb5),
  "Taupe Beech": hpl("Taupe Beech", 0xb6a189),
  "Nordic Grey Oak": hpl("Nordic Grey Oak", 0x6c6b6c),
  "Grey Elm": hpl("Grey Elm", 0xb5b4b2),
  "Bleached Oak": hpl("Bleached Oak", 0xd6c6b6),
  "Natural Pine": hpl("Natural Pine", 0xe1c293),
  "Weathered Elm": hpl("Weathered Elm", 0x8f8175),
});

/** Shown for a door-stock colour face whose name has no swatch. */
export const UNKNOWN_SWATCH = { hex: 0x9a9a9a, finish: "matte", source: "no swatch", url: null };

/**
 * Silver TG flakes, in millimetres on the face. One set for every metallic
 * colour; only the base colour changes. Density and size are estimates until
 * they are measured on the swatch image (about an A4 sheet: 210 × 297 mm).
 */
export const METALLIC_FLAKES = {
  diameterMm: 0.3, // flake size varies ±40 % around this
  perCm2: 40,
  lift: 0.75, // flake colour: base mixed this far toward white
  baseRoughness: 0.45,
  flakeRoughness: 0.15,
  tileMm: 60, // the pattern repeats every 60 mm
  texturePx: 1024,
  seed: 7,
};

export function doorSwatch(name) {
  return DOOR_SWATCHES[String(name || "").trim()] || null;
}

/** CSS colour + tooltip for a UI chip; null when the name has no swatch. */
export function swatchChipStyle(name) {
  const sw = doorSwatch(name);
  if (!sw) return null;
  return {
    background: `#${sw.hex.toString(16).padStart(6, "0")}`,
    image: sw.texture || null,
    finish: sw.finish,
    title: sw.texture ? `${sw.source} · 1 m tile` : `${sw.source} (${sw.finish}) · screen approximation`,
  };
}
