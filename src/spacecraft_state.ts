import * as THREE from "three";
import { buildAttitudeQ } from "./attitude_math";
import { activePPST } from "./timeline_utils";
import { panelDriveModelQ } from "./panel_drive";
import type { PPSTEntry, SlewWindow, VizData } from "./types";

interface SpacecraftStateDeps {
  simTime: number;
  data: VizData & { slews: SlewWindow[] };
  /** Actual spacecraft RA/Dec/Roll at simTime, interpolated from DITL telemetry. */
  ra: number;
  dec: number;
  roll: number;
  /** Whether ephem attitude data is available (falls back to ram-aligned if false). */
  hasAttitude: boolean;
  posW: THREE.Vector3;
  ramVec: THREE.Vector3;
  sunVec: THREE.Vector3;
  sunMesh: THREE.Object3D;
  scGroup: THREE.Group;
  axVel: THREE.Object3D;
  axScSun: THREE.Object3D;
  showScSun: boolean;
  setVector: (vecObj: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3) => void;
  panelMeshGroup: THREE.Group;
  panelGroup: THREE.Group;
  modelGroup: THREE.Group;
  modelPreQ: THREE.Quaternion;
  panelFaceNormalModel: THREE.Vector3;
  panelRefMesh: THREE.Mesh | null;
  panelRefNormalLocal: THREE.Vector3;
  panelMeshTrimDeg: number;
  DEG: number;
}

/**
 * Apply spacecraft pose, panel drive, and vector overlays for current sim time.
 *
 * @param {Object} deps
 * @returns {{
 *   ppt:any,
 *   bodyQ:THREE.Quaternion,
 *   panelSunAngleDeg:number
 * }}
 */
export function applySpacecraftState({
  simTime,
  data,
  ra,
  dec,
  roll,
  hasAttitude,
  posW,
  ramVec,
  sunVec,
  sunMesh,
  scGroup,
  axVel,
  axScSun,
  showScSun,
  setVector,
  panelMeshGroup,
  panelGroup,
  modelGroup,
  modelPreQ,
  panelFaceNormalModel,
  panelRefMesh,
  panelRefNormalLocal,
  panelMeshTrimDeg,
  DEG,
}: SpacecraftStateDeps): {
  ppt: PPSTEntry | null;
  bodyQ: THREE.Quaternion;
  panelSunAngleDeg: number;
} {
  // PPT is kept for HUD target-name display only; pointing comes from DITL attitude.
  const ppt = activePPST(simTime, data.ppst);
  // otherwise fall back to ram-aligned (nose along velocity vector).
  let bodyQ: THREE.Quaternion;
  if (hasAttitude) {
    bodyQ = buildAttitudeQ(ra, dec, roll);
  } else {
    bodyQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ramVec);
  }

  scGroup.position.copy(posW);
  scGroup.setRotationFromQuaternion(bodyQ);
  setVector(axVel, posW, ramVec);

  axScSun.visible = showScSun;
  if (showScSun) {
    const scToSun = sunMesh.position.clone().sub(posW);
    if (scToSun.lengthSq() > 0) {
      setVector(axScSun, posW, scToSun);
    }
  }

  const { qPanelModel } = panelDriveModelQ({
    bodyQ,
    sunECI: sunVec,
    preQ: modelPreQ,
    panelFaceNormalModel,
    panelMeshTrimDeg,
    DEG,
  });
  panelMeshGroup.setRotationFromQuaternion(qPanelModel);

  let panelNormalSC = panelFaceNormalModel
    .clone()
    .applyQuaternion(qPanelModel)
    .applyQuaternion(modelPreQ)
    .normalize();

  if (panelRefMesh) {
    panelRefMesh.updateWorldMatrix(true, false);
    const qMeshWorld = new THREE.Quaternion();
    panelRefMesh.getWorldQuaternion(qMeshWorld);
    const nECI = panelRefNormalLocal.clone().applyQuaternion(qMeshWorld).normalize();
    panelNormalSC = nECI.applyQuaternion(bodyQ.clone().conjugate()).normalize();
  }

  panelGroup.setRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), panelNormalSC),
  );

  const panelNormalECI = panelNormalSC.clone().applyQuaternion(bodyQ).normalize();
  const panelSunAngleDeg = Math.acos(Math.max(-1, Math.min(1, panelNormalECI.dot(sunVec)))) / DEG;

  modelGroup.setRotationFromQuaternion(modelPreQ);

  return {
    ppt,
    bodyQ,
    panelSunAngleDeg,
  };
}
