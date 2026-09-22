// Scene, camera, controls, floor grid, axes and the room (space) itself.
// Millimetres, Z up, right-handed. This file only displays.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GRID_MINOR_MM = 100;
const GRID_MAJOR_MM = 1000;
const GRID_EXTENT_MM = 10000;
const AXIS_LENGTH_MM = 1000;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c1f);

export const camera = new THREE.PerspectiveCamera(50, 1, 10, 100000);
camera.up.set(0, 0, 1);

const mount = document.getElementById("viewport") || document.body;
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
mount.appendChild(renderer.domElement);
export const canvas = renderer.domElement;

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
// Scroll zooms along the ray under the cursor, so the point you point at stays put.
controls.zoomToCursor = true;
// Left button stays free for selection. Hold the wheel to orbit,
// right-drag to pan, scroll the wheel to zoom.
controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.ROTATE,
  RIGHT: THREE.MOUSE.PAN,
};

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 0.8);
key.position.set(4000, -6000, 7000);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-5000, 3000, 4000);
scene.add(fill);

scene.add(makeGrid());
scene.add(makeAxes());
scene.add(makeOrigin());

function makeGrid() {
  const group = new THREE.Group();
  group.name = "metric-grid";
  const minor = [];
  const major = [];
  for (let i = -GRID_EXTENT_MM; i <= GRID_EXTENT_MM; i += GRID_MINOR_MM) {
    const dest = i % GRID_MAJOR_MM === 0 ? major : minor;
    dest.push(-GRID_EXTENT_MM, i, 0, GRID_EXTENT_MM, i, 0);
    dest.push(i, -GRID_EXTENT_MM, 0, i, GRID_EXTENT_MM, 0);
  }
  group.add(lineSegments(minor, 0x2c3138));
  group.add(lineSegments(major, 0x4a515c));
  return group;
}

function makeAxes() {
  const group = new THREE.Group();
  group.name = "axes";
  group.add(axis(AXIS_LENGTH_MM, 0, 0, 0xd94b4b));
  group.add(axis(0, AXIS_LENGTH_MM, 0, 0x4fc46f));
  group.add(axis(0, 0, AXIS_LENGTH_MM, 0x4f86e0));
  return group;
}

function axis(x, y, z, color) {
  const line = lineSegments([0, 0, 0, x, y, z], color);
  line.material.depthTest = false;
  line.renderOrder = 10;
  return line;
}

function makeOrigin() {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xd8dde4 }));
  dot.name = "origin";
  dot.renderOrder = 11;
  return dot;
}

export function lineSegments(positions, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
  return new THREE.LineSegments(geometry, material);
}

// --- room -----------------------------------------------------------------

const room = new THREE.Group();
room.name = "space";
scene.add(room);
// Framing box used by views; a default until a space is defined.
let extent = { minX: 0, minY: 0, maxX: 4000, maxY: 3000, height: 2400 };

const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.95, metalness: 0 });
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x3a4250,
  roughness: 0.9,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x55606f, roughness: 0.9, transparent: true, opacity: 0.6 });
const roofMat = new THREE.MeshStandardMaterial({
  color: 0x46526a,
  roughness: 0.9,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});

