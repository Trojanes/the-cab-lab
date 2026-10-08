// A cavity is a box the van keeps for an appliance or services (a hot water
// unit, electrics) — job.space.params.cavities, world millimetres, drawn
// yellow in the floor plan. One record: the plan rectangle (x0..x1, y0..y1)
// standing on the floor, and its height. Like a wheel arch it is not an
// obstacle: cabinets may stand over it. Cabinets do not react to it yet;
// that comes as its own step (a base column / a tall cabinet base around it).

export const CAVITY_MIN_MM = 50;
export const CAVITY_DEFAULT_HEIGHT = 383;

const round = (n) => Math.round(n);

/** Clamp one record into the floor. Null when the numbers cannot make a box. */
export function clampCavity(raw, bounds) {
  if (!raw || !bounds) return null;
  const nums = [raw.x0, raw.x1, raw.y0, raw.y1, raw.height].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const x0 = Math.max(bounds.minX, Math.min(nums[0], nums[1]));
  const x1 = Math.min(bounds.maxX, Math.max(nums[0], nums[1]));
  const y0 = Math.max(bounds.minY, Math.min(nums[2], nums[3]));
  const y1 = Math.min(bounds.maxY, Math.max(nums[2], nums[3]));
  const height = Math.max(1, nums[4]);
  if (!(x1 - x0 >= 1 && y1 - y0 >= 1)) return null;
  return { id: raw.id, x0: round(x0), x1: round(x1), y0: round(y0), y1: round(y1), height: round(height) };
}

/** World boxes { id, x0, x1, y0, y1, z0, z1 } for the 3D view and the plan. */
export function cavitiesToBoxes(cavities, bounds) {
  const out = [];
  for (const c of cavities || []) {
    const a = clampCavity(c, bounds);
    if (a) out.push({ id: a.id, x0: a.x0, x1: a.x1, y0: a.y0, y1: a.y1, z0: 0, z1: a.height });
  }
  return out;
}
