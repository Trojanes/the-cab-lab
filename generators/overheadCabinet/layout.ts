// Overhead cabinet placement rules. The data lives in layout.json so the
// generator bench can edit where a board sits without touching code; boards
// not listed there are still placed by generator.ts.
import raw from "./layout.json" with { type: "json" };
import { validateLayout } from "../_lib/layout.ts";

export const LAYOUT = validateLayout(raw);
/** Boards whose placement comes from layout.json, in the order they are emitted. */
export const LAYOUT_BOARDS = ["T1", "T2", "T3", "T4"] as const;
