# Decision journal

Append-only. When a change picks one architecture over another — merge
strategy, layering, a contract interpretation, why a test is pinned the
way it is — leave three lines here: what / why / the rejected option.
Future sessions (human or AI) read this before asking "why is it like
this". Order: newest on top.

---

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
