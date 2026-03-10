import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { scRadialBasis } from "../src/attitude_math";
import { fmtTime } from "../src/timeline_utils";
import { createLoaderController } from "../src/ui_loader";
import { wirePlaybackControls, wireScrubber } from "../src/scrubber_controls";
import { wireDropHandlers } from "../src/drop_handlers";
import { resetCameraToSc } from "../src/camera_utils";
import { createHudController } from "../src/hud_updates";
import { estimatePanelFaceNormalModel, meshAreaAndNormalLocal } from "../src/panel_drive";
import {
  ASSET_BASE,
  DEG,
  LINK_TRAIL_WU,
  PANEL_MESH_TRIM_DEG,
  RE_KM,
  SCALE,
  SPEEDS,
  SUN_DIST,
  SC_DIAG_WU,
  SC_SCREEN_FRACTION,
} from "../src/constants";
import { createSceneGraph } from "../src/scene_setup";
import { loadScModel } from "../src/model_loader";
import { createScMarkerController } from "../src/sc_marker";
import { createLinkPovCameraController } from "../src/link_pov_camera";
import { buildCleanSlews } from "../src/viz_data_prep";
import { applyInitDataSideEffects } from "../src/viz_bootstrap";
import { runVizFrame } from "../src/frame_driver";
import type { CameraViewMode, SlewWindow, VizData } from "../src/types";

function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required element: #${id}`);
  }
  return el as T;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Imported from ./src/constants.js

// ─── Math ─────────────────────────────────────────────────────────────────────
// Core attitude and timeline utilities are imported from ./src/* modules.

// Estimated panel-face normal in panelMeshGroup/model space, computed from
// triangle geometry (area-weighted) to avoid axis-quantization errors.
let panelFaceNormalModel = new THREE.Vector3(0, 1, 0);
let panelRefMesh: THREE.Mesh | null = null;
let panelRefNormalLocal = new THREE.Vector3(0, 1, 0);

// ─── DOM helpers ──────────────────────────────────────────────────────────────
// Loader/upload workflow is managed by ./src/ui_loader.js.

// ─── Renderer / Scene Graph ───────────────────────────────────────────────────
const {
  renderer,
  scene,
  camera,
  orbitCtl,
  updateCameraClipping,
  atmosphereMat,
  earthMesh,
  cloudMesh,
  moonMesh,
  sunMesh,
  sunHalo,
  sunLight,
  sunRayBuf,
  sunRayGeo,
  sunRayLine,
  scGroup,
  modelGroup,
  panelMeshGroup,
  linkGroup,
  fallback,
  panelGroup,
  axVel,
  axScSun,
  setVector,
} = createSceneGraph({ assetBase: ASSET_BASE });

// Fixed model pre-rotation (+Y model axis -> boresight/XRT).
const modelPreQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

const loader = createLoaderController({
  assetBase: ASSET_BASE,
  onDataLoaded: (json) => initData(json),
});
const { clearLoading, loadJSON, setLoading, showMessage } = loader;
const hud = createHudController();

// Load spacecraft model
renderer.outputColorSpace = THREE.SRGBColorSpace;
setLoading("Loading spacecraft model…");
loadScModel({
  assetBase: ASSET_BASE,
  modelGroup,
  panelMeshGroup,
  fallback,
  scDiagWu: SC_DIAG_WU,
  setLoading,
  clearLoading,
  meshAreaAndNormalLocal,
  estimatePanelFaceNormalModel,
  onPanelState: ({
    panelFaceNormalModel: faceNormal,
    panelRefMesh: refMesh,
    panelRefNormalLocal: refNormal,
  }) => {
    panelFaceNormalModel = faceNormal;
    panelRefMesh = refMesh;
    panelRefNormalLocal = refNormal;
  },
});

// ─── Simulation state ─────────────────────────────────────────────────────────
let DATA: (VizData & { slews: SlewWindow[] }) | null = null;
let simTime = 0;
let playing = true;
let speedIdx = 3;
let camInitDone = false;
let prevTs: number | null = null;
let cameraViewMode: CameraViewMode = "follow-behind";
let cameraViewNeedsSnap = true;

const cameraViewSel = mustEl<HTMLSelectElement>("camera-view");
if (cameraViewSel) {
  cameraViewSel.value = cameraViewMode;
  cameraViewSel.addEventListener("change", (ev: Event) => {
    cameraViewMode = (ev.target as HTMLSelectElement).value as CameraViewMode;
    camInitDone = false;
    cameraViewNeedsSnap = true;
  });
}

