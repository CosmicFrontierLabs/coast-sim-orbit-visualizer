import type * as THREE from "three";

export type CameraViewMode =
  | "follow-behind"
  | "follow-above"
  | "pretty"
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
  // COAST attitude quaternion, scalar-first, ECI-to-body.
  quat_w?: number[];
  quat_x?: number[];
  quat_y?: number[];
  quat_z?: number[];
  // Optional COAST housekeeping constraint telemetry.
  acs_mode?: Array<string | number | null>;
  obsid?: Array<number | null>;
  in_constraint?: Array<string | null>;
  star_tracker_hard_violations?: Array<number | null>;
  star_tracker_soft_violations?: Array<boolean | null>;
  star_tracker_functional_count?: Array<number | null>;
  star_tracker_status?: Array<boolean[] | null>;
  radiator_hard_violations?: Array<number | null>;
  sun_angle_deg?: Array<number | null>;
  earth_angle_deg?: Array<number | null>;
  moon_angle_deg?: Array<number | null>;
}

export interface PPSTEntry {
  begin: number;
  end: number;
  ra: number;
  dec: number;
  roll: number;
  name: string;
  obstype?: string;
  station?: string;
  slewtime?: number;
  slewdist?: number;
  exposure?: number;
  contact_begin?: number;
  contact_end?: number;
  track_start_ra?: number;
  track_start_dec?: number;
  track_end_ra?: number;
  track_end_dec?: number;
}

export interface GroundStationMeta {
  code: string;
  name?: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_m?: number;
  min_elevation_deg?: number;
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
  mission?: string;
  source_plan?: string;
  tle?: string;
  coast_sim_head?: string;
  coast_sim_branch?: string;
  begin_utc?: string;
  end_utc?: string;
  solar_panel?: {
    gimbled?: boolean;
    direction_sc?: EciVec;
  };
  constraints?: {
    earth_limb_min_angle_deg?: number;
    sun_min_angle_deg?: number;
    sun_constraint_disabled_in_eclipse?: boolean;
    sun_constraint_eclipse_umbra_only?: boolean;
  };
  ground_stations?: GroundStationMeta[];
}

export interface VizData {
  meta: VizMeta;
  ephem: EphemData;
  ppst: PPSTEntry[];
  slews?: SlewWindow[];
}

export type TimelineSegmentKind = "entry" | "gsp" | "gap" | "slew";
export type TimelineSegmentLane = "activity" | "slew" | "gap";
export type TimelineGapBoundary = "leading" | "between" | "trailing";

export interface TimelineSegment {
  id: string;
  kind: TimelineSegmentKind;
  lane: TimelineSegmentLane;
  start: number;
  end: number;
  focusTime: number;
  label: string;
  title: string;
  gapBoundary?: TimelineGapBoundary;
  entryIndex?: number;
  prevEntryIndex?: number;
  nextEntryIndex?: number;
  slewIndex?: number;
  entry?: PPSTEntry;
  slew?: SlewWindow;
}

export interface TimelineSelection {
  id: string;
  kind: TimelineSegmentKind;
  start: number;
  end: number;
  focusTime: number;
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
