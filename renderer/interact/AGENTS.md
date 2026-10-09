# interact/ — pointer & key modes

One file per interaction mode, driven by the `interact.js` shell's
MODE bus. The shell owns dispatch, selection, undo batching and the
HUD; a module owns its gesture.

## The contract

- A mode registers `MODE = { down, hover, confirm, cancel, dims? }`
  via the shell's registration hook — see any existing mode for the
  exact shape.
- Shared mutable interaction state lives in `S` (the slot bag in
  `shared.js`). A mode never keeps a parallel mutable registry —
  extend `S`, or keep it function-local.
- Pure geometry / fit questions go through `fit.js`, `walls.js`,
  `spaces.js` — never import `panel/*` here (check-deps refuses).
  Sibling imports are **one-way**: a mode may reach another to end its
  gesture or read its helpers (`place.js` → `resize.js`, `retype.js`,
  `place-ceiling.js`), but a flow that needs *your* completion registers
  a finish hook instead of back-importing — the sibling graph stays
  acyclic. Extract a domain block into a sibling file
  (`place-ceiling.js` owns the ceiling-hung anchor/wall rules) when the
  block is self-contained; the importing file keeps orchestration.
- Logging uses the mode's own prefix (`place.*`, `move.*`…) — the
  prefix is the `@owns` tag contract; keep them in sync.

## Adding a mode

new file here → `// @module interact @owns <prefix> — …` header →
register in `interact.js` → `npm run module-map` → `npm run verify`.
(A pure helper file extracted from a mode — e.g. `place-ceiling.js` —
needs no `interact.js` registration: its owner imports it.)