/** Roof height at y from the resolved profile (piecewise linear, constant across X). */
function roofZ(resolved, y) {
  const pr = resolved.profile;
  if (!pr || pr.length < 2) return resolved.height;
  if (y <= pr[0][0]) return pr[0][1];
  for (let i = 0; i < pr.length - 1; i += 1) {
    const [y0, z0] = pr[i];
    const [y1, z1] = pr[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.min(z0, z1) : z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  }
  return pr[pr.length - 1][1];
}

/**
 * Top edge of a wall standing on floor edge a→b as [[u, z], ...] with u along
 * the edge: flat for edges across the van (X), following the roof profile for
 * edges along it (Y).
 */
function wallTop(resolved, a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const alongY = Math.abs(b[0] - a[0]) < 1e-6;
  if (!alongY) {
    const z = roofZ(resolved, a[1]);
    return [[0, z], [len, z]];
  }
  const dir = Math.sign(b[1] - a[1]);
  const top = [[0, roofZ(resolved, a[1])]];
  const inside = (resolved.profile || []).filter(([y]) => (y - a[1]) * dir > 1e-6 && (b[1] - y) * dir > 1e-6);
  if (dir < 0) inside.reverse();
  for (const [y, z] of inside) top.push([Math.abs(y - a[1]), z]);
  top.push([len, roofZ(resolved, b[1])]);
  return top;
}

/** A vertical polygon standing on floor edge a→b (1 mm outside it), closed by `top`. */
function wallMesh(a, b, top, offset = 0.5) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  // Outward normal for a CCW polygon is to the right of the edge direction.
  const nx = uy;
  const ny = -ux;
  const poly2 = [[0, 0], [len, 0], ...top.slice().reverse()];
  const tris = THREE.ShapeUtils.triangulateShape(poly2.map(([u, z]) => new THREE.Vector2(u, z)), []);
  const pos = [];
  for (const t of tris) {
    for (const idx of t) {
      const [u, z] = poly2[idx];
      pos.push(a[0] + ux * u + nx * offset, a[1] + uy * u + ny * offset, z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, wallMat);
}

/**
 * Draw a resolved space (see spaces.js): floor polygon, walls along the
 * listed edges (their tops follow the roof profile), the sloped roof panels,
 * obstacles, and the volume outline. Pass null to clear.
 */
export function drawSpace(resolved) {
  room.clear();
  if (!resolved) return;
  const { floor, height: H, obstacles, walls, bounds } = resolved;
  extent = { ...bounds, height: H };

  const shape = new THREE.Shape(floor.map(([x, y]) => new THREE.Vector2(x, y)));
  const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
  floorMesh.position.z = 0.5;
  room.add(floorMesh);

  const n = floor.length;
  for (const i of walls || []) {
    const a = floor[i % n];
    const b = floor[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    room.add(wallMesh(a, b, wallTop(resolved, a, b)));
  }

  // Sloped roof: one panel per profile segment that is not the flat ceiling.
  const pr = resolved.profile || [[bounds.minY, H], [bounds.maxY, H]];
  const roofPos = [];
  for (let i = 0; i < pr.length - 1; i += 1) {
    const [y0, z0] = pr[i];
    const [y1, z1] = pr[i + 1];
    if (y1 - y0 < 1e-6 || (Math.abs(z0 - H) < 0.01 && Math.abs(z1 - H) < 0.01)) continue;
    const x0 = bounds.minX;
    const x1 = bounds.maxX;
    roofPos.push(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1);
  }
  if (roofPos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
    geo.computeVertexNormals();
    room.add(new THREE.Mesh(geo, roofMat));
  }

  for (const o of obstacles || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0, o.y1 - o.y0, o.z1 - o.z0), obstacleMat);
    m.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, (o.z0 + o.z1) / 2);
    room.add(m);
  }

  // Outline of the space volume: floor edges, verticals up to the roof, roof edges along the profile.
  const e = [];
  for (let i = 0; i < n; i += 1) {
    const a = floor[i];
    const b = floor[(i + 1) % n];
    e.push(a[0], a[1], 0, b[0], b[1], 0);
    e.push(a[0], a[1], 0, a[0], a[1], roofZ(resolved, a[1]));
    const top = wallTop(resolved, a, b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (let k = 0; k < top.length - 1; k += 1) {
      const p = top[k];
      const q = top[k + 1];
      e.push(a[0] + ((b[0] - a[0]) * p[0]) / len, a[1] + ((b[1] - a[1]) * p[0]) / len, p[1], a[0] + ((b[0] - a[0]) * q[0]) / len, a[1] + ((b[1] - a[1]) * q[0]) / len, q[1]);
    }
  }
  // Cross lines at every roof vertex so the slope reads from any angle.
  for (const [y, z] of pr) if (y > bounds.minY + 1e-6 && y < bounds.maxY - 1e-6) e.push(bounds.minX, y, z, bounds.maxX, y, z);
  room.add(lineSegments(e, 0x6b7784));
}

// --- views ----------------------------------------------------------------

export function setView(name) {
  const W = extent.maxX - extent.minX;
  const D = extent.maxY - extent.minY;
  const H = extent.height;
  const cx = extent.minX + W / 2;
  const cy = extent.minY + D / 2;
  const span = Math.max(W, D, H);
  // OrbitControls keeps the up vector it was built with (Z), so the top view
  // is tilted by a hair to avoid a degenerate look-at.
  if (name === "top") {
    camera.position.set(cx, cy - span * 0.02, span * 1.6);
    controls.target.set(cx, cy, 0);
  } else if (name === "front") {
    camera.position.set(cx, -span * 1.6, H / 2);
    controls.target.set(cx, cy, H / 2);
  } else if (name === "side") {
    // From the left (−X), looking across the van: the roof profile reads as drawn.
    camera.position.set(cx - span * 1.6, cy, H / 2);
    controls.target.set(cx, cy, H / 2);
  } else {
    camera.position.set(cx + span * 0.9, -span * 1.25, span * 0.85);
    controls.target.set(cx, cy, H * 0.3);
  }
  controls.update();
}

/** Move the camera so a sphere (centre, radius) fills the view, keeping the current direction. */
export function frame(center, radius) {
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.1;
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.update();
}

// --- picking helpers --------------------------------------------------------

export const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 12;
const ndc = new THREE.Vector2();

export function rayFromClient(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

const hit = new THREE.Vector3();
export function planePointAt(clientX, clientY, plane) {
  const ray = rayFromClient(clientX, clientY);
  return ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
export function floorPointAt(clientX, clientY) {
  return planePointAt(clientX, clientY, floorPlane);
}

/** Point on the line (origin + t*dir) closest to the mouse ray. Returns t. */
export function closestTOnLine(clientX, clientY, origin, dir) {
  const ray = rayFromClient(clientX, clientY);
  const w0 = new THREE.Vector3().subVectors(origin, ray.origin);
  const a = dir.dot(dir);
  const b = dir.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = dir.dot(w0);
  const e = ray.direction.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) return 0;
  return (b * e - c * d) / denom;
}

// --- loop -----------------------------------------------------------------

function resize() {
  const w = mount.clientWidth || window.innerWidth;
  const h = mount.clientHeight || window.innerHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(mount);
else window.addEventListener("resize", resize);
resize();

setView("3d");

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
