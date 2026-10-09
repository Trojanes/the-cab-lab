# Regression log — every recorded failure and what covers it

Append-only. Two sections:

1. **Crash dumps** — `logs/crash-*.json` captured by `window.error` / unhandled
   rejection. Each distinct signature gets one representative pinned under
   `fixtures/crash/` and replayed by `npm run test:crash` on every `verify`.
   The remaining dumps of the same signature stay in `logs/` (git-ignored) for
   forensics; they replay via `node scripts/replay-log.mjs --all`.
2. **Tooling / process failures** — bugs in the verification machinery itself,
   recorded so the same class is not reintroduced.

Reproduce a pinned case: `node scripts/replay-log.mjs fixtures/crash/<name>.json`.
Reproduce all historical dumps: `node scripts/replay-log.mjs --all`.

## Crash signatures

| Signature | Dumps | Dates | Root cause | Pinned fixture | Coverage today |
|---|---|---|---|---|---|
| `mod.dividers is not a function` | 18 | 2026-09-24 | Upstream module API churn: a module object without `dividers` reached a caller that assumed it (pre-split, during the tall/module refactor wave) | `api-dividers.json` | State loads + regenerates clean in `test:crash`; per-module editor render covered by e2e `all-panels` |
| `Cannot read properties of undefined (reading 'height')` | 1 | 2026-09-21 | Dereferenced zone/stack entry that did not exist in a generalTall state | `undef-height.json` | `test:crash` replay; tall zone editing covered by e2e `functional` |
| `pickFace is not defined` | 8 | 2026-10-08 | **First-wave modularisation extraction gap** — a function the monolith had at top level was not exported/imported through the interact shell | `ref-pickface.json` | `check:deps` (static import resolution across layers) + e2e `all-panels`/`functional` render every editor |
| `rb is not defined` | 3 | 2026-10-08 | Same family — bare module-scope variable lost in extraction | `ref-rb.json` | Same as above |
| `L_MIN_BOX is not defined` | 3 | 2026-10-08 | Same family — monolith top-level constant not carried into the module | `ref-lminbox.json` | Same as above |
| `stopAll is not defined` | 2 | 2026-10-08 | Same family | `ref-stopall.json` | Same as above |
| `drawerChecks is not defined` | 1 | 2026-10-08 | Same family | `ref-drawerchecks.json` | Same as above |

All 36 dumps are `window.error`. The 2026-10-08 batch (17 dumps) is the
module-split extraction day — the whole `X is not defined` class is now
blocked mechanically: `check:deps` resolves every import across the layered
renderer, and e2e renders every editor + exercises a real edit in each.

Note: some dumps captured the crash before much job state accumulated
(`ref-pickface`, `ref-rb` replay with 0 cabinets). They still pin the load
path; the rendering path they actually crashed in is covered by e2e.

## Tooling / process failures

| Failure | Found | Root cause | Guard added |
|---|---|---|---|
| `check:map` red on CI, green locally | First CI run | `module-map` sorted by **absolute** path — `\` vs `/` gives different order on Windows/Linux; plus CRLF comparison | Sort by normalised relative path + LF-normalised compare (`module-map.mjs`) |
| `package.json` merge dropped 4 contract tests | Upstream merge `27ed7e2` | Conflict resolution took upstream's line, silently losing `snapshotContract`/`boardContract`/`golden`/`snapshotDiff` | Merge rule: package.json always takes the union of script sets; `verify` would fail loudly if a step name vanished |
| E2E could not find CDP target | Local run | Stale Electron instance held the single-instance lock; the driver attached to nothing | Kill stale `electron.exe` before `e2e-drive`; launcher clears `ELECTRON_RUN_AS_NODE` from the spawned env |
| `npm start` fails with `app is undefined` | Local env | `ELECTRON_RUN_AS_NODE=1` env var makes Electron run as plain Node | `e2e-drive` strips the var; documented in `docs/TESTING.md`-adjacent notes |
| Crash replay reported `export blocked` as failures | First replay run | Dumps legitimately carry validation errors (often why they crashed); export refusal is correct, not a replay failure | Replay asserts "loads + regenerates + validates without throwing"; error states report as WARN not FAIL |

## Bugs found by the functional pass

| Bug | Found | Root cause | Fix + coverage |
|---|---|---|---|
| Selecting a U-shape overhead crashed the panel (`zones.map is not a function`) | e2e `functional` phase, first run | `renderCabinet` built the generic zone editor unconditionally at the top; `uShapeOverheadCabinet.params.zones` is per-run `{LEFT, BACK, RIGHT}` object, not an array. The crash also left the panel showing the previous editor, cascading into broken subsequent interactions | Zone editor construction moved to the generic fallback path only (`renderer/panel.js`), `Array.isArray` guard + `mod.zoneTypes || []`. e2e `functional` selects uShape and asserts its editor accepts a field edit |

## Workflow

- New crash dump arrives → `node scripts/replay-log.mjs --pin <file> <short-name>`
  → add a row above if it is a new signature → `npm run verify` must stay green.
- A bug fixed in code → add a row with its covering test; if none exists, that
  is the first follow-up, not an optional extra.
