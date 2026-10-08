/**
 * Geometry audit over every cabinet we can build without the app:
 *   - each preset in generators/<module>/presets.json, through the TypeScript generator
 *   - each module's default cabinet, through renderer/modules.js (what a new cabinet looks like)
 *
 *   node --experimental-strip-types scripts/audit.ts            report, errors and warnings
 *   node --experimental-strip-types scripts/audit.ts --all      also the info lines
 *   node --experimental-strip-types scripts/audit.ts --json     machine-readable
 *   node --experimental-strip-types scripts/audit.ts kitchen    only cases whose name contains "kitchen"
 *   node --experimental-strip-types scripts/audit.ts --bundles  module defaults through renderer/gen (what the app runs now)
 *                                                               instead of the TypeScript sources
 *
 * Exit code 1 when an error is found that is not listed in generators/_lib/audit.known.json.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditResult, type Finding } from "../generators/_lib/audit.ts";
import { buildCnjob } from "../generators/_lib/cnjob.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const showAll = args.includes("--all");
const asJson = args.includes("--json");
const filter = args.find((a) => !a.startsWith("--"));

type Gen = (params: unknown, options?: unknown) => unknown;
interface Case { name: string; moduleId: string; run: () => unknown }

const cases: Case[] = [];

// --- presets through the TypeScript generators ------------------------------------------
const genDir = join(root, "generators");
for (const d of readdirSync(genDir, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith("_")) continue;
  const presetsFile = join(genDir, d.name, "presets.json");
  const genFile = join(genDir, d.name, "generator.ts");
  if (!existsSync(presetsFile) || !existsSync(genFile)) continue;
  const presets = JSON.parse(readFileSync(presetsFile, "utf8")).presets ?? [];
  if (!presets.length) continue;
  const mod = await import(pathToFileURL(genFile).href);
  const fn = Object.entries(mod).find(([k, v]) => /^generate[A-Z]/.test(k) && typeof v === "function" && !/Svg|Preview/.test(k))?.[1] as Gen | undefined;
  if (!fn) continue;
  for (const p of presets) cases.push({ name: `${d.name}/${p.id}`, moduleId: d.name, run: () => fn(p.params) });
}

// --- scenarios for features no preset pins yet (split, stove, wheel arch, bench top) ----------
{
  const { generateKitchenCabinet } = await import(pathToFileURL(join(genDir, "kitchen", "generator.ts")).href);
  const { generateOverheadCabinet } = await import(pathToFileURL(join(genDir, "overheadCabinet", "generator.ts")).href);
  const base = JSON.parse(readFileSync(join(genDir, "kitchen", "presets.json"), "utf8")).presets[0].params;
  const long = {
    ...base,
    globalSettings: { length: 2460, depth: 560, height: 880 },
    benchTopColorName: "Chestnut",
    doorColorName: "Gloss White",
    columns: [
      { ...base.columns[0], id: "k1", width: 600 },
      { id: "k2", width: 600, zones: [{ id: "st", height: 400, zoneType: "stove" }, { id: "st-dr", height: 425, zoneType: "drawer" }] },
      { ...base.columns[1], id: "k3", width: 660 },
      { id: "k4", width: 600, zones: [{ id: "k4-door", height: 825, zoneType: "right_door", shelfEnabled: true, shelfHeight: 400 }] },
    ],
  };
  cases.push({ name: "scenario/kitchen-2460", moduleId: "kitchen", run: () => generateKitchenCabinet(long) });
  cases.push({ name: "scenario/kitchen-2460-split", moduleId: "kitchen", run: () => generateKitchenCabinet({ ...long, splitAfter: 1 }) });
  cases.push({ name: "scenario/kitchen-split-wheelarch", moduleId: "kitchen", run: () => generateKitchenCabinet({ ...long, splitAfter: 1, wheelAvoidances: [{ id: "wa", x0: 1300, x1: 2200, height: 250, depth: 300 }] }) });
  cases.push({ name: "scenario/ensuite-split", moduleId: "kitchen", run: () => generateKitchenCabinet({ ...base, baseKind: "ensuite", splitAfter: 0 }) });
  const ohc = JSON.parse(readFileSync(join(genDir, "overheadCabinet", "presets.json"), "utf8")).presets.find((p: { id: string }) => p.id === "golden-2000-3").params;
  cases.push({ name: "scenario/overhead-2000-split", moduleId: "overheadCabinet", run: () => generateOverheadCabinet({ ...ohc, splitAfter: 0 }) });
}

// --- module defaults through the app's adapters ----------------------------------------
// renderer/modules.js imports the built bundles (renderer/gen/*.js). Unless --bundles is given,
// point those imports at the TypeScript sources, so a generator change is audited before anyone rebuilds.
if (!args.includes("--bundles")) {
  const { register } = await import("node:module");
  // Same entries as build-generators.js (not imported: it needs esbuild).
  const map: Record<string, string> = {};
  for (const d of readdirSync(genDir, { withFileTypes: true })) {
    const entry = join(genDir, d.name, "generator.ts");
    if (d.isDirectory() && existsSync(entry)) map[d.name] = pathToFileURL(entry).href;
  }
  for (const lib of ["pins", "cnjob", "step", "userGrooves"]) map[lib] = pathToFileURL(join(genDir, "_lib", `${lib}.ts`)).href;
  const hooks = `const MAP = ${JSON.stringify(map)};
export async function resolve(spec, ctx, next) {
  const r = await next(spec, ctx);
  const m = r.url.match(/[/]renderer[/]gen[/]([A-Za-z]+)[.]js$/);
  return m && MAP[m[1]] ? { url: MAP[m[1]], shortCircuit: true } : r;
}`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
}
{
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  if (!g.window) g.window = { cablab: null, addEventListener() {}, removeEventListener() {} };
  const { MODULES } = await import(pathToFileURL(join(root, "renderer", "modules.js")).href);
  for (const [id, m] of Object.entries(MODULES as Record<string, { defaultSize?: { W: number; D: number; H: number }; defaults?: (W: number, D: number, H: number) => unknown; generate?: (p: unknown) => unknown }>)) {
    if (!m.defaultSize || typeof m.defaults !== "function" || typeof m.generate !== "function") continue;
    const { W, D, H } = m.defaultSize;
    cases.push({ name: `default/${id}`, moduleId: id, run: () => m.generate!(m.defaults!(W, D, H)) });
  }
}

// --- run ---------------------------------------------------------------------------------
interface Known { case: string; check: string; boards?: string[]; contains?: string; why?: string }
const knownFile = join(root, "generators", "_lib", "audit.known.json");
const known: Known[] = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, "utf8")).known ?? [] : [];
const isKnown = (c: string, f: Finding) => known.some((k) =>
  (k.case === "*" || c.includes(k.case)) && k.check === f.check &&
  (!k.boards || k.boards.every((b) => f.boards.includes(b))) &&
  (!k.contains || f.message.includes(k.contains)));

const report: Array<{ case: string; boards: number; ms: number; findings: Array<Finding & { known?: boolean }>; crashed?: string }> = [];
let newErrors = 0;
for (const c of cases) {
  if (filter && !c.name.includes(filter)) continue;
  const t0 = performance.now();
  let result: { boards?: unknown[] } | null = null;
  try {
    result = c.run() as { boards?: unknown[] };
  } catch (e) {
    report.push({ case: c.name, boards: 0, ms: 0, findings: [], crashed: String((e as Error)?.stack ?? e).split("\n").slice(0, 3).join(" | ") });
    newErrors += 1;
    continue;
  }
  const audited = auditResult(result as never);
  // Would OmniCam get this cabinet? Board-level export refusals only (the cabinet's own red checks are listed above).
  const res = result as { boards?: never[]; params?: never };
  const built = buildCnjob({ jobId: "audit", cabinets: [{ id: "cab", moduleId: c.moduleId, params: res.params ?? null, boards: res.boards ?? [] }] });
  if (!built.ok) for (const why of built.reasons) audited.push({ check: "export", severity: "error", boards: [], message: `.cnjob refuses: ${why}` });
  const findings = audited.map((f) => ({ ...f, known: isKnown(c.name, f) || undefined }));
  newErrors += findings.filter((f) => f.severity === "error" && !f.known).length;
  report.push({ case: c.name, boards: result?.boards?.length ?? 0, ms: performance.now() - t0, findings });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const icon = { error: "✖", warn: "▲", info: "·" } as const;
  let totals = { error: 0, warn: 0, info: 0 };
  for (const r of report) {
    if (r.crashed) { console.log(`\n${r.case}: CRASHED ${r.crashed}`); continue; }
    const shown = r.findings.filter((f) => showAll || f.severity !== "info");
    for (const f of r.findings) totals[f.severity] += 1;
    const e = r.findings.filter((f) => f.severity === "error").length;
    const w = r.findings.filter((f) => f.severity === "warn").length;
    console.log(`\n${r.case}  (${r.boards} boards, ${r.ms.toFixed(0)} ms)  ${e} errors, ${w} warnings`);
    for (const f of shown) console.log(`  ${icon[f.severity]} ${f.check.padEnd(12)} ${f.known ? "[known] " : ""}${f.message}`);
  }
  console.log(`\n${report.length} cases · ${totals.error} errors · ${totals.warn} warnings · ${totals.info} info · ${newErrors} new errors`);
}
process.exitCode = newErrors ? 1 : 0;
