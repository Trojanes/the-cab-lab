// East-west bedroom rule constants. Values live in rules.json; formulas stay in generator.ts.
import raw from "./rules.json" with { type: "json" };
import { defineRules } from "../_lib/dim.ts";

export const RULES = defineRules("bedroomEast", raw);
