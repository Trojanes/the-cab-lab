# modules/ — pure helper domains of the module registry

`renderer/modules.js` is the public registry: the `MODULES` catalogue,
envelope↔params mapping, the `mod.*` API, and the hot-swappable
`let generateX` bundle bindings (`applyBundle`/`reloadGeneratorDir`
replace them in place). This dir holds the pure domains extracted from
it — today `stackFit.js` (zone/stack resize + fit math) and `fridge.js`
(fridge-cabinet zone rules). Outside code imports `modules.js`, never a
file here (check-deps refuses).

## The contract

- **Live bindings, not captures.** When a helper needs a generator,
  import the binding from `../modules.js` (`generateGeneralTall`,
  `fridgeCabinetWidth`, `fitTallCabinetHeight`…) — never from
  `gen/*` directly. A static `gen/*` import freezes on the bundle that
  was loaded at import time and silently goes stale after a rebuild
  reloads the registry.
- Pure means pure: no DOM, no Three.js, no renderer state. These files
  are also loaded by `node --test` drivers — keep them importable
  headless.
- Public names move, callers don't: the registry re-exports everything
  outsiders use, so an extraction is invisible downstream.

## Adding a helper domain

new file here → `// @module modules @owns <domain> — …` header →
import it from `modules.js` and re-export the public names →
`npm run module-map` → `npm run verify`.
