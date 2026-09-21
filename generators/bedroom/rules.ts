// Bedroom (nose body) rule constants. Values live in rules.json so the
// generator bench can change them with a logged reason; this file only types
// them. Formulas stay in generator.ts.
import raw from "./rules.json" with { type: "json" };
import { defineRules } from "../_lib/dim.ts";

export const RULES = defineRules("bedroom", raw);
export type BedroomRuleName = keyof typeof RULES;
