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
 *      inside panel/. (scripts/* are test drivers and exempt.)
 *   4. renderer/gen/* is generated output — only modules.js's dynamic loader
 *      may reach it with a query string; static gen imports are fine (the
 *      bundles are the generator API).
 *   5. Every file under interact/ and panel/ carries a `// @module` header
 *      tag — the routing index only works while coverage stays at 100%.
 *   6. Size budgets keep the split from silently re-growing into monoliths:
 *      shells <= 600 lines, module files <= 1800.
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

for (const f of files) {
  const src = rel(f);
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec?.startsWith(".")) continue;
    const target = resolve(dirname(f), spec).slice(R.length + 1).replace(/\\/g, "/");
    const inPanel = IN_DIR(src, "panel");
    const inInteract = IN_DIR(src, "interact");
    const hitsInteract = target === "interact.js" || target.startsWith("interact/");
    const hitsPanel = target === "panel.js" || target.startsWith("panel/");

    const hitsInteractMod = target.startsWith("interact/");
    const hitsPanelMod = target.startsWith("panel/");
    if (inPanel && hitsInteract) violations.push(`${src} → ${spec}  (panel must not import interact)`);
    if (inInteract && hitsPanel) violations.push(`${src} → ${spec}  (interact must not import panel)`);
    if (!inInteract && src !== "interact.js" && hitsInteractMod)
      violations.push(`${src} → ${spec}  (interact/* is owned by the interact.js shell — import the shell)`);
    if (!inPanel && src !== "panel.js" && hitsPanelMod)
      violations.push(`${src} → ${spec}  (panel/* is owned by the panel.js shell — import the shell)`);
  }

  // Rule 5: routing-tag coverage in the module dirs.
  const inModuleDir = src.startsWith("interact/") || src.startsWith("panel/");
  if (inModuleDir && !/^\/\/\s*@module/m.test(text.slice(0, 1200)))
    violations.push(`${src}  (module file missing the // @module header — the index can't route to it)`);

  // Rule 6: size budgets — the anti-monolith tripwire.
  const lines = text.split("\n").length;
  const isShell = src === "interact.js" || src === "panel.js";
  const budget = isShell ? 600 : inModuleDir ? 1800 : null;
  if (budget && lines > budget)
    violations.push(`${src} is ${lines} lines > budget ${budget}  (${isShell ? "shells stay dispatchers — move logic into a module" : "a module this big is a monolith again — split by mode"})`);
}

if (violations.length) {
  console.error(`check-deps: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  process.exit(1);
}
console.log(`check-deps: ${files.length} files scanned, layering clean`);
