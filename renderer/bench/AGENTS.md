# bench/ — the generator bench window

A separate window: `index.html` loads `bench.js` directly and **nothing
outside this dir may import anything here** (check-deps refuses — the
app never reaches in; agent drivers use the `__bench` API or the CLI
verbs instead). `bench.js` is the shell: tabs, rules list, draft commit,
presets IO, `window.__bench`, boot.

## The contract

- Shared bench state lives in `core.js` — `state`/`tabSeq`/`cache`,
  `saveState`/`loadState`, `tab()`/`cur()`/`newTab()`/`generate()`, and
  the DOM helpers `$`/`$$`/`h`/`section`. Siblings import it; nobody
  re-declares it.
- Circular sibling imports exist **by design** (`modes.js` ↔ `bench.js`
  et al.) and are legal only through `export function` declarations —
  function bindings are initialised at module instantiation, so cycles
  resolve. Never assign to an imported binding (ESM forbids it anyway);
  shared mutable state changes through an owner function such as
  `resetExplodePlan()` in `view3d.js`.
- Feature areas stay in their file (`@owns` header is the routing
  contract): parameter forms → `paramsForm.js`, board param modes →
  `modes.js`, 3D/explode view → `view3d.js`, selection → `selection.js`,
  footer → `statusPane.js`, L3 → `l3.js`, menus/dialogs → `chrome.js`.
  Do not let the shell re-grow — check-deps caps it at 600 lines.
- Layout-edit mutations go through `draft.js` (draft → generate →
  commit with a reason), never straight into `layout.json` data.

## Adding a module

new file here → `// @module bench @owns <surface> — …` header →
`npm run module-map` → `npm run check:deps` → `npm run verify`.
