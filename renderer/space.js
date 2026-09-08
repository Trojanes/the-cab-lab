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
let currentSpace = { width: 4000, depth: 3000, height: 2400 };

const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.95, metalness: 0 });
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x3a4250,
  roughness: 0.9,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export function drawSpace(space) {
  currentSpace = { ...space };
  const { width: W, depth: D, height: H } = space;
  room.clear();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.position.set(W / 2, D / 2, 0.5);
  room.add(floor);

  // Thin slabs avoid Euler-rotation mistakes; 1 mm thick, drawn on the outside.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1, H), wallMat);
  back.position.set(W / 2, D + 0.5, H / 2);
  room.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(1, D, H), wallMat);
  left.position.set(-0.5, D / 2, H / 2);
  room.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(1, D, H), wallMat);
  right.position.set(W + 0.5, D / 2, H / 2);
  room.add(right);

  // Outline of the space volume.
  const e = [];
  const c = [[0, 0], [W, 0], [W, D], [0, D]];
  for (let i = 0; i < 4; i += 1) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    e.push(a[0], a[1], 0, b[0], b[1], 0);
    e.push(a[0], a[1], H, b[0], b[1], H);
    e.push(a[0], a[1], 0, a[0], a[1], H);
  }
  room.add(lineSegments(e, 0x6b7784));
}

// --- views ----------------------------------------------------------------

export function setView(name) {
  const { width: W, depth: D, height: H } = currentSpace;
  const cx = W / 2;
  const cy = D / 2;
  const span = Math.max(W, D, H);
  // OrbitControls keeps the up vector it was built with (Z), so the top view
  // is tilted by a hair to avoid a degenerate look-at.
  if (name === "top") {
    camera.position.set(cx, cy - span * 0.02, span * 1.6);
    controls.target.set(cx, cy, 0);
  } else if (name === "front") {
    camera.position.set(cx, -span * 1.6, H / 2);
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

drawSpace(currentSpace);
setView("3d");

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