const scLabelEl = document.getElementById("sc-label");
if (scLabelEl) {
  // Render label in Three.js; keep DOM placeholder hidden.
  scLabelEl.style.display = "none";
}
const scMarker = createScMarkerController({ scene, camera, scDiagWu: SC_DIAG_WU });
const linkPovCamera = createLinkPovCameraController({
  domElement: renderer.domElement,
  camera,
  orbitCtl,
  scRadialBasis,
  updateCameraClipping,
  linkTrailWu: LINK_TRAIL_WU,
  getCameraViewMode: () => cameraViewMode,
});

// ─── Load data ─────────────────────────────────────────────────────────────────

function initData(json: VizData): void {
  const cleanSlews = buildCleanSlews(json);

  DATA = { ...json, slews: cleanSlews };
  simTime = json.ephem.utime[0];
  camInitDone = false;
  cameraViewNeedsSnap = true;
  applyInitDataSideEffects({
    json,
    cleanSlewsCount: cleanSlews.length,
    loader,
    canvasElement: renderer.domElement,
    startAnimate,
    isAnimating: () => _animating,
    buildScrubMarks,
    hud,
  });
}

// Auto-load viz data from the backend (populated by launch(ditl)).
// Fall back to a dropped JSON file if not yet available.
loadJSON(`${ASSET_BASE}viz-data`);

// ─── Scrubber ─────────────────────────────────────────────────────────────────
const { buildScrubMarks, updateScrubber } = wireScrubber({
  scrubSlider: mustEl<HTMLInputElement>("scrub-slider"),
  scrubMarks: mustEl<HTMLElement>("scrub-marks"),
  scrubTime: mustEl<HTMLElement>("scrub-time"),
  getData: () => DATA,
  getSimTime: () => simTime,
  setSimTime: (t) => {
    simTime = t;
  },
  resetPrevTs: () => {
    prevTs = null;
  },
  fmtTime,
});

// ─── Controls ─────────────────────────────────────────────────────────────────
wirePlaybackControls({
  speedInput: mustEl<HTMLInputElement>("speed"),
  speedDisplay: mustEl<HTMLElement>("speed-display"),
  playButton: mustEl<HTMLButtonElement>("btn-play"),
  SPEEDS,
  getSpeedIdx: () => speedIdx,
  setSpeedIdx: (idx) => {
    speedIdx = idx;
  },
  getPlaying: () => playing,
  setPlaying: (p) => {
    playing = p;
  },
});

mustEl<HTMLButtonElement>("btn-reset-cam").addEventListener("click", () => {
  linkPovCamera.resetZoom();
  resetCameraToSc({
    camera,
    orbitCtl,
    scPos: scGroup.position.clone(),
    linkPos: linkGroup.position.clone(),
    scRadialBasis,
    DEG,
    SC_DIAG_WU,
    SC_SCREEN_FRACTION,
    LINK_TRAIL_WU,
    updateCameraClipping,
  });
});

// Drag & drop: JSON files load directly as viz data.
wireDropHandlers({
  onJsonLoaded: (json: VizData) => initData(json),
  onPpstDropped: () => {
    showMessage("PPST upload is not supported here. Use launch(ditl) from Python.");
  },
  setLoading,
  clearLoading,
  showMessage,
});

// ─── Render loop ──────────────────────────────────────────────────────────────
let _animating = false;
function startAnimate() {
  _animating = true;
  requestAnimationFrame(animate);
}

function animate(ts: number): void {
  requestAnimationFrame(animate);

  if (!DATA) return;

  const frame = runVizFrame({
    ts,
    simTime,
    prevTs,
    camInitDone,
    cameraViewNeedsSnap,
    data: DATA,
    playing,
    speedIdx,
    speeds: SPEEDS,
    reKm: RE_KM,
    scale: SCALE,
    deg: DEG,
    sunDist: SUN_DIST,
    linkTrailWu: LINK_TRAIL_WU,
    panelMeshTrimDeg: PANEL_MESH_TRIM_DEG,
    scDiagWu: SC_DIAG_WU,
    scScreenFraction: SC_SCREEN_FRACTION,
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
    showSun: mustEl<HTMLInputElement>("show-sun").checked,
    showScSun: mustEl<HTMLInputElement>("show-sc-sun").checked,
    hud,
    updateScrubber,
    scMarker,
  });
  simTime = frame.simTime;
  prevTs = frame.prevTs;
  camInitDone = frame.camInitDone;
  cameraViewNeedsSnap = frame.cameraViewNeedsSnap;
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Render loop is started by initData() once viz-data is loaded.
