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
  linkPosW,
  ramVec,
  linkPovCamera,
  followSwiftCamera,
  camera,
  swiftRadialBasis,
  updateCameraClipping,
}: {
  cameraViewMode: CameraViewMode;
  orbitCtl: OrbitControls;
  posW: THREE.Vector3;
  linkPosW: THREE.Vector3;
  ramVec: THREE.Vector3;
  linkPovCamera: { apply: (state: { posW: THREE.Vector3; linkPosW: THREE.Vector3; ramVec: THREE.Vector3 }) => void };
  followSwiftCamera: (deps: {
    camera: THREE.PerspectiveCamera;
    orbitCtl: OrbitControls;
    posW: THREE.Vector3;
    swiftRadialBasis: (p: THREE.Vector3) => BasisRTB;
    updateCameraClipping: () => void;
  }) => void;
  camera: THREE.PerspectiveCamera;
  swiftRadialBasis: (p: THREE.Vector3) => BasisRTB;
  updateCameraClipping: () => void;
}): void {
  if (cameraViewMode === "earth-fixed") {
    orbitCtl.enabled = true;
    orbitCtl.target.set(0, 0, 0);
    updateCameraClipping();
    return;
  }

  if (cameraViewMode === "link-pov") {
    orbitCtl.enabled = false;
    linkPovCamera.apply({ posW, linkPosW, ramVec });
    return;
  }

  orbitCtl.enabled = true;
  followSwiftCamera({
    camera,
    orbitCtl,
    posW,
    swiftRadialBasis,
    updateCameraClipping,
  });
}
