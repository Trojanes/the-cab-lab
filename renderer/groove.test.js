// Groove command storage: a groove on a generator board survives in the job, reaches the face, and undoes.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const job = await import("./job.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

job.loadJob({ version: "job.v2", space: { kind: "box", params: { width: 3000, depth: 2000, height: 2400 } }, cabinets: [] });
const cab = job.addCabinet("kitchenCabinet", { x: 0, y: 0, z: 0, rotZ: 0 }, { W: 887, D: 570, H: 880 });
const board = job.resultFor(cab.id).boards.find((b) => b.thicknessAxis === "X" && b.stock?.kind !== "door");
assert(board, "a side panel to groove");

const g = { id: "G1", face: "A", kind: "groove", u0: 50, u1: 58, v0: 100, v1: 400, depth: 8 };
assert(job.setBoardGrooves(cab.id, board.id, [g]), "stored");
const live = job.getJob().cabinets[0];
assert(live.overrides.boards[board.id].grooves.length === 1, "on the cabinet");
const face = job.resultFor(cab.id).boards.find((b) => b.id === board.id).faces.find((f) => f.id === "A");
assert(face.features.some((f) => f.id === "user-G1" && f.depth === 8), "merged onto face A");
assert(JSON.parse(job.serialize()).cabinets[0].overrides.boards[board.id].grooves[0].id === "G1", "saved with the job");

job.undo();
const after = job.resultFor(job.getJob().cabinets[0].id).boards.find((b) => b.id === board.id).faces.find((f) => f.id === "A");
assert(!after.features.some((f) => f.id === "user-G1"), "undo takes it away");
assert(!job.getJob().cabinets[0].overrides, "no empty overrides left behind");

console.log("groove storage ok");
