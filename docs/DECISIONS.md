# Decision journal

Append-only. When a change picks one architecture over another — merge
strategy, layering, a contract interpretation, why a test is pinned the
way it is — leave three lines here: what / why / the rejected option.
Future sessions (human or AI) read this before asking "why is it like
this". Order: newest on top.

---

## 2026-10-09 · Upstream 27ed7e2 merged into the layered structure

- **What**: 43 shell hunks routed into modules — lounge-fit walls pick
  (`fitPick.js`), `placeEnsuiteSample` + `partitionFlush` + generalTall
  draw (`place.js`), lounge typed-lock/tips/Enter (`lounge.js`),
  tall multi-select + lock + wheel-arch (`tall.js`), lounge typed plan
  dims + wheel-arch (`lounge.js` panel), new `panel/drawing.js` for the
  `mod.panel === "drawing"` kind, mate-logging (`align.js`).
- **Why**: same routing rule as the d384a36 merge — the shells are the
  diff surface; module ownership decides where each hunk lands.
- **Rejected**: taking upstream's monolithic `interact.js`/`panel.js` —
  would re-grow the two files we split and orphan the index system.
- **Notes**: the new `ensuiteDrawing` modules carry 5 overlap findings
  that are verbatim Fusion STEP fidelity, registered in
  `audit.known.json` as upstream-native (not a merge regression).
  `gen/*` rebuilt with our toolchain — byte-level formatting differs
  from upstream's bundles (esbuild version), content identical.

## 2026-10-08 · The layered renderer is a frozen contract

- **What**: interact/panel shells stay dispatchers; modes and editors
  live in `interact/*` `panel/*`; neutral geometry in `fit.js`/`walls.js`/
  `boardSketch.js`; `gen/*` bundles are the only generator surface.
  `check-deps` enforces layers + `@module` coverage + size budgets.
- **Why**: the monoliths (5628/3914 lines) made every edit a
  300-symbol scope audit; this split is what let the d384a36 merge
  port 86 hunks by routing instead of reading.
- **Rejected**: keep upstream monoliths and diff-review each wave —
  the merge itself proved the port cost compounds.
- **Changes only on explicit user request.**

## 2026-10-08 · Merge strategy: shells stay local, semantics port hunk-by-hunk

- **What**: on upstream/main (d384a36), conflicts in `interact.js` /
  `panel.js` were resolved by keeping the modular shells and porting
  each upstream hunk into the owning module; package/config conflicts
  took the union.
- **Why**: taking the upstream files wholesale would have thrown away
  the split; taking ours would have dropped upstream features.
- **Rejected**: "revert to monolith, merge, re-split" — that double
  conversion loses intent both ways.

## 2026-10-08 · Golden regen requires reading the diff first

- **What**: when `diff-snapshots --regen` shows output drift, regen is
  allowed only after the field-level diff is read and matches intent.
- **Why**: the first merge wave drifted `k1/B3`'s LED branch 50mm —
  deliberate upstream change, caught by the diff, not by red tests.
- **Rejected**: regen-on-red. That's how silent regressions ship.

## 2026-10-08 · audit entry picker uses exact `generate<PascalDir>`

- **What**: `scripts/audit.ts` picks the module entry by exact name,
  excluding `*FrontView` view helpers; a null result reports `crashed`
  instead of dereferencing.
- **Why**: upstream's loose `/^generate[A-Z]/` matched
  `generateOHCFrontView` (alphabetically first re-export) and crashed.
- **Rejected**: renaming the helper — the audit script is the defect.

## 2026-10-09 · generator budget is median-normalised to the machine

- **What**: `smoke.test.ts` collects every module's mean generate time, then
  asserts each is under `GENERATE_BUDGET_MS × clamp(median/0.5, 1, 4)`.
- **Why**: a quiet machine runs the suite median ≈0.5 ms; ambient load lifts
  all modules together and pushes the biggest generator (uShape, ~5.5 ms on a
  loaded box) over the fixed 5 ms line — three consecutive false reds locally
  while CI stayed green.
- **Rejected**: median-of-per-runs (uShape's *minimum* is already 4.15 ms —
  real cost, not GC tail) and a fixed higher budget (weakens the quiet-CI
  contract; the median factor keeps it strict there).

## 2026-10-09 · real projects accumulate as replayable cases

- **What**: `fixtures/projects/<name>/` = job.json + deterministic
  package.cnjob + CASE.md, ingested by `scripts/add-case.mjs` and replayed by
  `npm run test:cases` on every verify.
- **Why**: a synthetic fixture pins a contract; Troy's real test projects pin
  whole workflows. Keeping the source job next to the package makes every
  case re-emittable, so generator drift against real jobs is caught and
  diffs are reviewable.
- **Rejected**: collecting bare .cnjob exports only — output-only artifacts
  can't be regenerated or diagnosed when the format moves.

## 2026-10-09 · agent runs go through a scoped harness, not raw CLI

- **What**: `scripts/agent-run.mjs` (start/exec/finish) reads a task file
  declaring the allowed verb prefixes, op budget and accept checks; every op
  is logged to `logs/agent/<id>/transcript.jsonl` and the verdict is computed
  by the harness, not the agent. Self-test: `test:agent`.
- **Why**: the 92-verb surface is the tool whitelist, but nothing enforced
  *per-task* scope — a "fix this job" agent could have called bench.rules.set
  and silently rewritten generator data. Scope is now code-enforced, and
  "done" is a script assertion, not the agent saying so.
- **Rejected**: prompt-level rules only ("please don't touch generators") —
  unenforceable; and a daemon/LLM-in-the-loop runner — the harness is
  driver-agnostic, any model can drive it through exec calls.
