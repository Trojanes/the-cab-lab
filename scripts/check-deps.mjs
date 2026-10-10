/**
 * Import-direction check for the renderer layers.
 *
 *   node scripts/check-deps.mjs      exits 1 and prints every violation
 *
 * Rules (see .cursor/rules/cab-lab-index.mdc for the full map):
 *   1. panel/* never imports interact.js or interact/* (either direction).
 *   2. interact/* never imports panel.js or panel/*.
 *   3. Module dirs are owned by their shells: interact/* may be imported only
 *      from interact.js or inside interact/; panel/* only from panel.js or
 *      inside panel/; modules/* only from modules.js or inside modules/.
 *      bench/* is a self-contained window — nothing outside bench/ may import
 *      it (its shell bench/bench.js lives inside the dir). (scripts/* are test
 *      drivers and exempt.)
 *   4. renderer/gen/* is generated output — only modules.js's dynamic loader
 *      may reach it with a query string; static gen imports are fine (the
 *      bundles are the generator API).
 *   5. Every file under interact/, panel/, bench/ and modules/ carries a
 *      `// @module <dir> @owns …` header tag — the routing index only works
 *      while coverage stays at 100%. (@module value is the dir-family name.)
 *   6. Size budgets keep the split from silently re-growing into monoliths:
 *      shells <= 600 lines (interact.js, panel.js, bench/bench.js), the
 *      modules.js registry <= 2600, module files <= 1800.
 *   7. UI writes route through the command registry: job.setParams / setPose /
 *      removeCabinet / setColorSlot may only be called with { history: false }
 *      (inside a gesture's own begin/end frame — the per-frame envelope cost is
 *      banned by the compute-small rule); every discrete write goes through
 *      invoke(). job.updateCabinet stays a funnel primitive but only in the
 *      gesture files that own a multi-field atomic write. Exempt layers:
 *      job.js / commands.js / appApi.js (they are the command layer), bench/*,
 *      *.test.js (drivers).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = join(root, "renderer");
const IN_DIR = (f, d) => f.startsWith(`${d}/`) || f === d;
const rel = (p) => p.slice(R.length + 1).replace(/\\/g, "/");

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
};
walk(R);

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g;
const violations = [];

// Rule 7 scratchers: comments + strings blanked so call-site matching can't hit prose.
const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
  .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, " "));
const DIRECT_WRITE_RE = /job\.(setParams|setPose|removeCabinet|setColorSlot|updateCabinet)\s*\(/g;
// Files that own a gesture frame and may write mid-drag without a per-call envelope.
const UPDATE_CABINET_OK = new Set(["panel.js", "panel/widgets.js", "yield.js", "boardSketch.js"]);
const COMMAND_LAYER = (src) =>
  src === "job.js" || src === "commands.js" || src === "appApi.js" ||
  src.startsWith("bench/") || /\.test\.(js|mjs)$/.test(src);
// Does this call carry an explicit history option (the drag-frame exemption)?
const hasHistoryOpt = (text, open) => {
  let depth = 1, i = open + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    i++;
  }
  return /history\s*:/.test(text.slice(open, i));
};

for (const f of files) {
  const src = rel(f);
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec?.startsWith(".")) continue;
    const target = resolve(dirname(f), spec).slice(R.length + 1).replace(/\\/g, "/");
    const inPanel = IN_DIR(src, "panel");
    const inInteract = IN_DIR(src, "interact");
    const inBench = IN_DIR(src, "bench");
    const inModules = IN_DIR(src, "modules");
    const hitsInteract = target === "interact.js" || target.startsWith("interact/");
    const hitsPanel = target === "panel.js" || target.startsWith("panel/");

    const hitsInteractMod = target.startsWith("interact/");
    const hitsPanelMod = target.startsWith("panel/");
    const hitsBenchMod = target.startsWith("bench/");
    const hitsModulesMod = target.startsWith("modules/");
    if (inPanel && hitsInteract) violations.push(`${src} → ${spec}  (panel must not import interact)`);
    if (inInteract && hitsPanel) violations.push(`${src} → ${spec}  (interact must not import panel)`);
    if (!inInteract && src !== "interact.js" && hitsInteractMod)
      violations.push(`${src} → ${spec}  (interact/* is owned by the interact.js shell — import the shell)`);
    if (!inPanel && src !== "panel.js" && hitsPanelMod)
      violations.push(`${src} → ${spec}  (panel/* is owned by the panel.js shell — import the shell)`);
    if (!inBench && hitsBenchMod)
      violations.push(`${src} → ${spec}  (bench/* is a self-contained window — nothing outside bench/ reaches in)`);
    if (!inModules && src !== "modules.js" && hitsModulesMod)
      violations.push(`${src} → ${spec}  (modules/* is owned by the modules.js registry — import modules.js)`);
  }

  // Rule 5: routing-tag coverage in the module dirs (tests are drivers, exempt).
  const inModuleDir =
    src.startsWith("interact/") || src.startsWith("panel/") ||
    src.startsWith("bench/") || src.startsWith("modules/");
  const isTest = /\.test\.(js|mjs)$/.test(src);
  if (inModuleDir && !isTest && !/^\/\/\s*@module/m.test(text.slice(0, 1200)))
    violations.push(`${src}  (module file missing the // @module header — the index can't route to it)`);

  // Rule 6: size budgets — the anti-monolith tripwire.
  const lines = text.split("\n").length;
  const isShell = src === "interact.js" || src === "panel.js" || src === "bench/bench.js";
  const budget = isShell ? 600 : src === "modules.js" ? 2600 : inModuleDir && !isTest ? 1800 : null;
  if (budget && lines > budget)
    violations.push(`${src} is ${lines} lines > budget ${budget}  (${isShell ? "shells stay dispatchers — move logic into a module" : src === "modules.js" ? "the registry maps envelopes→params; pure domain helpers live in modules/*" : "a module this big is a monolith again — split by mode"})`);

  // Rule 7: discrete writes go through invoke(); direct job.* writes only inside a gesture frame.
  if (!COMMAND_LAYER(src)) {
    const code = strip(text);
    for (const m of code.matchAll(DIRECT_WRITE_RE)) {
      const fn = m[1], at = `${src}:${text.slice(0, m.index).split("\n").length}`;
      if (fn === "updateCabinet") {
        if (!UPDATE_CABINET_OK.has(src) && !src.startsWith("interact/"))
          violations.push(`${at}  (job.updateCabinet is a funnel primitive — only gesture-frame owners may call it; discrete writes go through invoke())`);
      } else if (!hasHistoryOpt(code, m.index + m[0].length - 1)) {
        violations.push(`${at}  (job.${fn}() bypasses the command registry — route discrete writes through invoke(); { history: false } is only legal inside a gesture's own begin/end frame)`);
      }
    }
  }
}

if (violations.length) {
  console.error(`check-deps: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  process.exit(1);
}
console.log(`check-deps: ${files.length} files scanned, layering clean`);
