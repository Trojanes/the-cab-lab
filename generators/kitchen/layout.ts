// Kitchen / ensuite placement rules. The data lives in layout.json so the
// generator bench can edit where a board sits. The file starts empty: every
// board is still built in generator.ts, and a listed board's box is overridden
// afterwards. The outline follows that box; notches in other boards stay.
import raw from "./layout.json" with { type: "json" };
import { validateLayout } from "../_lib/layout.ts";

export const LAYOUT = validateLayout(raw);
