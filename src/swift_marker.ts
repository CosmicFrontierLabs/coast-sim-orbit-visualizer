import * as THREE from "three";
import type { CameraViewMode } from "./types";

/**
 * Build and update a world-space Swift marker (shaft + arrowhead + text).
 *
 * @param {Object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {number} deps.swiftDiagWu
 * @returns {{update: (posW: THREE.Vector3, viewMode: string) => void}}
 */
export function createSwiftMarkerController({
  scene,
  camera,
  swiftDiagWu,
}: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  swiftDiagWu: number;
}): { update: (posW: THREE.Vector3, viewMode: CameraViewMode) => void } {
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  const markerGroup = new THREE.Group();
  markerGroup.visible = false;

  const shaftGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
  shaftGeo.translate(0, 0.5, 0); // Base at local origin, extends along +Y.
  const shaftMesh = new THREE.Mesh(
    shaftGeo,
    new THREE.MeshBasicMaterial({
      color: 0xa0e1ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }),
  );
  markerGroup.add(shaftMesh);

  const coneGeo = new THREE.ConeGeometry(0.5, 1, 16);
  coneGeo.translate(0, -0.5, 0); // Keep cone tip exactly at local origin.
  const arrowHead = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: 0xa0e1ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }),
  );
  markerGroup.add(arrowHead);

  const txtCanvas = document.createElement("canvas");
  txtCanvas.width = 256;
  txtCanvas.height = 96;
  const ctx = txtCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, txtCanvas.width, txtCanvas.height);
    ctx.font = "bold 40px Courier New";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.fillStyle = "rgba(223, 243, 255, 1.0)";
    ctx.strokeText("SWIFT", 10, txtCanvas.height / 2);
    ctx.fillText("SWIFT", 10, txtCanvas.height / 2);
  }

  const txtTex = new THREE.CanvasTexture(txtCanvas);
  txtTex.colorSpace = THREE.SRGBColorSpace;
  const txtSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: txtTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  markerGroup.add(txtSprite);

  scene.add(markerGroup);

  const camDir = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const offsetDir = new THREE.Vector3();
  const start = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const toSc = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const shaftEnd = new THREE.Vector3();
  const shaftDir = new THREE.Vector3();

  function update(posW: THREE.Vector3, viewMode: CameraViewMode): void {
    toSc.copy(posW).sub(camera.position);
    const dist = Math.max(toSc.length(), 1e-12);
    const fovRad = (camera.fov * Math.PI) / 180;
    const pxPerWorld = innerHeight / (2 * Math.tan(fovRad / 2) * dist);
    const swiftPx = swiftDiagWu * pxPerWorld;
    projected.copy(posW).project(camera);
    const onScreen =
      projected.z > -1 &&
      projected.z < 1 &&
      projected.x >= -1.08 &&
      projected.x <= 1.08 &&
      projected.y >= -1.08 &&
      projected.y <= 1.08;

    const isEarthFixed = viewMode === "earth-fixed";
    const shouldShow = onScreen && (swiftPx < 9 || isEarthFixed);
    markerGroup.visible = shouldShow;
    if (!shouldShow) return;

    // Ease-in marker size/opacity right after it becomes visible.
    const fade = isEarthFixed ? 1 : THREE.MathUtils.clamp((9 - swiftPx) / 3, 0, 1);
    const sizeGain = THREE.MathUtils.lerp(0.55, 1.0, fade);
    const alpha = THREE.MathUtils.lerp(0.35, 0.95, fade);

    shaftMesh.material.opacity = alpha;
    arrowHead.material.opacity = alpha;
    txtSprite.material.opacity = alpha;

    camera.getWorldDirection(camDir);
    tmpUp.copy(camera.up).normalize();
    camRight.crossVectors(camDir, tmpUp).normalize();
    offsetDir.copy(camRight).multiplyScalar(0.85).addScaledVector(tmpUp, 0.55).normalize();

    // Keep marker dimensions visually constant by sizing in pixels first.
    const worldPerPx = (2 * dist * Math.tan(fovRad / 2)) / Math.max(innerHeight, 1);
    const shaftLen = worldPerPx * 44 * sizeGain;
    const headLen = worldPerPx * 12 * sizeGain;
    const headWidth = worldPerPx * 8 * sizeGain;
    const textOffset = worldPerPx * 14 * sizeGain;
    const textWidth = worldPerPx * 100 * sizeGain;

    start.copy(posW).addScaledVector(offsetDir, shaftLen);
    toTarget.copy(posW).sub(start).normalize();

    shaftEnd.copy(posW).addScaledVector(toTarget, -headLen * 0.98);
    const shaftVisLen = Math.max(start.distanceTo(shaftEnd), worldPerPx * 6);
    const widthGain = THREE.MathUtils.lerp(0.2, 1.0, fade * fade);
    const shaftRadius = Math.min(worldPerPx * 0.55 * widthGain, shaftVisLen * 0.045);
    shaftDir.copy(shaftEnd).sub(start).normalize();
    shaftMesh.position.copy(start);
    shaftMesh.quaternion.setFromUnitVectors(Y_AXIS, shaftDir);
    shaftMesh.scale.set(shaftRadius, shaftVisLen, shaftRadius);

    arrowHead.position.copy(posW);
    arrowHead.quaternion.setFromUnitVectors(Y_AXIS, toTarget);
    arrowHead.scale.set(headWidth, headLen, headWidth);

    tmpPos.copy(start).addScaledVector(offsetDir, textOffset);
    txtSprite.position.copy(tmpPos);
    txtSprite.scale.set(textWidth, textWidth * 0.375, 1);
  }

  return { update };
}
