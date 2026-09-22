// Bundles The Cab Lab's own TypeScript generators (./generators/*)
// into ESM files the Electron renderer can import. The renderer never
// re-implements cabinet formulas; it only calls these bundles.
// These sources live under generators/. Do not point this script at another tree.
//
//   node build-generators.js                 build everything
//   node build-generators.js overheadCabinet build one entry (the bench does this after a rule change)
const path = require("path");
const esbuild = require("esbuild");

const MODULES_DIR = path.resolve(__dirname, "generators");
const OUT_DIR = path.resolve(__dirname, "renderer", "gen");

const ENTRIES = [
  { name: "smallCabinet", entry: path.join(MODULES_DIR, "smallCabinet", "generator.ts") },
  { name: "bedroom", entry: path.join(MODULES_DIR, "bedroom", "generator.ts") },
  { name: "bedBox", entry: path.join(MODULES_DIR, "bedBox", "generator.ts") },
  { name: "overheadCabinet", entry: path.join(MODULES_DIR, "overheadCabinet", "generator.ts") },
  { name: "kitchen", entry: path.join(MODULES_DIR, "kitchen", "generator.ts") },
  { name: "generalTall", entry: path.join(MODULES_DIR, "generalTall", "generator.ts") },
  { name: "lounge", entry: path.join(MODULES_DIR, "lounge", "generator.ts") },
  // Shared helpers the bench needs in the browser (pins are read/written there).
  { name: "pins", entry: path.join(MODULES_DIR, "_lib", "pins.ts") },
];

async function buildGenerators(names = null) {
  const wanted = names && names.length ? ENTRIES.filter((e) => names.includes(e.name)) : ENTRIES;
  if (names && names.length && wanted.length !== names.length) {
    const known = new Set(ENTRIES.map((e) => e.name));
    throw new Error(`unknown generator entry: ${names.filter((n) => !known.has(n)).join(", ")}`);
  }
  for (const { name, entry } of wanted) {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      outfile: path.join(OUT_DIR, `${name}.js`),
      logLevel: "warning",
      banner: { js: `// Generated from ${path.relative(__dirname, entry).replace(/\\/g, "/")} - do not edit.` },
    });
    console.log("built", name);
  }
  return wanted.map((e) => e.name);
}

module.exports = { buildGenerators, ENTRIES };

if (require.main === module) {
  buildGenerators(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
