// Bundles The Cab Lab's own TypeScript generators (./generators/*)
// into ESM files the Electron renderer can import. The renderer never
// re-implements cabinet formulas; it only calls these bundles.
// These sources are independent of E:\Work\Cursor Project\modules and
// of the Fusion plugin — do not point this script at those trees.
const path = require("path");
const esbuild = require("esbuild");

const MODULES_DIR = path.resolve(__dirname, "generators");
const OUT_DIR = path.resolve(__dirname, "renderer", "gen");

const ENTRIES = [
  { name: "smallCabinet", entry: path.join(MODULES_DIR, "smallCabinet", "generator.ts") },
  { name: "bedroom", entry: path.join(MODULES_DIR, "bedroom", "generator.ts") },
  { name: "bedBox", entry: path.join(MODULES_DIR, "bedBox", "generator.ts") },
  { name: "overheadCabinet", entry: path.join(MODULES_DIR, "overheadCabinet", "generator.ts") },
];

async function main() {
  for (const { name, entry } of ENTRIES) {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
