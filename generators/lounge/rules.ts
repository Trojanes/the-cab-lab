import raw from "./rules.json" with { type: "json" };
import { defineRules } from "../_lib/dim.ts";

export const RULES = defineRules("lounge", raw);
