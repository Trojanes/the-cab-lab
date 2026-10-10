# Project cases — accumulated real jobs

`fixtures/projects/<name>/` is the library of **real, complete projects** —
jobs that were actually drawn and exported, kept so every later change can be
replayed against them. A synthetic smoke fixture proves a contract; an
accumulated project proves a *customer job* still produces the same boards.

Each case directory holds three files:

| file | what |
|---|---|
| `job.json` | the canonical source (post-migration `serialize()` output) — re-emittable, re-editable |
| `package.cnjob` | the deterministic export (`exportedAt` pinned) — the same zip OmniCam replays |
| `CASE.md` | provenance: source, date, contents, validate/export status |

`npm run test:cases` replays every case on every `verify`: load → validate →
re-export → byte-compare the snapshot vs `package.cnjob`. Drift means a
generator change altered a real project's output — review it with
`scripts/diff-snapshots.mjs`, then either fix the regression or re-run
`scripts/add-case.mjs` to re-emit.

## Adding a case (Troy test flow)

When a real project comes out of testing (a saved `.job`/`.json`, or a crash
dump from `logs/`):

```bash
node scripts/add-case.mjs <file.json> <name> --source "Troy test <date>" --note "what this project exercises"
# paste the printed row into the table below
npm run test:cases
```

If the export is legitimately blocked the case is still kept (no
`package.cnjob`) — `test:cases` asserts it *stays* blocked, so a fix that
unblocks it is caught as drift. A blocked case graduating to clean is a
deliberate act: re-add it.

To ship a case's package to OmniCam golden replay, copy
`fixtures/projects/<name>/package.cnjob` to
`cabinetnc-cut/dotnet/tests/testdata/regression/packages/` and re-baseline
goldens once (`CABINETNC_UPDATE_GOLDENS=1`).

## Registry

| case | source | added | modules | export |
|---|---|---|---|---|
| kitchen-crash-project | logs/crash dump | 2026-10-09 | generalTallCabinet | exported |
