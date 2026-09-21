// Seed or refresh the pins of a generator's presets from the current output.
//
//   node --experimental-strip-types scripts/pin-presets.ts overheadCabinet            # check only, list mismatches
//   node --experimental-strip-types scripts/pin-presets.ts overheadCabinet --write    # re-pin everything (snapshot update)
//
// Re-pinning is a deliberate act: it declares the current numbers correct.
// Prefer pinning single boards from the bench while you look at them.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPins, collectPins, countPins, type PresetsFile } from "../generators/_lib/pins.ts";

const here = dirname(fileURLToPath(import.meta.url));
const moduleId = process.argv[2];
const write = process.argv.includes("--write");
if (!moduleId) {
  console.error("usage: pin-presets.ts <moduleId> [--write]");
  process.exit(2);
}

const GENERATORS: Record<string, () => Promise<(params: Record<string, unknown>) => { boards: unknown[]; features?: unknown[] }>> = {
  overheadCabinet: async () => (await import("../generators/overheadCabinet/generator.ts")).generateOverheadCabinet as never,
  bedroom: async () => (await import("../generators/bedroom/generator.ts")).generateBedroom as never,
  bedBox: async () => (await import("../generators/bedBox/generator.ts")).generateBedBox as never,
};
const load = GENERATORS[moduleId];
if (!load) {
  console.error(`no generator registered for ${moduleId}`);
  process.exit(2);
}

const file = join(here, "..", "generators", moduleId, "presets.json");
const presets = JSON.parse(readFileSync(file, "utf8")) as PresetsFile;
const generate = await load();
let failed = 0;
for (const preset of presets.presets) {
  const result = generate(preset.params) as never;
  if (write) {
    preset.pins = collectPins(result);
    console.log(`pinned ${preset.id}: ${countPins(preset.pins)} values`);
    continue;
  }
  const mismatches = checkPins(result, preset.pins);
  if (mismatches.length) {
    failed += mismatches.length;
    console.log(`${preset.id}: ${mismatches.length} mismatch(es)`);
    for (const m of mismatches.slice(0, 20)) console.log(`  ${m.path}: expected ${m.expected} got ${m.actual}`);
  } else {
    console.log(`${preset.id}: ${countPins(preset.pins)} pins OK`);
  }
}
if (write) writeFileSync(file, `${JSON.stringify(presets, null, 2)}\n`, "utf8");
if (failed) process.exit(1);
