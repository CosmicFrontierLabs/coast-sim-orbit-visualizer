import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasisRTB } from "./types";

/**
 * Reframe the camera around Swift using local radial basis vectors.
 *
 * @param {Object} deps
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} deps.orbitCtl
 * @param {THREE.Vector3|null} deps.swiftPos Current Swift position in world space.
 * @param {THREE.Vector3|null} deps.linkPos Current Link position in world space.
 * @param {(p: THREE.Vector3) => {r: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3}} deps.swiftRadialBasis
 * @param {number} deps.DEG Degrees-to-radians multiplier.
 * @param {number} deps.SWIFT_DIAG_WU Swift reference size in world units.
 * @param {number} deps.SWIFT_SCREEN_FRACTION Desired on-screen size fraction.
 * @param {number} deps.LINK_TRAIL_WU Link offset in world units.
 * @param {() => void} deps.updateCameraClipping
 * @returns {void}
 */
export function resetCameraToSwift({
  camera,
  orbitCtl,
  swiftPos,
  linkPos,
  swiftRadialBasis,
  DEG,
  SWIFT_DIAG_WU,
  SWIFT_SCREEN_FRACTION,
  LINK_TRAIL_WU,
  updateCameraClipping,
}: {
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  swiftPos: THREE.Vector3 | null;
  linkPos: THREE.Vector3 | null;
  swiftRadialBasis: (p: THREE.Vector3) => BasisRTB;
  DEG: number;
  SWIFT_DIAG_WU: number;
  SWIFT_SCREEN_FRACTION: number;
  LINK_TRAIL_WU: number;
  updateCameraClipping: () => void;
}): void {
  const anchor = swiftPos || new THREE.Vector3(0, 0, 1.35);
  const basis = swiftRadialBasis(anchor);
  const hFov = 2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect);
  const d = SWIFT_DIAG_WU / (2 * SWIFT_SCREEN_FRACTION * Math.tan(hFov / 2));
  const origin = linkPos || anchor.clone().sub(basis.t.clone().multiplyScalar(LINK_TRAIL_WU));

  camera.position.copy(origin).addScaledVector(basis.r, d);
  camera.up.copy(basis.b);
  orbitCtl.target.copy(anchor);
  updateCameraClipping();
  orbitCtl.update();
}
