# Decision journal

Append-only. When a change picks one architecture over another — merge
strategy, layering, a contract interpretation, why a test is pinned the
way it is — leave three lines here: what / why / the rejected option.
Future sessions (human or AI) read this before asking "why is it like
this". Order: newest on top.

---

## 2026-10-11 · Generator tasks declare intent as a proposal, not after the fact

- **What**: `task.proposal` turns a generator task into a stated plan —
  `changes` (rule names with `from`/`to`, layout flag), `scope` (allowed
  pin-drift paths), `maxChanges`. The harness gates `bench.rules.set` /
  `bench.layout.write` to the declared surface at exec time; `finish`
  and `agent-review` run four gates: `stale` (declared `from` must match
  the start-time snapshot), `applied` (declared `to` must have landed),
  `scoped` (live drift ⊆ scope), `bounded` (drift count ≤ maxChanges).
  Shared verifier: `scripts/agent-proposal.mjs`.
- **Why**: the Generator Agent loop's core hazard is silent unrelated
  drift — a rule change that quietly moves pins the task never meant to
  touch. Declaring intent first makes "what the agent meant to do"
  checkable data instead of post-hoc guesswork; a stale `from` proves
  the agent's model of the generator was wrong before it wrote a byte.
- **Rejected**: repin-allow regexes gated at exec — `bench.presets.repin`
  already refuses out-of-scope drift against live state, and the diff
  gates catch the rest; exec-time regex containment is not mechanically
  decidable.
- **Rejected**: letting `diff.scope` warn fire on proposal tasks without
  an accept-level scope — `proposal.scoped` is the same gate; double-
  warning would flag every well-formed proposal run.

---

## 2026-10-11 · Review is an independent re-verification, not a trusted read

- **What**: `scripts/agent-review.mjs` audits a finished run dir —
  scope/budget re-checked against `task.allow`, accept assertions re-run
  live, generator drift re-diffed against the run baseline, `denials` /
  `vacuous` surfaced as `needs_human`. Verdict: `approved` /
  `needs_human` / `validation_blocked`; only `approved` exits 0.
  `agent-run.mjs review <dir>` is the same thing. `--judge x.mjs` is the
  semantic-layer seam: an external judge may only ever downgrade.
- **Why**: the Review Agent is the verdict layer every other agent
  (Bug / Generator / future roles) answers to — it had to come first and
  be strictly mechanical. Trusting `run.json`'s own verdict would make a
  forged transcript indistinguishable from a clean run, so every check
  re-computes from `transcript.jsonl` + a live CLI instead of reading
  cached results.
- **Rejected**: review-as-report (exit 0 on any verdict) — a publish
  gate that always exits 0 gates nothing.
- **Rejected**: denied ops count as scope violations — a `denied:true`
  transcript entry means the harness fence held; probing the fence is
  `needs_human` signal, not a block.
- **Rejected**: letting `--judge` upgrade a block — a model can flag a
  mechanically-clean run for a human; it can never unblock a violation.

---

## 2026-10-10 · UI writes route through the Command Registry

- **What**: every discrete UI mutation (panel editors, R-key rotate,
  Delete, colour-slot, grain) now calls `invoke()` — `cabinet.set-params`
  gained `replace:true` for full-params parity, `cabinet.move/remove/
  rotate/set-color-slot` carry the rest. `check-deps` Rule 7 bans bare
  `job.setParams/setPose/removeCabinet/setColorSlot` outside a gesture's
  own `history:false` frame and `job.updateCabinet` outside its four
  owners (`panel.js`, `panel/widgets.js`, `yield.js`, `boardSketch.js`)
  and `interact/*`.
- **Why**: P1 UI/business decoupling — an Agent verb and a UI click now
  land on the same handler, so semantics (attach guards, orient rules,
  validation envelope, diff) cannot diverge.
- **Rejected**: routing drag-frame `history:false` writes through
  `invoke()` — the mutating envelope runs `validateBlock` + diff per
  call, which is exactly the per-pointermove full-job work the
  compute-small rule bans. Frames write `job.*` inside `begin/end` and
  stay verb-expressible as one gesture.
- **Rejected**: merge-only `set-params` — kitchen/overhead `splitAfter`,
  `waterfall`, `lockPosition` are deleted by `delete`, and a patch merge
  keeps them (E2E `kitchen split removed` caught it). `replace:true` is
  the faithful port of `job.setParams` wholesale semantics.
- **Notes**: `invoke()` no longer snapshots the job unless `dryRun`
  (envelope was paying a full clone per discrete op). `job.addCabinet`
  placement calls stay direct — `cabinet.add`'s arg surface doesn't yet
  cover the gesture's attach/corner/history options.

---

## 2026-10-10 · bench/modules dirs join the layered contract

- **What**: `bench.js` (3841) split into `bench/` — shell + `core`
  `paramsForm` `modes` `view3d` `selection` `statusPane` `l3` `chrome`;
  pure helpers moved out of `modules.js` into `modules/stackFit.js` +
  `modules/fridge.js` (registry re-exports them); `interact/place.js`
  gave its ceiling-hung block to `place-ceiling.js`. `check-deps`
  extended: bench/* is closed (own window, no outside importers),
  modules/* is owned by the registry, `@module` coverage + size budgets
  apply to all four dirs.
- **Why**: bench is the surface the Generator Agent edits through — a
  3800-line file made every agent task a full-file scope audit, and the
  split had zero index coverage (no headers, no rules).
- **Rejected**: extracting the shared door-side placement helpers
  (`inwardSide`/`partitionFlush`/`placeSide`) — ground cabinets share
  them, so ownership would be false. Also rejected: a separate facade
  file for `modules/*` — the registry itself is the facade.
- **Notes**: bench/* allows sibling circular imports through
  `export function` only (see `bench/AGENTS.md`); `modules/*` helpers
  must import live `let generateX` bindings from `../modules.js`, never
  `gen/*` — `applyBundle` hot-replaces them and a static capture goes
  stale.

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
