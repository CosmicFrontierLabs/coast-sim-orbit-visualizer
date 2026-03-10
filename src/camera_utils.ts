import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasisRTB } from "./types";

/**
 * Reframe the camera around spacecraft using local radial basis vectors.
 *
 * @param {Object} deps
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} deps.orbitCtl
 * @param {THREE.Vector3|null} deps.scPos Current spacecraft position in world space.
 * @param {THREE.Vector3|null} deps.linkPos Current Link position in world space.
 * @param {(p: THREE.Vector3) => {r: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3}} deps.scRadialBasis
 * @param {number} deps.DEG Degrees-to-radians multiplier.
 * @param {number} deps.SC_DIAG_WU spacecraft reference size in world units.
 * @param {number} deps.SC_SCREEN_FRACTION Desired on-screen size fraction.
 * @param {number} deps.LINK_TRAIL_WU Link offset in world units.
 * @param {() => void} deps.updateCameraClipping
 * @returns {void}
 */
export function resetCameraToSc({
  camera,
  orbitCtl,
  scPos,
  linkPos,
  scRadialBasis,
  DEG,
  SC_DIAG_WU,
  SC_SCREEN_FRACTION,
  LINK_TRAIL_WU,
  updateCameraClipping,
}: {
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  scPos: THREE.Vector3 | null;
  linkPos: THREE.Vector3 | null;
  scRadialBasis: (p: THREE.Vector3) => BasisRTB;
  DEG: number;
  SC_DIAG_WU: number;
  SC_SCREEN_FRACTION: number;
  LINK_TRAIL_WU: number;
  updateCameraClipping: () => void;
}): void {
  const anchor = scPos || new THREE.Vector3(0, 0, 1.35);
  const basis = scRadialBasis(anchor);
  const hFov = 2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect);
  const d = SC_DIAG_WU / (2 * SC_SCREEN_FRACTION * Math.tan(hFov / 2));
  const origin = linkPos || anchor.clone().sub(basis.t.clone().multiplyScalar(LINK_TRAIL_WU));

  camera.position.copy(origin).addScaledVector(basis.r, d);
  camera.up.copy(basis.b);
  orbitCtl.target.copy(anchor);
  updateCameraClipping();
  orbitCtl.update();
}
