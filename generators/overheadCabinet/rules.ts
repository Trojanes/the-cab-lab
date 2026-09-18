// Overhead cabinet rule constants. The values live in rules.json so the
// generator bench can change them (with a logged reason) without touching
// code; this file only types them and keeps the legacy named exports.
// Derived constants (formulas of these) stay in geometry.ts.
import raw from "./rules.json" with { type: "json" };
import { defineRules } from "../_lib/dim.ts";

export const RULES = defineRules("overheadCabinet", raw);
export type OverheadRuleName = keyof typeof RULES;
