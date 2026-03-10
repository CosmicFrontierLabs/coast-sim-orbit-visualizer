import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sampleEphemFrame } from "./ephem_sampling";
import {
  followScCamera,
  updateCameraForView,
  updateEarthAndCloudOrientation,
  updateSunScene,
} from "./environment_updates";
import { moonPositionECI } from "./scene_setup";
import { stepSimTime } from "./simulation_step";
import { applySpacecraftState } from "./spacecraft_state";
import { applyCameraMode } from "./camera_mode_driver";
import { resetCameraToSc } from "./camera_utils";
import type { Attitude, BasisRTB, CameraViewMode, FrameState, PPSTEntry, SlewWindow, VizData } from "./types";

interface RunVizFrameDeps {
  ts: number;
  simTime: number;
  prevTs: number | null;
  camInitDone: boolean;
  cameraViewNeedsSnap: boolean;
  data: VizData & { slews: SlewWindow[] };
  playing: boolean;
  speedIdx: number;
  speeds: number[];
  reKm: number;
  scale: number;
  deg: number;
  sunDist: number;
  linkTrailWu: number;
  panelMeshTrimDeg: number;
  scDiagWu: number;
  scScreenFraction: number;
  cameraViewMode: CameraViewMode;
  camera: THREE.PerspectiveCamera;
  orbitCtl: OrbitControls;
  updateCameraClipping: () => void;
  scRadialBasis: (p: THREE.Vector3) => BasisRTB;
  linkPovCamera: { apply: (state: { posW: THREE.Vector3; linkPosW: THREE.Vector3; ramVec: THREE.Vector3 }) => void };
  scGroup: THREE.Group;
  linkGroup: THREE.Group;
  panelMeshGroup: THREE.Group;
  panelGroup: THREE.Group;
  modelGroup: THREE.Group;
  modelPreQ: THREE.Quaternion;
  panelFaceNormalModel: THREE.Vector3;
  panelRefMesh: THREE.Mesh | null;
  panelRefNormalLocal: THREE.Vector3;
  earthMesh: THREE.Object3D;
  cloudMesh: THREE.Object3D;
  moonMesh: THREE.Object3D;
  sunMesh: THREE.Object3D;
  sunHalo: THREE.Object3D;
  sunLight: THREE.Object3D;
  atmosphereMat: THREE.ShaderMaterial;
  sunRayLine: THREE.Line;
  sunRayBuf: Float32Array;
  sunRayGeo: THREE.BufferGeometry;
  axVel: THREE.Object3D;
  axScSun: THREE.Object3D;
  setVector: (vecObj: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3) => void;
  showSun: boolean;
  showScSun: boolean;
  hud: {
    updateOrbitHud: (state: { alt: number; lat: number; lon: number; beta: number; inEcl: number }) => void;
    updateAttitudeHud: (state: {
      slew: SlewWindow | null;
      slewAtt: Attitude | null;
      ppt: PPSTEntry | null;
      panelSunAngleDeg: number;
      simTime: number;
    }) => void;
  };
  updateScrubber: () => void;
  scMarker: { update: (posW: THREE.Vector3, viewMode: CameraViewMode) => void };
}

/**
 * Execute one simulation/render frame and return updated frame state.
 *
 * @param {Object} deps
 * @returns {{simTime:number, prevTs:number|null, camInitDone:boolean, cameraViewNeedsSnap:boolean}}
 */
export function runVizFrame({
  ts,
  simTime,
  prevTs,
  camInitDone,
  cameraViewNeedsSnap,
  data,
  playing,
  speedIdx,
  speeds,
  reKm,
  scale,
  deg,
  sunDist,
  linkTrailWu,
  panelMeshTrimDeg,
  scDiagWu,
  scScreenFraction,
  cameraViewMode,
  camera,
  orbitCtl,
  updateCameraClipping,
  scRadialBasis,
  linkPovCamera,
  scGroup,
  linkGroup,
  panelMeshGroup,
  panelGroup,
  modelGroup,
  modelPreQ,
  panelFaceNormalModel,
  panelRefMesh,
  panelRefNormalLocal,
  earthMesh,
  cloudMesh,
  moonMesh,
  sunMesh,
  sunHalo,
  sunLight,
  atmosphereMat,
  sunRayLine,
  sunRayBuf,
  sunRayGeo,
  axVel,
  axScSun,
  setVector,
  showSun,
  showScSun,
  hud,
  updateScrubber,
  scMarker,
}: RunVizFrameDeps): FrameState {
  const stepped = stepSimTime({
    simTime,
    ts,
    prevTs,
    playing,
    speedIdx,
    speeds,
    slews: data.slews,
    utime: data.ephem.utime,
  });
  simTime = stepped.simTime;
  prevTs = stepped.prevTs;

  const { posW, sunVec, ramVec, lat, lon, beta, inEcl, alt } = sampleEphemFrame({
    ephem: data.ephem,
    simTime,
    reKm,
    scale,
  });

  updateEarthAndCloudOrientation({
    simTime,
    earthMesh,
    cloudMesh,
    DEG: deg,
  });

  moonMesh.position.copy(moonPositionECI(simTime));

  updateSunScene({
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
  });

  const { ppt, slew, slewAtt, linkPosW, panelSunAngleDeg } = applySpacecraftState({
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
    DEG: deg,
  });

  if (!camInitDone) {
    resetCameraToSc({
      camera,
      orbitCtl,
      scPos: posW.clone(),
      linkPos: linkGroup.position.clone(),
      scRadialBasis,
      DEG: deg,
      SC_DIAG_WU: scDiagWu,
      SC_SCREEN_FRACTION: scScreenFraction,
      LINK_TRAIL_WU: linkTrailWu,
      updateCameraClipping,
    });
    camInitDone = true;
  }

  if (cameraViewNeedsSnap) {
    updateCameraForView({
      viewMode: cameraViewMode,
      camera,
      orbitCtl,
      posW,
      linkPos: linkPosW,
      ramVec,
      scRadialBasis,
      updateCameraClipping,
      scDiagWu,
    });
    cameraViewNeedsSnap = false;
  }

  applyCameraMode({
    cameraViewMode,
    orbitCtl,
    posW,
    linkPosW,
    ramVec,
    linkPovCamera,
    followScCamera,
    camera,
    scRadialBasis,
    updateCameraClipping,
  });

  hud.updateOrbitHud({ alt, lat, lon, beta, inEcl });
  updateScrubber();
  hud.updateAttitudeHud({
    slew,
    slewAtt,
    ppt,
    panelSunAngleDeg,
    simTime,
  });

  scMarker.update(posW, cameraViewMode);

  if (orbitCtl.enabled) {
    orbitCtl.update();
  }
  return {
    simTime,
    prevTs,
    camInitDone,
    cameraViewNeedsSnap,
  };
}
