import * as THREE from "three";
import { buildAttitudeQ } from "./attitude_math";
import { activePPST, activeSlew, interpSlewAtt } from "./timeline_utils";
import { panelDriveModelQ } from "./panel_drive";
import type { Attitude, PPSTEntry, SlewWindow, VizData } from "./types";

interface SpacecraftStateDeps {
  simTime: number;
  data: VizData & { slews: SlewWindow[] };
  posW: THREE.Vector3;
  ramVec: THREE.Vector3;
  sunVec: THREE.Vector3;
  sunMesh: THREE.Object3D;
  scGroup: THREE.Group;
  linkGroup: THREE.Group;
  linkTrailWu: number;
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
 *   slew:any,
 *   slewAtt:any,
 *   bodyQ:THREE.Quaternion,
 *   linkPosW:THREE.Vector3,
 *   panelSunAngleDeg:number
 * }}
 */
export function applySpacecraftState({
  simTime,
  data,
  posW,
  ramVec,
  sunVec,
  sunMesh,
  scGroup,
  linkGroup,
  linkTrailWu,
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
  slew: SlewWindow | null;
  slewAtt: Attitude | null;
  bodyQ: THREE.Quaternion;
  linkPosW: THREE.Vector3;
  panelSunAngleDeg: number;
} {
  const ppt = activePPST(simTime, data.ppst);
  const slew = activeSlew(simTime, data.slews || []);
  let slewAtt: Attitude | null = null;
  let bodyQ;

  if (slew) {
    slewAtt = interpSlewAtt(slew, simTime);
    if (slewAtt) {
      bodyQ = buildAttitudeQ(slewAtt.ra, slewAtt.dec, slewAtt.roll);
    } else {
      bodyQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ramVec);
    }
  } else if (ppt) {
    bodyQ = buildAttitudeQ(ppt.ra, ppt.dec, ppt.roll);
  } else {
    bodyQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ramVec);
  }

  scGroup.position.copy(posW);
  scGroup.setRotationFromQuaternion(bodyQ);
  linkGroup.position.copy(posW).addScaledVector(ramVec, -linkTrailWu);
  const linkPosW = linkGroup.position;
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
    slew,
    slewAtt,
    bodyQ,
    linkPosW,
    panelSunAngleDeg,
  };
}
