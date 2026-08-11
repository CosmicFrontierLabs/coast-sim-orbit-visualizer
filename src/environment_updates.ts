import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasisRTB, CameraViewMode } from "./types";

/**
 * Update Earth and cloud rotations from sidereal time.
 *
 * @param {Object} deps
 * @param {number} deps.simTime Unix time (seconds).
 * @param {THREE.Object3D} deps.earthMesh
 * @param {THREE.Object3D} deps.cloudMesh
 * @param {number} deps.DEG Degrees-to-radians multiplier.
 * @returns {void}
 */
export function updateEarthAndCloudOrientation({
  simTime,
  earthMesh,
  cloudMesh,
  DEG,
}: {
  simTime: number;
  earthMesh: THREE.Object3D;
  cloudMesh: THREE.Object3D;
  DEG: number;
}): void {
  const J2000_unix = 946727935.816;
  const daysSinceJ2000 = (simTime - J2000_unix) / 86400;
  const gmstDeg = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360;

  const qPole = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const qGMST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), gmstDeg * DEG);
  const qEarth = qGMST.clone().multiply(qPole);
  earthMesh.setRotationFromQuaternion(qEarth);

  const qCloud = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 0, 1), gmstDeg * DEG + simTime * 2e-6)
    .multiply(qPole);
  cloudMesh.setRotationFromQuaternion(qCloud);
}

/**
 * Update sun visuals, lighting, and optional ray geometry.
 *
 * @param {Object} deps
 * @returns {void}
 */
export function updateSunScene({
  sunVec,
  sunDist,
  sunMesh,
  sunHalo,
  sunLight,
  atmosphereMat,
  camera,
  sunRayLine,
  sunRayBuf,
  sunRayGeo,
  showSun,
}: {
  sunVec: THREE.Vector3;
  sunDist: number;
  sunMesh: THREE.Object3D;
  sunHalo: THREE.Object3D;
  sunLight: THREE.Object3D;
  atmosphereMat: THREE.ShaderMaterial;
  camera: THREE.PerspectiveCamera;
  sunRayLine: THREE.Line;
  sunRayBuf: Float32Array;
  sunRayGeo: THREE.BufferGeometry;
  showSun: boolean;
}): void {
  sunMesh.position.copy(sunVec).multiplyScalar(sunDist);
  sunHalo.position.copy(sunMesh.position);
  sunLight.position.copy(sunMesh.position);
  atmosphereMat.uniforms.uSunDir.value.copy(sunVec);
  atmosphereMat.uniforms.uCameraPos.value.copy(camera.position);

  sunRayLine.visible = showSun;
  if (!showSun) {
    return;
  }

  sunRayBuf[0] = 0;
  sunRayBuf[1] = 0;
  sunRayBuf[2] = 0;
  sunRayBuf[3] = sunVec.x * sunDist;
  sunRayBuf[4] = sunVec.y * sunDist;
  sunRayBuf[5] = sunVec.z * sunDist;
  sunRayGeo.attributes.position.needsUpdate = true;
}

/**
 * Keep camera offset relative to spacecraft's local radial frame as spacecraft moves.
 *
 * @param {Object} deps
 * @returns {void}
 */
export function followScCamera({
  camera,
  orbitCtl,
  posW,
  scRadialBasis,
  updateCameraClipping,
}: {
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  posW: THREE.Vector3;
  scRadialBasis: (p: THREE.Vector3) => BasisRTB;
  updateCameraClipping: () => void;
}): void {
  const oldBasis = scRadialBasis(orbitCtl.target);
  const worldOff = camera.position.clone().sub(orbitCtl.target);
  const lx = worldOff.dot(oldBasis.r);
  const ly = worldOff.dot(oldBasis.t);
  const lz = worldOff.dot(oldBasis.b);

  orbitCtl.target.copy(posW);

  const nextBasis = scRadialBasis(posW);
  camera.position.set(
    posW.x + lx * nextBasis.r.x + ly * nextBasis.t.x + lz * nextBasis.b.x,
    posW.y + lx * nextBasis.r.y + ly * nextBasis.t.y + lz * nextBasis.b.y,
    posW.z + lx * nextBasis.r.z + ly * nextBasis.t.z + lz * nextBasis.b.z,
  );
  camera.up.copy(nextBasis.b);
  updateCameraClipping();
}

/**
 * Apply one of the fixed camera view modes.
 *
 * @param {Object} deps
 * @returns {void}
 */
export function updateCameraForView({
  viewMode,
  camera,
  orbitCtl,
  posW,
  ramVec,
  scRadialBasis,
  updateCameraClipping,
  scDiagWu,
}: {
  viewMode: CameraViewMode;
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  posW: THREE.Vector3;
  ramVec: THREE.Vector3;
  scRadialBasis: (p: THREE.Vector3) => BasisRTB;
  updateCameraClipping: () => void;
  scDiagWu: number;
}): void {
  const basis = scRadialBasis(posW);
  const vHat = ramVec && ramVec.lengthSq() > 1e-12 ? ramVec.clone().normalize() : basis.t.clone();

  if (viewMode === "earth-fixed") {
    orbitCtl.target.set(0, 0, 0);
    camera.position.set(0, 0, 3.2);
    camera.up.set(0, 1, 0);
    updateCameraClipping();
    return;
  }

  orbitCtl.target.copy(posW);

  if (viewMode === "follow-above") {
    camera.position
      .copy(posW)
      .addScaledVector(basis.r, scDiagWu * 12)
      .addScaledVector(vHat, -scDiagWu * 2.2)
      .addScaledVector(basis.b, scDiagWu * 2.2);
    camera.up.copy(basis.b);
    updateCameraClipping();
    return;
  }

  if (viewMode === "pretty") {
    // Offset to the sunlit shoulder and aft side to keep Earth limb in-frame.
    camera.position
      .copy(posW)
      .addScaledVector(vHat, -scDiagWu * 14)
      .addScaledVector(basis.r, scDiagWu * 7)
      .addScaledVector(basis.b, scDiagWu * 4);
    camera.up.copy(basis.r);
    updateCameraClipping();
    return;
  }

  // Default: trailing chase camera from behind along -V.
  camera.position
    .copy(posW)
    .addScaledVector(vHat, -scDiagWu * 12)
    .addScaledVector(basis.r, scDiagWu * 3.2)
    .addScaledVector(basis.b, scDiagWu * 1.8);
  camera.up.copy(basis.b);
  updateCameraClipping();
}
