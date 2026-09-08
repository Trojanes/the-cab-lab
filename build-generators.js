// Bundles the shared TypeScript generators (E:\Work\Cursor Project\modules\*)
// into ESM files the Electron renderer can import. The renderer never
// re-implements cabinet formulas; it only calls these bundles.
const path = require("path");
const esbuild = require("esbuild");

const MODULES_DIR = path.resolve(__dirname, "..", "modules");
const OUT_DIR = path.resolve(__dirname, "renderer", "gen");

const ENTRIES = [
  { name: "smallCabinet", entry: path.join(MODULES_DIR, "smallCabinet", "generator.ts") },
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
