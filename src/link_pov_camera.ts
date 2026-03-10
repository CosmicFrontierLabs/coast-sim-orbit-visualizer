import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasisRTB, CameraViewMode } from "./types";

/**
 * Build Link POV camera controls (zoom + pose application) with isolated state.
 *
 * @param {Object} deps
 * @param {HTMLElement} deps.domElement
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {import("three/addons/controls/OrbitControls.js").OrbitControls} deps.orbitCtl
 * @param {(posW:THREE.Vector3) => {r:THREE.Vector3,t:THREE.Vector3,b:THREE.Vector3}} deps.swiftRadialBasis
 * @param {() => void} deps.updateCameraClipping
 * @param {number} deps.linkTrailWu
 * @param {() => string} deps.getCameraViewMode
 * @returns {{
 *   apply: (state:{posW:THREE.Vector3, linkPosW?:THREE.Vector3, ramVec:THREE.Vector3}) => void,
 *   resetZoom: () => void,
 * }}
 */
export function createLinkPovCameraController({
  domElement,
  camera,
  orbitCtl,
  swiftRadialBasis,
  updateCameraClipping,
  linkTrailWu,
  getCameraViewMode,
}: {
  domElement: HTMLElement;
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  swiftRadialBasis: (p: THREE.Vector3) => BasisRTB;
  updateCameraClipping: () => void;
  linkTrailWu: number;
  getCameraViewMode: () => CameraViewMode;
}): {
  apply: (state: { posW: THREE.Vector3; linkPosW?: THREE.Vector3; ramVec: THREE.Vector3 }) => void;
  resetZoom: () => void;
} {
  const ZOOM_STEP_WU = linkTrailWu * 0.11;
  const MIN_OFFSET_WU = -3.0 * linkTrailWu;
  const MAX_OFFSET_FRAC = 0.95;

  let zoomOffsetWu = 0;
  let lastLinkDistWu = Math.max(linkTrailWu, 1e-6);

  domElement.addEventListener(
    "wheel",
    (ev: WheelEvent) => {
      if (getCameraViewMode() !== "link-pov") {
        return;
      }
      ev.preventDefault();

      const maxOffsetWu = lastLinkDistWu * MAX_OFFSET_FRAC;
      const wheelNotches = Math.sign(ev.deltaY) * Math.max(Math.abs(ev.deltaY) / 100, 0.2);
      const adaptiveStepWu = Math.max(ZOOM_STEP_WU, lastLinkDistWu * 0.07);
      zoomOffsetWu = THREE.MathUtils.clamp(
        zoomOffsetWu - wheelNotches * adaptiveStepWu,
        MIN_OFFSET_WU,
        maxOffsetWu,
      );
    },
    { passive: false },
  );

  function apply({ posW, linkPosW, ramVec }: { posW: THREE.Vector3; linkPosW?: THREE.Vector3; ramVec: THREE.Vector3 }): void {
    const basis = swiftRadialBasis(posW);
    const linkAnchor = linkPosW || posW.clone().addScaledVector(ramVec, -linkTrailWu);
    const linkToSwift = posW.clone().sub(linkAnchor);
    const linkDist = linkToSwift.length();

    if (linkDist > 1e-18) {
      lastLinkDistWu = linkDist;
    }

    const maxOffsetWu = lastLinkDistWu * MAX_OFFSET_FRAC;
    const dollyWu = THREE.MathUtils.clamp(zoomOffsetWu, MIN_OFFSET_WU, maxOffsetWu);
    const linkPovPos =
      linkDist > 1e-18
        ? linkAnchor.clone().addScaledVector(linkToSwift.multiplyScalar(1 / linkDist), dollyWu)
        : linkAnchor.clone();

    orbitCtl.target.copy(posW);
    camera.position.copy(linkPovPos);
    camera.up.copy(basis.b);
    camera.lookAt(posW);
    updateCameraClipping();
  }

  return {
    apply,
    resetZoom: () => {
      zoomOffsetWu = 0;
    },
  };
}
