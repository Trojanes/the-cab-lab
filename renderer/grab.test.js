// The grab: a full screen of drag moves the surface by one screen, and the
// wheel leaves the point under the cursor on that pixel.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { grabPan, grabZoom, visibleHeightAt } from "./grab.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function near(a, b, eps, msg) {
  assert(Math.abs(a - b) < eps, msg || `${a} != ${b}`);
}

function cameraLooking(position, target) {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 10, 100000);
  camera.up.set(0, 0, 1);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

const clientHeight = 600;
const position = new THREE.Vector3(3200, -2800, 1600);
const look = new THREE.Vector3(1800, 900, 700);

// A full screen of vertical drag shifts the grabbed plane by exactly one screen.
{
  const camera = cameraLooking(position, look);
  const target = look.clone();
  const depth = camera.position.distanceTo(target);
  const point = target.clone();
  const before = point.clone().project(camera);
  grabPan(camera, target, 0, clientHeight, depth, clientHeight);
  const after = point.clone().project(camera);
  near(after.y - before.y, -2, 1e-6, `vertical grab ${after.y - before.y}`);
  near(after.x - before.x, 0, 1e-6, "vertical grab drifted in x");
}

// The same drag horizontally is one screen of height, so NDC x moves by 2 / aspect.
{
  const camera = cameraLooking(position, look);
  const target = look.clone();
  const depth = camera.position.distanceTo(target);
  const point = target.clone();
  const before = point.clone().project(camera);
  grabPan(camera, target, clientHeight, 0, depth, clientHeight);
  const after = point.clone().project(camera);
  near(after.x - before.x, 2 / camera.aspect, 1e-6, `horizontal grab ${after.x - before.x}`);
}

// Zoomed in, the same pixels move less world distance, in proportion to depth.
{
  const camera = cameraLooking(position, look);
  const far = look.clone();
  const nearTarget = look.clone();
  const depth = camera.position.distanceTo(far);
  grabPan(camera, far, 100, 0, depth, clientHeight);
  const camera2 = cameraLooking(position, look);
  grabPan(camera2, nearTarget, 100, 0, depth / 10, clientHeight);
  const movedFar = camera.position.distanceTo(position);
  const movedNear = camera2.position.distanceTo(position);
  near(movedFar / movedNear, 10, 1e-6, `depth ratio ${movedFar / movedNear}`);
  near(movedFar, (100 / clientHeight) * visibleHeightAt(depth, camera.fov), 1e-4);
}

// An off-centre point stays under the cursor, and its distance scales.
{
  const camera = cameraLooking(position, look);
  const target = look.clone();
  const ndcX = 0.42;
  const ndcY = -0.28;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const rayDist = 2400;
  const point = ray.ray.at(rayDist, new THREE.Vector3());
  const before = point.clone().project(camera);
  const lookDir = new THREE.Vector3();
  camera.getWorldDirection(lookDir);
  grabZoom(camera, target, ndcX, ndcY, rayDist, 0.5);
  const after = point.clone().project(camera);
  near(after.x, before.x, 1e-5, `zoom x ${after.x} ${before.x}`);
  near(after.y, before.y, 1e-5, `zoom y ${after.y} ${before.y}`);
  near(point.distanceTo(camera.position), rayDist * 0.5, 1e-3);
  const lookAfter = new THREE.Vector3();
  camera.getWorldDirection(lookAfter);
  near(lookDir.dot(lookAfter), 1, 1e-6, "zoom turned the view");
}

// Zooming out keeps the point too.
{
  const camera = cameraLooking(position, look);
  const target = look.clone();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(-0.2, 0.15), camera);
  const rayDist = 900;
  const point = ray.ray.at(rayDist, new THREE.Vector3());
  const before = point.clone().project(camera);
  grabZoom(camera, target, -0.2, 0.15, rayDist, 2);
  const after = point.clone().project(camera);
  near(after.x, before.x, 1e-5);
  near(after.y, before.y, 1e-5);
  near(point.distanceTo(camera.position), rayDist * 2, 1e-3);
}

// The frame after a zoom still runs OrbitControls.update. The grabbed point stays put.
{
  const canvas = {
    style: {},
    clientWidth: 800,
    clientHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; },
    getRootNode() { return { addEventListener() {}, removeEventListener() {} }; },
  };
  const camera = cameraLooking(position, look);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(look);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();
  camera.updateMatrixWorld();
  const ndcX = 0.3;
  const ndcY = 0.2;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const rayDist = 1600;
  const point = ray.ray.at(rayDist, new THREE.Vector3());
  const before = point.clone().project(camera);
  grabZoom(camera, controls.target, ndcX, ndcY, rayDist, 0.62);
  controls.update();
  camera.updateMatrixWorld();
  const after = point.clone().project(camera);
  near(after.x, before.x, 1e-4, `after update x ${after.x} ${before.x}`);
  near(after.y, before.y, 1e-4, `after update y ${after.y} ${before.y}`);
  controls.dispose();
}

console.log("grab ok");
