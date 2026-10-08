// Placement rules. Empty until a face is edited in Generator Rules.
import raw from "./layout.json" with { type: "json" };
import { validateLayout } from "../_lib/layout.ts";

export const LAYOUT = validateLayout(raw);
