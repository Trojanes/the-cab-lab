// Ctrl+click keeps a set of cabinets. The last one is primary. One Delete removes the set.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const job = await import("./job.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function same(a, b) {
  assert(a.length === b.length && a.every((x, i) => x === b[i]), `expected ${b.join(",")} got ${a.join(",")}`);
}

job.loadJob({ version: "job.v2", space: { kind: "box", params: { width: 3000, depth: 2000, height: 2400 } }, cabinets: [] });
const a = job.addCabinet("kitchenCabinet", { x: 0, y: 0, z: 0, rotZ: 0 }, { W: 600, D: 570, H: 880 });
const b = job.addCabinet("kitchenCabinet", { x: 700, y: 0, z: 0, rotZ: 0 }, { W: 600, D: 570, H: 880 });
assert(job.getSelectedId() === b.id, "a new cabinet replaces the selection");
same(job.getSelectedIds(), [b.id]);

job.select(a.id);
job.select(b.id, null, { extend: true });
same(job.getSelectedIds(), [a.id, b.id]);
assert(job.getSelectedId() === b.id, "the last Ctrl+click is primary");

const boardId = job.resultFor(a.id).boards[0].id;
job.select(a.id, { boardId });
assert(job.getSubSelection()?.boardId === boardId, "a plain click can drill into a board");
job.select(b.id, null, { extend: true });
same(job.getSelectedIds(), [a.id, b.id]);
assert(job.getSubSelection() === null, "adding a cabinet clears the board pick");

job.select("no-such", null, { extend: true });
same(job.getSelectedIds(), [a.id, b.id]);

job.select("wall-1");
assert(job.getSelectedId() === "wall-1", "a wall replaces the set");
same(job.getSelectedIds(), []);
job.select(a.id, null, { extend: true });
same(job.getSelectedIds(), [a.id]);

job.select(b.id, null, { extend: true });
job.select(a.id);
same(job.getSelectedIds(), [a.id]);

job.select(b.id, null, { extend: true });
job.select(b.id, null, { extend: true });
same(job.getSelectedIds(), [a.id]);
job.select(a.id, null, { extend: true });
assert(job.getSelectedId() === null, "Ctrl+click the last cabinet clears the set");

job.select(a.id);
job.select(b.id, null, { extend: true });
job.removeCabinet(b.id);
same(job.getSelectedIds(), [a.id]);
assert(job.getJob().cabinets.some((c) => c.id === a.id), "the other cabinet stays");
job.undo();
assert(job.getJob().cabinets.some((c) => c.id === b.id), "undo puts the cabinet back");

job.select(a.id);
job.select(b.id, null, { extend: true });
const before = job.getJob().cabinets.length;
job.removeCabinets(job.getSelectedIds());
assert(job.getJob().cabinets.length === before - 2, "Delete removes the set");
assert(job.getSelectedId() === null, "nothing left selected");
job.undo();
assert(job.getJob().cabinets.length === before, "one undo restores the set");

console.log("selection ok");
