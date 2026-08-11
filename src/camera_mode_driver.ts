import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasisRTB, CameraViewMode } from "./types";

/**
 * Apply continuous camera behavior for current camera mode.
 *
 * @param {Object} deps
 * @returns {void}
 */
export function applyCameraMode({
  cameraViewMode,
  orbitCtl,
  posW,
  followScCamera,
  camera,
  scRadialBasis,
  updateCameraClipping,
}: {
  cameraViewMode: CameraViewMode;
  orbitCtl: OrbitControls;
  posW: THREE.Vector3;
  followScCamera: (deps: {
    camera: THREE.PerspectiveCamera;
    orbitCtl: OrbitControls;
    posW: THREE.Vector3;
    scRadialBasis: (p: THREE.Vector3) => BasisRTB;
    updateCameraClipping: () => void;
  }) => void;
  camera: THREE.PerspectiveCamera;
  scRadialBasis: (p: THREE.Vector3) => BasisRTB;
  updateCameraClipping: () => void;
}): void {
  if (cameraViewMode === "earth-fixed") {
    orbitCtl.enabled = true;
    orbitCtl.target.set(0, 0, 0);
    updateCameraClipping();
    return;
  }

  orbitCtl.enabled = true;
  followScCamera({
    camera,
    orbitCtl,
    posW,
    scRadialBasis,
    updateCameraClipping,
  });
}
