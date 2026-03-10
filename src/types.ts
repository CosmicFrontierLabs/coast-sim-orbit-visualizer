import type * as THREE from "three";

export type CameraViewMode =
  | "follow-behind"
  | "follow-above"
  | "pretty"
  | "link-pov"
  | "earth-fixed";

export type EciVec = [number, number, number];

export interface EphemData {
  utime: number[];
  posvec: EciVec[];
  sunvec: EciVec[];
  ramvec: EciVec[];
  polevec: EciVec[];
  ineclipse: number[];
  lat: number[];
  lon: number[];
  beta: number[];
  // Actual spacecraft attitude from DITL telemetry (optional for back-compat).
  ra?: number[];
  dec?: number[];
  roll?: number[];
}

export interface PPSTEntry {
  begin: number;
  end: number;
  ra: number;
  dec: number;
  roll: number;
  name: string;
}

export interface SlewTrackPoint {
  t: number;
  ra: number;
  dec: number;
  roll: number;
}

export interface SlewWindow {
  begin: number;
  end: number;
  from?: string;
  to?: string;
  track: SlewTrackPoint[];
}

export interface VizMeta {
  n_ephem: number;
  n_ppst: number;
  n_slews?: number;
}

export interface VizData {
  meta: VizMeta;
  ephem: EphemData;
  ppst: PPSTEntry[];
  slews?: SlewWindow[];
}

export interface BasisRTB {
  r: THREE.Vector3;
  t: THREE.Vector3;
  b: THREE.Vector3;
}

export interface Attitude {
  ra: number;
  dec: number;
  roll: number;
}

export interface TimeStepResult {
  simTime: number;
  prevTs: number;
}

export interface FrameState {
  simTime: number;
  prevTs: number | null;
  camInitDone: boolean;
  cameraViewNeedsSnap: boolean;
}
