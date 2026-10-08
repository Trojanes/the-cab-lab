// Screen-space grab for the 3D view. The surface under the cursor sticks to the
// cursor: one pixel of pan moves that surface by one pixel, and the wheel
// scales the distance to it while leaving it on the same pixel.
import * as THREE from "three";

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _ray = new THREE.Vector3();

/** World height of the view at `depth` mm in front of a perspective camera. */
export function visibleHeightAt(depth, fovDeg) {
  return 2 * depth * Math.tan((fovDeg * Math.PI) / 360);
}

/**
 * Slide the orbit target along the current view so it sits `distance` mm
 * in front of the camera. The picture does not move; pan and orbit then
 * use that depth instead of whatever the target had drifted to.
 */
export function placeOrbitTarget(camera, target, distance) {
  const d = Math.max(distance, 1);
  camera.updateMatrixWorld();
  camera.getWorldDirection(_fwd);
  target.copy(camera.position).addScaledVector(_fwd, d);
}

/**
 * Move the camera and the orbit target together. `dx` / `dy` are pixels,
 * right and down positive. `viewDepth` is the grabbed surface's distance
 * along the view axis, so the plane through that surface tracks the cursor.
 */
export function grabPan(camera, target, dx, dy, viewDepth, clientHeight) {
  if (!clientHeight) return;
  const height = camera.isOrthographicCamera
    ? (camera.top - camera.bottom) / (camera.zoom || 1)
    : viewDepth > 0 ? visibleHeightAt(viewDepth, camera.fov) : 0;
  if (!(height > 0)) return;
  const k = height / clientHeight;
  camera.updateMatrixWorld();
  _x.setFromMatrixColumn(camera.matrixWorld, 0);
  _y.setFromMatrixColumn(camera.matrixWorld, 1);
  _offset.set(0, 0, 0).addScaledVector(_x, -dx * k).addScaledVector(_y, dy * k);
  camera.position.add(_offset);
  target.add(_offset);
  camera.updateMatrixWorld();
}

/** Distance kept per wheel notch (deltaY 100): 0.85 = 15% closer per notch (was 0.95, 5%, too slow). */
export const WHEEL_NOTCH_SCALE = 0.85;

/** Wheel scale. `deltaY` < 0 zooms in. One typical notch moves WHEEL_NOTCH_SCALE of the distance. */
export function wheelZoomScale(event) {
  let deltaY = event.deltaY || 0;
  if (event.deltaMode === 1) deltaY *= 16;
  else if (event.deltaMode === 2) deltaY *= 100;
  // A trackpad pinch arrives as a wheel event with ctrl held.
  if (event.ctrlKey) deltaY *= 10;
  if (!deltaY) return 1;
  const step = Math.pow(WHEEL_NOTCH_SCALE, Math.abs(deltaY) * 0.01);
  return deltaY < 0 ? step : 1 / step;
}

/**
 * Dolly along the cursor ray so a point `rayDist` mm out stays under the
 * cursor and its distance becomes `rayDist * scale`. The orbit target stays
 * on the view axis at the new distance, so the next pan is 1:1 there.
 */
export function grabZoom(camera, target, ndcX, ndcY, rayDist, scale) {
  if (camera.isOrthographicCamera) {
    camera.zoom = Math.min(80, Math.max(0.05, (camera.zoom || 1) / scale));
    camera.updateProjectionMatrix();
    return;
  }
  const minDist = Math.max(camera.near * 2, 1);
  const dist = Math.max(rayDist, minDist);
  const next = Math.max(dist * scale, minDist);
  camera.updateMatrixWorld();
  _ndc.set(ndcX, ndcY, 1).unproject(camera);
  _ray.copy(_ndc).sub(camera.position).normalize();
  camera.position.addScaledVector(_ray, dist - next);
  camera.getWorldDirection(_fwd);
  target.copy(camera.position).addScaledVector(_fwd, next);
  camera.updateMatrixWorld();
}
