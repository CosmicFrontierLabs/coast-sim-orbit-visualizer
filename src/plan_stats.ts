import * as THREE from "three";
import { radec2eci } from "./attitude_math";
import type { PPSTEntry, SlewWindow, VizData } from "./types";
import { fmtTime, ppstDisplayName, wrapDeg180 } from "./timeline_utils";

const EARTH_RADIUS_KM = 6371.0;

export interface ActivitySummary {
  type: string;
  count: number;
  durationSec: number;
  exposureSec: number;
  slewSec: number;
}

export interface StationSummary {
  station: string;
  count: number;
  scheduledSec: number;
  contactSec: number;
  downlinkMB: number | null;
}

export interface GapSummary {
  start: number;
  end: number;
  durationSec: number;
  after: string | null;
  before: string | null;
  boundary: "initial" | "between" | "final";
  category: string;
}

export interface SlewSummary {
  target: string;
  type: string;
  start: number;
  durationSec: number;
  distanceDeg: number | null;
}

export interface ScienceSummary {
  count: number;
  scheduledSec: number;
  exposureSec: number;
  slewSec: number;
  overheadSec: number;
  medianExposureSec: number;
  meanSlewSec: number;
}

export interface TimelineChartSegment {
  start: number;
  end: number;
  label: string;
  kind: string;
}

export interface TimelineChartLane {
  label: string;
  segments: TimelineChartSegment[];
}

export interface SlewDistributionBin {
  label: string;
  minSec: number;
  maxSec: number | null;
  count: number;
}

export interface ConstraintSummary {
  samples: number;
  earthKeepoutDeg: number;
  earthKeepoutConfigured: boolean;
  earthMinMarginDeg: number | null;
  earthWorstTime: number | null;
  earthWorstEntry: string | null;
  earthViolationSamples: number;
  earthPhysicalIntersectionSamples: number;
  earthKeepoutMinMarginDeg: number | null;
  sunApplicableMinAngleDeg: number | null;
  sunApplicableWorstTime: number | null;
  sunApplicableWorstEntry: string | null;
  sunKeepoutDeg: number;
  sunKeepoutConfigured: boolean;
  sunKeepoutDisabledInEclipse: boolean;
  sunKeepoutUmbraOnly: boolean | null;
  sunKeepoutSamples: number;
  sunViolationSamples: number;
  sunKeepoutMinMarginDeg: number | null;
  sunKeepoutWorstTime: number | null;
  sunKeepoutWorstEntry: string | null;
}

export interface ConstraintViolationSummary {
  kind: "hard" | "soft";
  constraint: string;
  samples: number;
  firstTime: number;
  lastTime: number;
  firstEntry: string | null;
  lastEntry: string | null;
  modes: string[];
  detail?: string;
}

export interface ConstraintTelemetrySummary {
  available: boolean;
  samples: number;
  hardViolationSamples: number;
  softViolationSamples: number;
  violations: ConstraintViolationSummary[];
}

export interface AttitudeConsistencySummary {
  checkedIntervals: number;
  thresholdDeg: number;
  rollThresholdDeg: number;
  samplesChecked: number;
  samplesOverThreshold: number;
  intervalsOverThreshold: number;
  maxBoresightErrorDeg: number | null;
  maxRollErrorDeg: number | null;
  worstBoresight: ConsistencyWorst | null;
  worstRoll: ConsistencyWorst | null;
}

export interface ConsistencyWorst {
  target: string;
  type: string;
  time: number;
  errorDeg: number;
}

export interface GspExecutionSummary {
  contactsChecked: number;
  samplesChecked: number;
  maxSweepDeg: number | null;
  worstSweep: GspSweepWorst | null;
}

export interface GspSweepWorst {
  station: string;
  target: string;
  start: number;
  end: number;
  samples: number;
  sweepDeg: number;
}

export interface GapCategorySummary {
  category: string;
  count: number;
  durationSec: number;
}

export interface OrbitContextSummary {
  eclipseSec: number;
  eclipseCount: number;
  betaMinDeg: number | null;
  betaMeanDeg: number | null;
  betaMaxDeg: number | null;
  latMinDeg: number | null;
  latMaxDeg: number | null;
}

export interface PanelSunAngleBin {
  minDeg: number;
  maxDeg: number;
  durationSecByMode: Record<string, number>;
}

export interface PanelSunFaceBin {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  sunlitDurationSec: number;
  equivalentSunSec: number;
}

export interface PanelSunAngleSummary {
  available: boolean;
  unavailableReason: string | null;
  panelNormalSc: [number, number, number] | null;
  samples: number;
  durationSec: number;
  minDeg: number | null;
  meanDeg: number | null;
  medianDeg: number | null;
  maxDeg: number | null;
  within45Sec: number;
  within90Sec: number;
  modes: string[];
  bins: PanelSunAngleBin[];
  panelBasisUSc: [number, number, number] | null;
  panelBasisVSc: [number, number, number] | null;
  frontFaceBins: PanelSunFaceBin[];
  backsideSunlitSec: number;
}

export interface BodyDirectionSample {
  time: number;
  durationSec: number;
  mode: string;
  inEclipse: boolean;
  sunBody: [number, number, number];
  earthBody: [number, number, number];
  earthAngularRadiusDeg: number;
}

export interface BodyFaceDwellBin {
  face: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  durationSec: number;
}

export interface SurfaceExposureSummary {
  name: string;
  normalSc: [number, number, number];
  directSunEquivalentSec: number;
  peakSunCosine: number;
  sunAbove10PercentSec: number;
  sunAbove50PercentSec: number;
  sunAbove90PercentSec: number;
  longestAbove10PercentSec: number;
  meanEarthViewFactor: number;
  peakEarthViewFactor: number;
  meanDeepSpaceViewFactor: number;
  minimumDeepSpaceViewFactor: number;
}

export interface ThermalGeometrySummary {
  available: boolean;
  unavailableReason: string | null;
  samples: BodyDirectionSample[];
  durationSec: number;
  sunlitSec: number;
  eclipseSec: number;
  earthAngularRadiusMinDeg: number | null;
  earthAngularRadiusMeanDeg: number | null;
  earthAngularRadiusMaxDeg: number | null;
  sunDwellBins: BodyFaceDwellBin[];
  earthDwellBins: BodyFaceDwellBin[];
  surfaces: SurfaceExposureSummary[];
}

export interface IntegrityFinding {
  severity: "error" | "warn";
  label: string;
  detail: string;
}

export interface PlanStatsOptions {
  downlinkRateMBps?: number;
  attitudeThresholdDeg?: number;
  rollThresholdDeg?: number;
  earthLimbMinAngleDeg?: number;
}

export interface PlanStats {
  window: {
    start: number;
    end: number;
    durationSec: number;
    beginUtc?: string;
    endUtc?: string;
  };
  metadata: {
    mission?: string;
    sourcePlan?: string;
    tle?: string;
    coastSim?: string;
  };
  totals: {
    entries: number;
    ephemSamples: number;
    rawScheduledSec: number;
    scheduledUnionSec: number;
    idleSec: number;
    exposureSec: number;
    entrySlewSec: number;
    explicitSlewSec: number;
    gspSec: number;
    chargeSec: number;
    downlinkMB: number | null;
  };
  downlinkRateMBps: number | null;
  constraints: ConstraintSummary;
  constraintTelemetry: ConstraintTelemetrySummary;
  attitudeConsistency: AttitudeConsistencySummary;
  gspExecution: GspExecutionSummary;
  orbitContext: OrbitContextSummary;
  panelSunAngle: PanelSunAngleSummary;
  thermalGeometry: ThermalGeometrySummary;
  science: ScienceSummary;
  timeline: TimelineChartLane[];
  slewDistribution: SlewDistributionBin[];
  gapCategories: GapCategorySummary[];
  activities: ActivitySummary[];
  stations: StationSummary[];
  gaps: GapSummary[];
  slews: SlewSummary[];
  findings: IntegrityFinding[];
}

interface WindowRef {
  begin: number;
  end: number;
  index: number;
  entry: PPSTEntry;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveDuration(start: unknown, end: unknown): number {
  if (!finiteNumber(start) || !finiteNumber(end)) return 0;
  return Math.max(0, end - start);
}

function entryDuration(entry: PPSTEntry): number {
  return positiveDuration(entry.begin, entry.end);
}

function entryType(entry: PPSTEntry): string {
  return (entry.obstype || "UNKNOWN").toUpperCase();
}

function isChargeType(type: string): boolean {
  return type.includes("CHARGE");
}

function isScienceType(type: string): boolean {
  return type !== "GSP" && !isChargeType(type);
}

function numericField(value: number | undefined): number {
  return finiteNumber(value) ? Math.max(0, value) : 0;
}

function entryLabel(entry: PPSTEntry): string {
  return `${entryType(entry)} ${ppstDisplayName(entry)}`;
}

function vec3(value: [number, number, number] | undefined): THREE.Vector3 | null {
  if (!value || value.length !== 3) return null;
  if (!value.every((v) => Number.isFinite(v))) return null;
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function angleDeg(a: THREE.Vector3, b: THREE.Vector3): number {
  const dot = Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())));
  return (Math.acos(dot) * 180) / Math.PI;
}

function sortedValidEntries(ppst: PPSTEntry[]): WindowRef[] {
  return ppst
    .map((entry, index) => ({ entry, index, begin: entry.begin, end: entry.end }))
    .filter((ref) => finiteNumber(ref.begin) && finiteNumber(ref.end) && ref.end > ref.begin)
    .sort((a, b) => a.begin - b.begin || a.end - b.end);
}

function entryAtTime(entries: WindowRef[], t: number): WindowRef | null {
  return entries.find((ref) => t >= ref.begin && t < ref.end) ?? null;
}

function scienceCollectionAtTime(entries: WindowRef[], t: number): WindowRef | null {
  return (
    entries.find((ref) => {
      if (!isScienceType(entryType(ref.entry))) return false;
      const window = attitudeCheckWindow(ref.entry);
      return window !== null && t >= window.begin && t < window.end;
    }) ?? null
  );
}

function mergeWindowDuration(windows: Array<{ begin: number; end: number }>, start: number, end: number): number {
  const clipped = windows
    .map((window) => ({
      begin: Math.max(start, window.begin),
      end: Math.min(end, window.end),
    }))
    .filter((window) => window.end > window.begin)
    .sort((a, b) => a.begin - b.begin || a.end - b.end);

  let total = 0;
  let cursorStart: number | null = null;
  let cursorEnd: number | null = null;

  for (const window of clipped) {
    if (cursorStart === null || cursorEnd === null) {
      cursorStart = window.begin;
      cursorEnd = window.end;
      continue;
    }

    if (window.begin > cursorEnd) {
      total += cursorEnd - cursorStart;
      cursorStart = window.begin;
      cursorEnd = window.end;
      continue;
    }

    cursorEnd = Math.max(cursorEnd, window.end);
  }

  if (cursorStart !== null && cursorEnd !== null) total += cursorEnd - cursorStart;
  return total;
}

function computeGaps(entries: WindowRef[], start: number, end: number): GapSummary[] {
  const gaps: GapSummary[] = [];
  let cursor = start;
  let previous: WindowRef | null = null;

  function category(prev: WindowRef | null, next: WindowRef | null, boundary: GapSummary["boundary"]): string {
    if (boundary === "initial") return "Initial";
    if (boundary === "final") return "Final";
    const prevType = prev ? entryType(prev.entry) : "";
    const nextType = next ? entryType(next.entry) : "";
    if (nextType === "GSP") return "Before GSP";
    if (prevType === "GSP") return "After GSP";
    if (isChargeType(prevType)) return "After charge";
    if (isScienceType(prevType) && isScienceType(nextType)) return "Science transition";
    return "Other";
  }

  for (const ref of entries) {
    const clippedBegin = Math.max(start, ref.begin);
    const clippedEnd = Math.min(end, ref.end);
    if (clippedEnd <= start || clippedBegin >= end) continue;

    if (clippedBegin > cursor) {
      const boundary = previous ? "between" : "initial";
      gaps.push({
        start: cursor,
        end: clippedBegin,
        durationSec: clippedBegin - cursor,
        after: previous ? entryLabel(previous.entry) : null,
        before: entryLabel(ref.entry),
        boundary,
        category: category(previous, ref, boundary),
      });
    }

    if (clippedEnd >= cursor) {
      cursor = clippedEnd;
      previous = ref;
    }
  }

  if (cursor < end) {
    gaps.push({
      start: cursor,
      end,
      durationSec: end - cursor,
      after: previous ? entryLabel(previous.entry) : null,
      before: null,
      boundary: "final",
      category: category(previous, null, "final"),
    });
  }

  return gaps.sort((a, b) => b.durationSec - a.durationSec);
}

function computeActivitySummaries(ppst: PPSTEntry[]): ActivitySummary[] {
  const rows = new Map<string, ActivitySummary>();
  for (const entry of ppst) {
    const type = entryType(entry);
    const row = rows.get(type) ?? {
      type,
      count: 0,
      durationSec: 0,
      exposureSec: 0,
      slewSec: 0,
    };
    const duration = entryDuration(entry);
    row.count += 1;
    row.durationSec += duration;
    row.exposureSec += numericField(entry.exposure);
    row.slewSec += Math.min(duration, numericField(entry.slewtime));
    rows.set(type, row);
  }

  return [...rows.values()].sort((a, b) => b.durationSec - a.durationSec || a.type.localeCompare(b.type));
}

function computeStationSummaries(ppst: PPSTEntry[], downlinkRateMBps: number | null): StationSummary[] {
  const rows = new Map<string, StationSummary>();
  for (const entry of ppst) {
    if (entryType(entry) !== "GSP") continue;
    const station = entry.station || ppstDisplayName(entry) || "UNKNOWN";
    const row = rows.get(station) ?? {
      station,
      count: 0,
      scheduledSec: 0,
      contactSec: 0,
      downlinkMB: null,
    };
    row.count += 1;
    row.scheduledSec += entryDuration(entry);
    row.contactSec += positiveDuration(entry.contact_begin, entry.contact_end) || entryDuration(entry);
    row.downlinkMB = downlinkRateMBps === null ? null : row.contactSec * downlinkRateMBps;
    rows.set(station, row);
  }
  return [...rows.values()].sort((a, b) => b.scheduledSec - a.scheduledSec || a.station.localeCompare(b.station));
}

function computeSlewSummaries(ppst: PPSTEntry[]): SlewSummary[] {
  return ppst
    .filter((entry) => numericField(entry.slewtime) > 0)
    .map((entry) => ({
      target: ppstDisplayName(entry),
      type: entryType(entry),
      start: entry.begin,
      durationSec: numericField(entry.slewtime),
      distanceDeg: finiteNumber(entry.slewdist) ? entry.slewdist : null,
    }))
    .sort((a, b) => b.durationSec - a.durationSec || (b.distanceDeg ?? -1) - (a.distanceDeg ?? -1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

const PANEL_SUN_BIN_WIDTH_DEG = 5;
const PANEL_SUN_FACE_BIN_WIDTH = 0.125;
const BODY_FACE_BIN_WIDTH = 0.2;
const PANEL_SUN_MODE_ORDER = ["SCIENCE", "SLEWING", "CHARGING", "PASS", "IDLE", "OTHER"];

interface WeightedAngleSample {
  angleDeg: number;
  panelU: number;
  panelV: number;
  panelDot: number;
  durationSec: number;
  mode: string;
  inEclipse: boolean;
}

function emptyPanelSunAngle(reason: string, panelNormalSc: [number, number, number] | null): PanelSunAngleSummary {
  return {
    available: false,
    unavailableReason: reason,
    panelNormalSc,
    samples: 0,
    durationSec: 0,
    minDeg: null,
    meanDeg: null,
    medianDeg: null,
    maxDeg: null,
    within45Sec: 0,
    within90Sec: 0,
    modes: [],
    bins: [],
    panelBasisUSc: null,
    panelBasisVSc: null,
    frontFaceBins: [],
    backsideSunlitSec: 0,
  };
}

function vectorTuple(value: THREE.Vector3): [number, number, number] {
  const cleanZero = (component: number): number => (Object.is(component, -0) ? 0 : component);
  return [cleanZero(value.x), cleanZero(value.y), cleanZero(value.z)];
}

function panelAzimuthBasis(panel: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const candidates = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const reference = candidates.reduce((best, candidate) =>
    Math.abs(candidate.dot(panel)) < Math.abs(best.dot(panel)) ? candidate : best,
  );
  const u = reference.clone().addScaledVector(panel, -reference.dot(panel)).normalize();
  // This orientation makes +90 degrees align with body +Y for a body -Z panel.
  const v = u.clone().cross(panel).normalize();
  return { u, v };
}

function panelSunMode(data: VizData, entries: WindowRef[], index: number, time: number): string {
  const reported = cleanTelemetryString(data.ephem.acs_mode?.[index])?.toUpperCase();
  if (reported) {
    if (reported.includes("SCIENCE") || reported.includes("OBSERV")) return "SCIENCE";
    if (reported.includes("SLEW")) return "SLEWING";
    if (reported.includes("CHARG") || reported.includes("SUN")) return "CHARGING";
    if (reported.includes("PASS") || reported.includes("GSP")) return "PASS";
    if (reported.includes("IDLE")) return "IDLE";
    return "OTHER";
  }

  const active = entryAtTime(entries, time);
  if (!active) return "IDLE";
  if (time < active.begin + numericField(active.entry.slewtime)) return "SLEWING";
  const type = entryType(active.entry);
  if (type === "GSP") return "PASS";
  if (isChargeType(type)) return "CHARGING";
  if (isScienceType(type)) return "SCIENCE";
  return "OTHER";
}

function weightedMedianAngle(samples: WeightedAngleSample[], totalDurationSec: number): number {
  const sorted = [...samples].sort((a, b) => a.angleDeg - b.angleDeg);
  const midpoint = totalDurationSec / 2;
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.durationSec;
    if (cumulative >= midpoint) return sample.angleDeg;
  }
  return sorted.at(-1)?.angleDeg ?? 0;
}

/**
 * Summarize the angle between the GCRS Sun direction and configured panel
 * normal. COAST quaternions are Hamilton, scalar-first, and inertial-to-body.
 */
export function computePanelSunAngle(data: VizData): PanelSunAngleSummary {
  const direction = data.meta.solar_panel?.direction_sc;
  const panel = vec3(direction);
  if (!direction || !panel || panel.lengthSq() === 0) {
    return emptyPanelSunAngle("configured panel direction is unavailable", null);
  }
  panel.normalize();
  const panelNormalSc: [number, number, number] = [panel.x, panel.y, panel.z];
  const azimuthBasis = panelAzimuthBasis(panel);

  const ephem = data.ephem;
  const n = ephem.utime.length;
  const quaternions = [ephem.quat_w, ephem.quat_x, ephem.quat_y, ephem.quat_z];
  if (n < 2 || quaternions.some((values) => !Array.isArray(values) || values.length !== n)) {
    return emptyPanelSunAngle("complete attitude quaternion telemetry is unavailable", panelNormalSc);
  }
  if (ephem.sunvec.length !== n) {
    return emptyPanelSunAngle("Sun-vector telemetry length does not match ephemeris time", panelNormalSc);
  }

  const qw = ephem.quat_w as number[];
  const qx = ephem.quat_x as number[];
  const qy = ephem.quat_y as number[];
  const qz = ephem.quat_z as number[];
  const entries = sortedValidEntries(data.ppst);
  const samples: WeightedAngleSample[] = [];

  // Samples represent the interval beginning at utime[i]. The final timestamp
  // is a boundary and intentionally contributes no duration.
  for (let i = 0; i < n - 1; i++) {
    const durationSec = positiveDuration(ephem.utime[i], ephem.utime[i + 1]);
    const sun = vec3(ephem.sunvec[i]);
    if (durationSec <= 0 || !sun || sun.lengthSq() === 0) continue;
    if (![qw[i], qx[i], qy[i], qz[i]].every(finiteNumber)) continue;

    const inertialToBody = new THREE.Quaternion(qx[i], qy[i], qz[i], qw[i]);
    if (inertialToBody.lengthSq() === 0) continue;
    inertialToBody.normalize();
    const sunBody = sun.normalize().applyQuaternion(inertialToBody);
    samples.push({
      angleDeg: angleDeg(sunBody, panel),
      panelU: sunBody.dot(azimuthBasis.u),
      panelV: sunBody.dot(azimuthBasis.v),
      panelDot: sunBody.dot(panel),
      durationSec,
      mode: panelSunMode(data, entries, i, ephem.utime[i]),
      inEclipse: numericField(ephem.ineclipse[i]) > 0,
    });
  }

  if (samples.length === 0) {
    return emptyPanelSunAngle("no valid panel-angle intervals are available", panelNormalSc);
  }
  const sunlitSamples = samples.filter((sample) => !sample.inEclipse);
  if (sunlitSamples.length === 0) {
    return emptyPanelSunAngle("no sunlit panel-angle intervals are available", panelNormalSc);
  }

  const bins: PanelSunAngleBin[] = Array.from({ length: 180 / PANEL_SUN_BIN_WIDTH_DEG }, (_, index) => ({
    minDeg: index * PANEL_SUN_BIN_WIDTH_DEG,
    maxDeg: (index + 1) * PANEL_SUN_BIN_WIDTH_DEG,
    durationSecByMode: {},
  }));
  const activeModes = new Set<string>();
  const faceBinsPerAxis = Math.round(2 / PANEL_SUN_FACE_BIN_WIDTH);
  const frontFaceBins: PanelSunFaceBin[] = [];
  for (let vIndex = 0; vIndex < faceBinsPerAxis; vIndex++) {
    for (let uIndex = 0; uIndex < faceBinsPerAxis; uIndex++) {
      frontFaceBins.push({
        uMin: -1 + uIndex * PANEL_SUN_FACE_BIN_WIDTH,
        uMax: -1 + (uIndex + 1) * PANEL_SUN_FACE_BIN_WIDTH,
        vMin: -1 + vIndex * PANEL_SUN_FACE_BIN_WIDTH,
        vMax: -1 + (vIndex + 1) * PANEL_SUN_FACE_BIN_WIDTH,
        sunlitDurationSec: 0,
        equivalentSunSec: 0,
      });
    }
  }
  let durationSec = 0;
  let weightedAngleSum = 0;
  let within45Sec = 0;
  let within90Sec = 0;
  let backsideSunlitSec = 0;

  for (const sample of sunlitSamples) {
    durationSec += sample.durationSec;
    weightedAngleSum += sample.angleDeg * sample.durationSec;
    if (sample.angleDeg <= 45) within45Sec += sample.durationSec;
    if (sample.angleDeg <= 90) within90Sec += sample.durationSec;
    activeModes.add(sample.mode);
    const binIndex = Math.min(bins.length - 1, Math.floor(sample.angleDeg / PANEL_SUN_BIN_WIDTH_DEG));
    const durations = bins[binIndex].durationSecByMode;
    durations[sample.mode] = (durations[sample.mode] ?? 0) + sample.durationSec;
    if (sample.panelDot >= 0) {
      const uIndex = Math.min(
        faceBinsPerAxis - 1,
        Math.max(0, Math.floor((sample.panelU + 1) / PANEL_SUN_FACE_BIN_WIDTH)),
      );
      const vIndex = Math.min(
        faceBinsPerAxis - 1,
        Math.max(0, Math.floor((sample.panelV + 1) / PANEL_SUN_FACE_BIN_WIDTH)),
      );
      const faceBin = frontFaceBins[vIndex * faceBinsPerAxis + uIndex];
      faceBin.sunlitDurationSec += sample.durationSec;
      faceBin.equivalentSunSec += sample.durationSec * sample.panelDot;
    } else {
      backsideSunlitSec += sample.durationSec;
    }
  }

  const angles = sunlitSamples.map((sample) => sample.angleDeg);
  return {
    available: true,
    unavailableReason: null,
    panelNormalSc,
    samples: sunlitSamples.length,
    durationSec,
    minDeg: Math.min(...angles),
    meanDeg: weightedAngleSum / durationSec,
    medianDeg: weightedMedianAngle(sunlitSamples, durationSec),
    maxDeg: Math.max(...angles),
    within45Sec,
    within90Sec,
    modes: PANEL_SUN_MODE_ORDER.filter((mode) => activeModes.has(mode)),
    bins,
    panelBasisUSc: vectorTuple(azimuthBasis.u),
    panelBasisVSc: vectorTuple(azimuthBasis.v),
    frontFaceBins,
    backsideSunlitSec,
  };
}

function emptyThermalGeometry(reason: string): ThermalGeometrySummary {
  return {
    available: false,
    unavailableReason: reason,
    samples: [],
    durationSec: 0,
    sunlitSec: 0,
    eclipseSec: 0,
    earthAngularRadiusMinDeg: null,
    earthAngularRadiusMeanDeg: null,
    earthAngularRadiusMaxDeg: null,
    sunDwellBins: [],
    earthDwellBins: [],
    surfaces: [],
  };
}

const BODY_FACE_BASES: Array<{
  face: string;
  normal: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
}> = [
  { face: "+X", normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { face: "-X", normal: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { face: "+Y", normal: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  { face: "-Y", normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { face: "+Z", normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { face: "-Z", normal: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
];

function tupleDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function directionFaceDwellBins(
  samples: BodyDirectionSample[],
  source: "sun" | "earth",
): BodyFaceDwellBin[] {
  const binCount = 2 / BODY_FACE_BIN_WIDTH;
  const durations = new Map<string, number>();

  for (const sample of samples) {
    if (source === "sun" && sample.inEclipse) continue;
    const direction = source === "sun" ? sample.sunBody : sample.earthBody;
    const basis = BODY_FACE_BASES.reduce((best, candidate) =>
      tupleDot(direction, candidate.normal) > tupleDot(direction, best.normal) ? candidate : best,
    );
    const faceProjection = tupleDot(direction, basis.normal);
    const u = Math.max(-1, Math.min(1, tupleDot(direction, basis.u) / faceProjection));
    const v = Math.max(-1, Math.min(1, tupleDot(direction, basis.v) / faceProjection));
    const uIndex = Math.max(0, Math.min(binCount - 1, Math.floor((u + 1) / BODY_FACE_BIN_WIDTH)));
    const vIndex = Math.max(0, Math.min(binCount - 1, Math.floor((v + 1) / BODY_FACE_BIN_WIDTH)));
    const key = `${basis.face}:${uIndex}:${vIndex}`;
    durations.set(key, (durations.get(key) ?? 0) + sample.durationSec);
  }

  return [...durations.entries()]
    .map(([key, durationSec]) => {
      const [face, uIndexRaw, vIndexRaw] = key.split(":");
      const uIndex = Number(uIndexRaw);
      const vIndex = Number(vIndexRaw);
      return {
        face,
        uMin: -1 + uIndex * BODY_FACE_BIN_WIDTH,
        uMax: -1 + (uIndex + 1) * BODY_FACE_BIN_WIDTH,
        vMin: -1 + vIndex * BODY_FACE_BIN_WIDTH,
        vMax: -1 + (vIndex + 1) * BODY_FACE_BIN_WIDTH,
        durationSec,
      };
    })
    .sort((a, b) => {
      const faceOrder = BODY_FACE_BASES.findIndex((basis) => basis.face === a.face) -
        BODY_FACE_BASES.findIndex((basis) => basis.face === b.face);
      if (faceOrder !== 0) return faceOrder;
      return a.vMin - b.vMin || a.uMin - b.uMin;
    });
}

function positiveAzimuthIntegral(offset: number, amplitude: number): number {
  if (amplitude <= 0) return 2 * Math.PI * Math.max(0, offset);
  if (offset >= amplitude) return 2 * Math.PI * offset;
  if (offset <= -amplitude) return 0;
  const halfWidth = Math.acos(-offset / amplitude);
  return 2 * (offset * halfWidth + amplitude * Math.sin(halfWidth));
}

function adaptiveSimpson(
  fn: (value: number) => number,
  lower: number,
  upper: number,
  tolerance: number,
  maxDepth: number,
): number {
  const midpoint = (lower + upper) / 2;
  const fLower = fn(lower);
  const fMidpoint = fn(midpoint);
  const fUpper = fn(upper);
  const whole = ((upper - lower) * (fLower + 4 * fMidpoint + fUpper)) / 6;

  const refine = (
    start: number,
    end: number,
    fStart: number,
    fMiddle: number,
    fEnd: number,
    estimate: number,
    target: number,
    depth: number,
  ): number => {
    const middle = (start + end) / 2;
    const leftMiddle = (start + middle) / 2;
    const rightMiddle = (middle + end) / 2;
    const fLeftMiddle = fn(leftMiddle);
    const fRightMiddle = fn(rightMiddle);
    const left = ((middle - start) * (fStart + 4 * fLeftMiddle + fMiddle)) / 6;
    const right = ((end - middle) * (fMiddle + 4 * fRightMiddle + fEnd)) / 6;
    const correction = left + right - estimate;
    if (depth <= 0 || Math.abs(correction) <= 15 * target) {
      return left + right + correction / 15;
    }
    return refine(start, middle, fStart, fLeftMiddle, fMiddle, left, target / 2, depth - 1) +
      refine(middle, end, fMiddle, fRightMiddle, fEnd, right, target / 2, depth - 1);
  };

  return refine(lower, upper, fLower, fMidpoint, fUpper, whole, tolerance, maxDepth);
}

/**
 * Radiative view factor from a differential flat surface to Earth's apparent
 * disk. Full and hidden disks are analytic. For a horizon-clipped disk, the
 * positive projected cosine is integrated analytically around each ring and
 * adaptively across the disk radius.
 */
function earthDiskViewFactor(
  normal: THREE.Vector3,
  earthCenter: THREE.Vector3,
  angularRadiusRad: number,
): number {
  const centerCosine = Math.max(-1, Math.min(1, normal.dot(earthCenter)));
  const centerAngle = Math.acos(centerCosine);
  const halfPi = Math.PI / 2;
  if (centerAngle - angularRadiusRad >= halfPi) return 0;
  if (centerAngle + angularRadiusRad <= halfPi) {
    return Math.max(0, Math.min(1, Math.sin(angularRadiusRad) ** 2 * centerCosine));
  }

  const centerSine = Math.sqrt(Math.max(0, 1 - centerCosine * centerCosine));
  const integral = adaptiveSimpson(
    (rho) => {
      const offset = centerCosine * Math.cos(rho);
      const amplitude = centerSine * Math.sin(rho);
      return positiveAzimuthIntegral(offset, amplitude) * Math.sin(rho);
    },
    0,
    angularRadiusRad,
    1e-10,
    16,
  );
  return Math.max(0, Math.min(1, integral / Math.PI));
}

function computeSurfaceExposure(
  name: string,
  normalSc: [number, number, number],
  samples: BodyDirectionSample[],
  durationSec: number,
): SurfaceExposureSummary {
  const normal = new THREE.Vector3(...normalSc).normalize();
  let directSunEquivalentSec = 0;
  let peakSunCosine = 0;
  let sunAbove10PercentSec = 0;
  let sunAbove50PercentSec = 0;
  let sunAbove90PercentSec = 0;
  let currentAbove10PercentSec = 0;
  let longestAbove10PercentSec = 0;
  let earthViewFactorSec = 0;
  let peakEarthViewFactor = 0;
  let previousEnd: number | null = null;

  for (const sample of samples) {
    if (previousEnd !== null && Math.abs(sample.time - previousEnd) > 1e-6) {
      currentAbove10PercentSec = 0;
    }
    previousEnd = sample.time + sample.durationSec;

    const sunCosine = sample.inEclipse
      ? 0
      : Math.max(0, normal.dot(new THREE.Vector3(...sample.sunBody)));
    if (sunCosine > 0) {
      directSunEquivalentSec += sunCosine * sample.durationSec;
      peakSunCosine = Math.max(peakSunCosine, sunCosine);
    }
    if (sunCosine >= 0.1) {
      sunAbove10PercentSec += sample.durationSec;
      currentAbove10PercentSec += sample.durationSec;
      longestAbove10PercentSec = Math.max(longestAbove10PercentSec, currentAbove10PercentSec);
    } else {
      currentAbove10PercentSec = 0;
    }
    if (sunCosine >= 0.5) sunAbove50PercentSec += sample.durationSec;
    if (sunCosine >= 0.9) sunAbove90PercentSec += sample.durationSec;

    const earthViewFactor = earthDiskViewFactor(
      normal,
      new THREE.Vector3(...sample.earthBody),
      (sample.earthAngularRadiusDeg * Math.PI) / 180,
    );
    earthViewFactorSec += earthViewFactor * sample.durationSec;
    peakEarthViewFactor = Math.max(peakEarthViewFactor, earthViewFactor);
  }

  const meanEarthViewFactor = durationSec > 0 ? earthViewFactorSec / durationSec : 0;
  return {
    name,
    normalSc,
    directSunEquivalentSec,
    peakSunCosine,
    sunAbove10PercentSec,
    sunAbove50PercentSec,
    sunAbove90PercentSec,
    longestAbove10PercentSec,
    meanEarthViewFactor,
    peakEarthViewFactor,
    meanDeepSpaceViewFactor: 1 - meanEarthViewFactor,
    minimumDeepSpaceViewFactor: 1 - peakEarthViewFactor,
  };
}

/** Summarize body-frame source directions and per-surface exposure geometry. */
export function computeThermalGeometry(data: VizData): ThermalGeometrySummary {
  const ephem = data.ephem;
  const n = ephem.utime.length;
  const quaternions = [ephem.quat_w, ephem.quat_x, ephem.quat_y, ephem.quat_z];
  if (n < 2 || quaternions.some((values) => !Array.isArray(values) || values.length !== n)) {
    return emptyThermalGeometry("complete attitude quaternion telemetry is unavailable");
  }
  if (ephem.sunvec.length !== n || ephem.posvec.length !== n || ephem.ineclipse.length !== n) {
    return emptyThermalGeometry("Sun, position, or eclipse telemetry length does not match ephemeris time");
  }

  const qw = ephem.quat_w as number[];
  const qx = ephem.quat_x as number[];
  const qy = ephem.quat_y as number[];
  const qz = ephem.quat_z as number[];
  const entries = sortedValidEntries(data.ppst);
  const samples: BodyDirectionSample[] = [];

  for (let i = 0; i < n - 1; i++) {
    const durationSec = positiveDuration(ephem.utime[i], ephem.utime[i + 1]);
    const sun = vec3(ephem.sunvec[i]);
    const position = vec3(ephem.posvec[i]);
    if (durationSec <= 0 || !sun || sun.lengthSq() === 0 || !position) continue;
    const radiusKm = position.length();
    if (radiusKm <= EARTH_RADIUS_KM || ![qw[i], qx[i], qy[i], qz[i]].every(finiteNumber)) continue;

    const inertialToBody = new THREE.Quaternion(qx[i], qy[i], qz[i], qw[i]);
    if (inertialToBody.lengthSq() === 0) continue;
    inertialToBody.normalize();
    const sunBody = sun.normalize().applyQuaternion(inertialToBody);
    const earthBody = position.normalize().multiplyScalar(-1).applyQuaternion(inertialToBody);
    samples.push({
      time: ephem.utime[i],
      durationSec,
      mode: panelSunMode(data, entries, i, ephem.utime[i]),
      inEclipse: numericField(ephem.ineclipse[i]) > 0,
      sunBody: vectorTuple(sunBody),
      earthBody: vectorTuple(earthBody),
      earthAngularRadiusDeg: (Math.asin(EARTH_RADIUS_KM / radiusKm) * 180) / Math.PI,
    });
  }

  if (samples.length === 0) {
    return emptyThermalGeometry("no valid body-frame direction intervals are available");
  }

  const durationSec = samples.reduce((total, sample) => total + sample.durationSec, 0);
  const eclipseSec = samples.reduce(
    (total, sample) => total + (sample.inEclipse ? sample.durationSec : 0),
    0,
  );
  const earthRadii = samples.map((sample) => sample.earthAngularRadiusDeg);
  const weightedEarthRadius = samples.reduce(
    (total, sample) => total + sample.earthAngularRadiusDeg * sample.durationSec,
    0,
  );
  const surfaceDefinitions: Array<{ name: string; normal: [number, number, number] }> = [
    { name: "+X", normal: [1, 0, 0] },
    { name: "-X", normal: [-1, 0, 0] },
    { name: "+Y", normal: [0, 1, 0] },
    { name: "-Y", normal: [0, -1, 0] },
    { name: "+Z", normal: [0, 0, 1] },
    { name: "-Z", normal: [0, 0, -1] },
  ];
  const panel = vec3(data.meta.solar_panel?.direction_sc);
  if (panel && panel.lengthSq() > 0) {
    panel.normalize();
    const panelNormal = vectorTuple(panel);
    const alignedFace = surfaceDefinitions.find(
      (surface) => tupleDot(surface.normal, panelNormal) > 1 - 1e-9,
    );
    if (alignedFace) {
      alignedFace.name = `${alignedFace.name} / solar panel`;
    } else {
      surfaceDefinitions.push({ name: "Solar panel", normal: panelNormal });
    }
  }

  return {
    available: true,
    unavailableReason: null,
    samples,
    durationSec,
    sunlitSec: durationSec - eclipseSec,
    eclipseSec,
    earthAngularRadiusMinDeg: Math.min(...earthRadii),
    earthAngularRadiusMeanDeg: weightedEarthRadius / durationSec,
    earthAngularRadiusMaxDeg: Math.max(...earthRadii),
    sunDwellBins: directionFaceDwellBins(samples, "sun"),
    earthDwellBins: directionFaceDwellBins(samples, "earth"),
    surfaces: surfaceDefinitions.map((surface) =>
      computeSurfaceExposure(surface.name, surface.normal, samples, durationSec),
    ),
  };
}

function computeScienceSummary(ppst: PPSTEntry[]): ScienceSummary {
  const scienceEntries = ppst.filter((entry) => isScienceType(entryType(entry)));
  const scheduledSec = scienceEntries.reduce((total, entry) => total + entryDuration(entry), 0);
  const exposureSec = scienceEntries.reduce((total, entry) => total + numericField(entry.exposure), 0);
  const slewSec = scienceEntries.reduce(
    (total, entry) => total + Math.min(entryDuration(entry), numericField(entry.slewtime)),
    0,
  );

  return {
    count: scienceEntries.length,
    scheduledSec,
    exposureSec,
    slewSec,
    overheadSec: Math.max(0, scheduledSec - exposureSec),
    medianExposureSec: median(scienceEntries.map((entry) => numericField(entry.exposure))),
    meanSlewSec: scienceEntries.length > 0 ? slewSec / scienceEntries.length : 0,
  };
}

function computeSlewDistribution(slews: SlewSummary[]): SlewDistributionBin[] {
  const bins: SlewDistributionBin[] = [
    { label: "0-1m", minSec: 0, maxSec: 60, count: 0 },
    { label: "1-2m", minSec: 60, maxSec: 120, count: 0 },
    { label: "2-3m", minSec: 120, maxSec: 180, count: 0 },
    { label: "3-4m", minSec: 180, maxSec: 240, count: 0 },
    { label: "4-5m", minSec: 240, maxSec: 300, count: 0 },
    { label: ">5m", minSec: 300, maxSec: null, count: 0 },
  ];

  for (const slew of slews) {
    const bin = bins.find(
      (candidate) =>
        slew.durationSec >= candidate.minSec &&
        (candidate.maxSec === null || slew.durationSec < candidate.maxSec),
    );
    if (bin) bin.count += 1;
  }

  return bins;
}

function clippedSegment(
  start: number,
  end: number,
  windowStart: number,
  windowEnd: number,
  label: string,
  kind: string,
): TimelineChartSegment | null {
  const clippedStart = Math.max(windowStart, start);
  const clippedEnd = Math.min(windowEnd, end);
  if (clippedEnd <= clippedStart) return null;
  return {
    start: clippedStart,
    end: clippedEnd,
    label,
    kind,
  };
}

function computeEclipseSegments(data: VizData, start: number, end: number): TimelineChartSegment[] {
  const times = data.ephem.utime;
  const eclipse = data.ephem.ineclipse;
  const segments: TimelineChartSegment[] = [];
  let segmentStart: number | null = null;

  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i];
    const isEclipse = numericField(eclipse[i]) > 0;
    if (isEclipse && segmentStart === null) {
      segmentStart = t0;
    }
    if (!isEclipse && segmentStart !== null) {
      const segment = clippedSegment(segmentStart, t0, start, end, "Eclipse", "eclipse");
      if (segment) segments.push(segment);
      segmentStart = null;
    }
  }

  if (segmentStart !== null) {
    const segment = clippedSegment(segmentStart, end, start, end, "Eclipse", "eclipse");
    if (segment) segments.push(segment);
  }

  return segments;
}

function finiteValues(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => finiteNumber(value));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function computeOrbitContext(data: VizData, eclipseSegments: TimelineChartSegment[]): OrbitContextSummary {
  const beta = finiteValues(data.ephem.beta);
  const lat = finiteValues(data.ephem.lat);
  return {
    eclipseSec: eclipseSegments.reduce((total, segment) => total + segment.end - segment.start, 0),
    eclipseCount: eclipseSegments.length,
    betaMinDeg: beta.length > 0 ? Math.min(...beta) : null,
    betaMeanDeg: mean(beta),
    betaMaxDeg: beta.length > 0 ? Math.max(...beta) : null,
    latMinDeg: lat.length > 0 ? Math.min(...lat) : null,
    latMaxDeg: lat.length > 0 ? Math.max(...lat) : null,
  };
}

function computeTimeline(
  data: VizData,
  entries: WindowRef[],
  gaps: GapSummary[],
  start: number,
  end: number,
  eclipseSegments: TimelineChartSegment[],
): TimelineChartLane[] {
  const activitySegments: TimelineChartSegment[] = [];
  entries.forEach((ref) => {
    const type = entryType(ref.entry);
    const segment = clippedSegment(ref.begin, ref.end, start, end, entryLabel(ref.entry), type);
    if (segment) activitySegments.push(segment);
  });

  gaps.forEach((gap) => {
    const segment = clippedSegment(gap.start, gap.end, start, end, "Idle", "idle");
    if (segment) activitySegments.push(segment);
  });

  const slewSegments: TimelineChartSegment[] = [];
  entries.forEach((ref) => {
    const slewtime = Math.min(entryDuration(ref.entry), numericField(ref.entry.slewtime));
    if (slewtime <= 0) return;
    const segment = clippedSegment(
      ref.begin,
      ref.begin + slewtime,
      start,
      end,
      `Slew to ${ppstDisplayName(ref.entry)}`,
      "slew",
    );
    if (segment) slewSegments.push(segment);
  });

  return [
    {
      label: "Activity",
      segments: activitySegments.sort((a, b) => a.start - b.start || a.end - b.end),
    },
    {
      label: "Slew",
      segments: slewSegments.sort((a, b) => a.start - b.start || a.end - b.end),
    },
    {
      label: "Eclipse",
      segments: eclipseSegments,
    },
  ];
}

function configuredEarthLimbMinAngleDeg(data: VizData, options: PlanStatsOptions): { value: number; configured: boolean } {
  const optionValue = options.earthLimbMinAngleDeg;
  if (finiteNumber(optionValue) && optionValue >= 0) return { value: optionValue, configured: true };

  const metaValue = data.meta.constraints?.earth_limb_min_angle_deg;
  if (finiteNumber(metaValue) && metaValue >= 0) return { value: metaValue, configured: true };

  return { value: 0, configured: false };
}

function configuredSunKeepout(data: VizData): {
  value: number;
  configured: boolean;
  disabledInEclipse: boolean;
  umbraOnly: boolean | null;
} {
  const meta = data.meta.constraints;
  const value = meta?.sun_min_angle_deg;
  if (!finiteNumber(value) || value < 0) {
    return {
      value: 0,
      configured: false,
      disabledInEclipse: false,
      umbraOnly: null,
    };
  }

  return {
    value,
    configured: true,
    disabledInEclipse: meta?.sun_constraint_disabled_in_eclipse === true,
    umbraOnly:
      typeof meta?.sun_constraint_eclipse_umbra_only === "boolean"
        ? meta.sun_constraint_eclipse_umbra_only
        : null,
  };
}

function computeConstraints(
  data: VizData,
  entries: WindowRef[],
  earthKeepoutDeg: number,
  earthKeepoutConfigured: boolean,
  sunKeepoutDeg: number,
  sunKeepoutConfigured: boolean,
  sunKeepoutDisabledInEclipse: boolean,
  sunKeepoutUmbraOnly: boolean | null,
): ConstraintSummary {
  const ra = data.ephem.ra;
  const dec = data.ephem.dec;
  if (!Array.isArray(ra) || !Array.isArray(dec)) {
    return {
      samples: 0,
      earthKeepoutDeg,
      earthKeepoutConfigured,
      earthMinMarginDeg: null,
      earthWorstTime: null,
      earthWorstEntry: null,
      earthViolationSamples: 0,
      earthPhysicalIntersectionSamples: 0,
      earthKeepoutMinMarginDeg: null,
      sunApplicableMinAngleDeg: null,
      sunApplicableWorstTime: null,
      sunApplicableWorstEntry: null,
      sunKeepoutDeg,
      sunKeepoutConfigured,
      sunKeepoutDisabledInEclipse,
      sunKeepoutUmbraOnly,
      sunKeepoutSamples: 0,
      sunViolationSamples: 0,
      sunKeepoutMinMarginDeg: null,
      sunKeepoutWorstTime: null,
      sunKeepoutWorstEntry: null,
    };
  }

  let samples = 0;
  let earthMinMarginDeg: number | null = null;
  let earthWorstTime: number | null = null;
  let earthWorstEntry: string | null = null;
  let earthViolationSamples = 0;
  let earthPhysicalIntersectionSamples = 0;
  let earthKeepoutMinMarginDeg: number | null = null;
  let sunApplicableMinAngleDeg: number | null = null;
  let sunApplicableWorstTime: number | null = null;
  let sunApplicableWorstEntry: string | null = null;
  let sunKeepoutSamples = 0;
  let sunViolationSamples = 0;
  let sunKeepoutMinMarginDeg: number | null = null;
  let sunKeepoutWorstTime: number | null = null;
  let sunKeepoutWorstEntry: string | null = null;

  data.ephem.utime.forEach((t, i) => {
    if (!finiteNumber(ra[i]) || !finiteNumber(dec[i])) return;
    const pos = vec3(data.ephem.posvec[i]);
    const sun = vec3(data.ephem.sunvec[i]);
    if (!pos) return;
    const active = scienceCollectionAtTime(entries, t);
    if (!active) return;
    const boresight = radec2eci(ra[i], dec[i]).normalize();
    const activeLabel = entryLabel(active.entry);
    samples += 1;

    const radiusKm = pos.length();
    if (radiusKm > 0) {
      const earthCenter = pos.clone().multiplyScalar(-1).normalize();
      const earthCenterAngleDeg = angleDeg(boresight, earthCenter);
      const earthAngularRadiusDeg = (Math.asin(Math.min(1, EARTH_RADIUS_KM / radiusKm)) * 180) / Math.PI;
      const margin = earthCenterAngleDeg - earthAngularRadiusDeg;
      if (earthMinMarginDeg === null || margin < earthMinMarginDeg) {
        earthMinMarginDeg = margin;
        earthWorstTime = t;
        earthWorstEntry = activeLabel;
      }
      const keepoutMargin = margin - earthKeepoutDeg;
      if (earthKeepoutMinMarginDeg === null || keepoutMargin < earthKeepoutMinMarginDeg) {
        earthKeepoutMinMarginDeg = keepoutMargin;
      }
      if (keepoutMargin < 0) earthViolationSamples += 1;
      if (margin < 0) earthPhysicalIntersectionSamples += 1;
    }

    if (sun && sun.lengthSq() > 0) {
      const sunAngle = angleDeg(boresight, sun);
      const inEclipse = numericField(data.ephem.ineclipse[i]) > 0;

      const keepoutApplies = sunKeepoutConfigured && !(sunKeepoutDisabledInEclipse && inEclipse);
      if (keepoutApplies) {
        sunKeepoutSamples += 1;
        if (sunApplicableMinAngleDeg === null || sunAngle < sunApplicableMinAngleDeg) {
          sunApplicableMinAngleDeg = sunAngle;
          sunApplicableWorstTime = t;
          sunApplicableWorstEntry = activeLabel;
        }
        const keepoutMargin = sunAngle - sunKeepoutDeg;
        if (sunKeepoutMinMarginDeg === null || keepoutMargin < sunKeepoutMinMarginDeg) {
          sunKeepoutMinMarginDeg = keepoutMargin;
          sunKeepoutWorstTime = t;
          sunKeepoutWorstEntry = activeLabel;
        }
        if (keepoutMargin < 0) sunViolationSamples += 1;
      }
    }
  });

  return {
    samples,
    earthKeepoutDeg,
    earthKeepoutConfigured,
    earthMinMarginDeg,
    earthWorstTime,
    earthWorstEntry,
    earthViolationSamples,
    earthPhysicalIntersectionSamples,
    earthKeepoutMinMarginDeg,
    sunApplicableMinAngleDeg,
    sunApplicableWorstTime,
    sunApplicableWorstEntry,
    sunKeepoutDeg,
    sunKeepoutConfigured,
    sunKeepoutDisabledInEclipse,
    sunKeepoutUmbraOnly,
    sunKeepoutSamples,
    sunViolationSamples,
    sunKeepoutMinMarginDeg,
    sunKeepoutWorstTime,
    sunKeepoutWorstEntry,
  };
}

function cleanTelemetryString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "none" || cleaned.toLowerCase() === "null") return null;
  return cleaned;
}

function displayConstraintName(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper === "ST") return "Star tracker";
      if (upper === "ACS") return "ACS";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function classifyConstraintName(
  value: string,
  sourceLabel = "COAST in_constraint",
): {
  key: string;
  kind: "hard" | "soft";
  constraint: string;
  detail?: string;
} {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.includes("st soft") || normalized.includes("star tracker soft")) {
    return {
      key: "soft:star-tracker",
      kind: "soft",
      constraint: "Star tracker soft",
      detail: `reported by ${sourceLabel}: ${value}`,
    };
  }
  if (normalized.includes("st hard") || normalized.includes("star tracker hard")) {
    return {
      key: "hard:star-tracker",
      kind: "hard",
      constraint: "Star tracker hard",
      detail: `reported by ${sourceLabel}: ${value}`,
    };
  }
  if (normalized.includes("radiator") && normalized.includes("hard")) {
    return {
      key: "hard:radiator",
      kind: "hard",
      constraint: "Radiator hard",
      detail: `reported by ${sourceLabel}: ${value}`,
    };
  }
  const kind = normalized.includes("soft") ? "soft" : "hard";
  return {
    key: `${kind}:${normalized || value}`,
    kind,
    constraint: displayConstraintName(value),
    detail: `reported by ${sourceLabel}: ${value}`,
  };
}

function starTrackerDetail(data: VizData, index: number, prefix: string): string {
  const status = data.ephem.star_tracker_status?.[index];
  const functional = data.ephem.star_tracker_functional_count?.[index];
  const parts = [prefix];
  if (finiteNumber(functional) && Array.isArray(status)) {
    parts.push(`${functional}/${status.length} trackers functional`);
  } else if (finiteNumber(functional)) {
    parts.push(`${functional} trackers functional`);
  }
  if (Array.isArray(status)) {
    const blocked = status
      .map((ok, i) => (ok ? null : `tracker ${i + 1}`))
      .filter((value): value is string => value !== null);
    if (blocked.length > 0) parts.push(`blocked: ${blocked.join(", ")}`);
  }
  return parts.join("; ");
}

interface PendingConstraintViolation {
  kind: "hard" | "soft";
  constraint: string;
  samples: number;
  firstTime: number;
  lastTime: number;
  firstEntry: string | null;
  lastEntry: string | null;
  modes: Set<string>;
  detail?: string;
}

function recordConstraintViolation(
  rows: Map<string, PendingConstraintViolation>,
  event: {
    key: string;
    kind: "hard" | "soft";
    constraint: string;
    detail?: string;
  },
  time: number,
  entry: string | null,
  mode: string | null,
): void {
  const existing = rows.get(event.key);
  if (!existing) {
    rows.set(event.key, {
      kind: event.kind,
      constraint: event.constraint,
      samples: 1,
      firstTime: time,
      lastTime: time,
      firstEntry: entry,
      lastEntry: entry,
      modes: mode ? new Set([mode]) : new Set(),
      detail: event.detail,
    });
    return;
  }
  existing.samples += 1;
  existing.lastTime = time;
  existing.lastEntry = entry;
  if (mode) existing.modes.add(mode);
  if (event.detail) existing.detail = event.detail;
}

function computeConstraintTelemetry(data: VizData, entries: WindowRef[]): ConstraintTelemetrySummary {
  const ephem = data.ephem;
  const hasActiveAttitudeTelemetry = Array.isArray(ephem.attitude_constraint);
  const available =
    hasActiveAttitudeTelemetry ||
    Array.isArray(ephem.in_constraint) ||
    Array.isArray(ephem.star_tracker_hard_violations) ||
    Array.isArray(ephem.star_tracker_soft_violations) ||
    Array.isArray(ephem.radiator_hard_violations);

  if (!available) {
    return {
      available: false,
      samples: 0,
      hardViolationSamples: 0,
      softViolationSamples: 0,
      violations: [],
    };
  }

  const rows = new Map<string, PendingConstraintViolation>();
  let hardViolationSamples = 0;
  let softViolationSamples = 0;

  ephem.utime.forEach((time, index) => {
    const events = new Map<
      string,
      {
        key: string;
        kind: "hard" | "soft";
        constraint: string;
        detail?: string;
      }
    >();
    const add = (event: {
      key: string;
      kind: "hard" | "soft";
      constraint: string;
      detail?: string;
    }) => {
      if (!events.has(event.key)) events.set(event.key, event);
    };

    const reportedConstraint = cleanTelemetryString(
      hasActiveAttitudeTelemetry ? ephem.attitude_constraint?.[index] : ephem.in_constraint?.[index],
    );
    if (reportedConstraint) {
      const event = classifyConstraintName(
        reportedConstraint,
        hasActiveAttitudeTelemetry ? "COAST attitude_constraint" : "COAST in_constraint",
      );
      const scope = hasActiveAttitudeTelemetry
        ? cleanTelemetryString(ephem.attitude_constraint_scope?.[index])
        : null;
      if (scope) event.detail = `${event.detail}; active scopes: ${scope}`;
      add(event);
    }

    if (!hasActiveAttitudeTelemetry) {
      const starTrackerHard = ephem.star_tracker_hard_violations?.[index];
      if (finiteNumber(starTrackerHard) && starTrackerHard > 0) {
        add({
          key: "hard:star-tracker",
          kind: "hard",
          constraint: "Star tracker hard",
          detail: starTrackerDetail(
            data,
            index,
            `${starTrackerHard} hard tracker violation${starTrackerHard === 1 ? "" : "s"}`,
          ),
        });
      }

      if (ephem.star_tracker_soft_violations?.[index] === true) {
        add({
          key: "soft:star-tracker",
          kind: "soft",
          constraint: "Star tracker soft",
          detail: starTrackerDetail(data, index, "soft tracker constraint violated"),
        });
      }

      const radiatorHard = ephem.radiator_hard_violations?.[index];
      if (finiteNumber(radiatorHard) && radiatorHard > 0) {
        add({
          key: "hard:radiator",
          kind: "hard",
          constraint: "Radiator hard",
          detail: `${radiatorHard} radiator hard violation${radiatorHard === 1 ? "" : "s"}`,
        });
      }
    }

    if (events.size === 0) return;

    const entry = entryAtTime(entries, time);
    const entryName = entry ? entryLabel(entry.entry) : null;
    const mode = cleanTelemetryString(ephem.acs_mode?.[index]) ?? (entry ? entryType(entry.entry) : null);
    let hardSample = false;
    let softSample = false;
    events.forEach((event) => {
      if (event.kind === "hard") hardSample = true;
      if (event.kind === "soft") softSample = true;
      recordConstraintViolation(rows, event, time, entryName, mode);
    });
    if (hardSample) hardViolationSamples += 1;
    if (softSample) softViolationSamples += 1;
  });

  const violations = [...rows.values()]
    .map((row) => ({
      kind: row.kind,
      constraint: row.constraint,
      samples: row.samples,
      firstTime: row.firstTime,
      lastTime: row.lastTime,
      firstEntry: row.firstEntry,
      lastEntry: row.lastEntry,
      modes: [...row.modes].sort(),
      detail: row.detail,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "hard" ? -1 : 1;
      return b.samples - a.samples || a.constraint.localeCompare(b.constraint);
    });

  return {
    available: true,
    samples: ephem.utime.length,
    hardViolationSamples,
    softViolationSamples,
    violations,
  };
}

function expectedScienceTargetAt(entry: PPSTEntry): { ra: number; dec: number; roll: number | null } | null {
  if (!finiteNumber(entry.ra) || !finiteNumber(entry.dec)) return null;
  return {
    ra: entry.ra,
    dec: entry.dec,
    roll: finiteNumber(entry.roll) ? entry.roll : null,
  };
}

function shouldCheckAttitude(entry: PPSTEntry): boolean {
  return isScienceType(entryType(entry));
}

function gspContactWindow(entry: PPSTEntry): { begin: number; end: number } | null {
  if (positiveDuration(entry.contact_begin, entry.contact_end) > 0) {
    return {
      begin: entry.contact_begin as number,
      end: entry.contact_end as number,
    };
  }
  const duration = entryDuration(entry);
  if (duration <= 0) return null;
  return { begin: entry.begin, end: entry.end };
}

function attitudeCheckWindow(entry: PPSTEntry): { begin: number; end: number } | null {
  const duration = entryDuration(entry);
  if (duration <= 0) return null;
  const begin = entry.begin + Math.min(duration, numericField(entry.slewtime));
  if (entry.end <= begin) return null;
  return { begin, end: entry.end };
}

function computeAttitudeConsistency(
  data: VizData,
  entries: WindowRef[],
  attitudeThresholdDeg: number,
  rollThresholdDeg: number,
): AttitudeConsistencySummary {
  const ra = data.ephem.ra;
  const dec = data.ephem.dec;
  const roll = data.ephem.roll;
  if (!Array.isArray(ra) || !Array.isArray(dec)) {
    return {
      checkedIntervals: 0,
      thresholdDeg: attitudeThresholdDeg,
      rollThresholdDeg,
      samplesChecked: 0,
      samplesOverThreshold: 0,
      intervalsOverThreshold: 0,
      maxBoresightErrorDeg: null,
      maxRollErrorDeg: null,
      worstBoresight: null,
      worstRoll: null,
    };
  }

  let checkedIntervals = 0;
  let samplesChecked = 0;
  let samplesOverThreshold = 0;
  let intervalsOverThreshold = 0;
  let maxBoresightErrorDeg: number | null = null;
  let maxRollErrorDeg: number | null = null;
  let worstBoresight: ConsistencyWorst | null = null;
  let worstRoll: ConsistencyWorst | null = null;

  for (const ref of entries) {
    if (!shouldCheckAttitude(ref.entry)) continue;
    const checkWindow = attitudeCheckWindow(ref.entry);
    if (!checkWindow) continue;
    let intervalChecked = false;
    let intervalOver = false;
    const label = ppstDisplayName(ref.entry);
    const type = entryType(ref.entry);

    data.ephem.utime.forEach((t, i) => {
      if (t < checkWindow.begin || t >= checkWindow.end) return;
      if (!finiteNumber(ra[i]) || !finiteNumber(dec[i])) return;
      const expected = expectedScienceTargetAt(ref.entry);
      if (!expected) return;
      intervalChecked = true;
      samplesChecked += 1;

      const boresightError = angleDeg(radec2eci(expected.ra, expected.dec), radec2eci(ra[i], dec[i]));
      if (maxBoresightErrorDeg === null || boresightError > maxBoresightErrorDeg) {
        maxBoresightErrorDeg = boresightError;
        worstBoresight = { target: label, type, time: t, errorDeg: boresightError };
      }
      if (boresightError > attitudeThresholdDeg) {
        samplesOverThreshold += 1;
        intervalOver = true;
      }

      if (expected.roll !== null && Array.isArray(roll) && finiteNumber(roll[i])) {
        const rollError = Math.abs(wrapDeg180(roll[i] - expected.roll));
        if (maxRollErrorDeg === null || rollError > maxRollErrorDeg) {
          maxRollErrorDeg = rollError;
          worstRoll = { target: label, type, time: t, errorDeg: rollError };
        }
        if (rollError > rollThresholdDeg) intervalOver = true;
      }
    });

    if (intervalChecked) checkedIntervals += 1;
    if (intervalOver) intervalsOverThreshold += 1;
  }

  return {
    checkedIntervals,
    thresholdDeg: attitudeThresholdDeg,
    rollThresholdDeg,
    samplesChecked,
    samplesOverThreshold,
    intervalsOverThreshold,
    maxBoresightErrorDeg,
    maxRollErrorDeg,
    worstBoresight,
    worstRoll,
  };
}

function computeGspExecution(data: VizData, entries: WindowRef[]): GspExecutionSummary {
  const ra = data.ephem.ra;
  const dec = data.ephem.dec;
  if (!Array.isArray(ra) || !Array.isArray(dec)) {
    return {
      contactsChecked: 0,
      samplesChecked: 0,
      maxSweepDeg: null,
      worstSweep: null,
    };
  }

  let contactsChecked = 0;
  let samplesChecked = 0;
  let maxSweepDeg: number | null = null;
  let worstSweep: GspSweepWorst | null = null;

  for (const ref of entries) {
    if (entryType(ref.entry) !== "GSP") continue;
    const window = gspContactWindow(ref.entry);
    if (!window) continue;

    const sampleVectors = data.ephem.utime
      .map((t, i) => {
        if (t < window.begin || t >= window.end) return null;
        if (!finiteNumber(ra[i]) || !finiteNumber(dec[i])) return null;
        return radec2eci(ra[i], dec[i]);
      })
      .filter((sample): sample is THREE.Vector3 => sample !== null);

    if (sampleVectors.length === 0) continue;

    contactsChecked += 1;
    samplesChecked += sampleVectors.length;

    let passSweepDeg = 0;
    for (let i = 0; i < sampleVectors.length; i++) {
      for (let j = i + 1; j < sampleVectors.length; j++) {
        passSweepDeg = Math.max(passSweepDeg, angleDeg(sampleVectors[i], sampleVectors[j]));
      }
    }

    if (maxSweepDeg === null || passSweepDeg > maxSweepDeg) {
      maxSweepDeg = passSweepDeg;
      worstSweep = {
        station: ref.entry.station || ppstDisplayName(ref.entry) || "UNKNOWN",
        target: ppstDisplayName(ref.entry),
        start: window.begin,
        end: window.end,
        samples: sampleVectors.length,
        sweepDeg: passSweepDeg,
      };
    }
  }

  return {
    contactsChecked,
    samplesChecked,
    maxSweepDeg,
    worstSweep,
  };
}

function computeGapCategories(gaps: GapSummary[]): GapCategorySummary[] {
  const rows = new Map<string, GapCategorySummary>();
  gaps.forEach((gap) => {
    const row = rows.get(gap.category) ?? { category: gap.category, count: 0, durationSec: 0 };
    row.count += 1;
    row.durationSec += gap.durationSec;
    rows.set(gap.category, row);
  });
  return [...rows.values()].sort((a, b) => b.durationSec - a.durationSec || a.category.localeCompare(b.category));
}

function explicitSlewDuration(slews: SlewWindow[] | undefined): number {
  return (slews ?? []).reduce((total, slew) => total + positiveDuration(slew.begin, slew.end), 0);
}

function computeFindings(data: VizData, entries: WindowRef[], start: number, end: number): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  data.ppst.forEach((entry, index) => {
    const label = `Entry ${index} ${entryLabel(entry)}`;
    const duration = entryDuration(entry);
    if (!finiteNumber(entry.begin) || !finiteNumber(entry.end) || entry.end <= entry.begin) {
      findings.push({
        severity: "error",
        label: "Invalid entry window",
        detail: `${label} has begin/end values that do not form a positive duration.`,
      });
      return;
    }
    if (entry.begin < start || entry.end > end) {
      findings.push({
        severity: "warn",
        label: "Entry outside ephemeris window",
        detail: `${label} runs ${fmtTime(entry.begin)} to ${fmtTime(entry.end)}.`,
      });
    }
    if (numericField(entry.slewtime) > duration) {
      findings.push({
        severity: "warn",
        label: "Slew longer than entry",
        detail: `${label} has ${Math.round(numericField(entry.slewtime))} s of slew in a ${Math.round(duration)} s entry.`,
      });
    }
    if (entryType(entry) === "GSP") {
      if (!entry.station) {
        findings.push({
          severity: "warn",
          label: "GSP missing station",
          detail: `${label} does not include a station field.`,
        });
      }
      if (
        !finiteNumber(entry.track_start_ra) ||
        !finiteNumber(entry.track_start_dec) ||
        !finiteNumber(entry.track_end_ra) ||
        !finiteNumber(entry.track_end_dec)
      ) {
        findings.push({
          severity: "warn",
          label: "GSP missing tracking endpoints",
          detail: `${label} does not include complete start/end tracking RA/Dec metadata.`,
        });
      }
    }
  });

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const current = entries[i];
    if (current.begin < prev.end) {
      findings.push({
        severity: "error",
        label: "Overlapping entries",
        detail: `${entryLabel(prev.entry)} overlaps ${entryLabel(current.entry)} by ${Math.round(prev.end - current.begin)} s.`,
      });
    }
  }

  const ephemLength = data.ephem.utime.length;
  const sampledFields: Array<keyof typeof data.ephem> = [
    "posvec",
    "sunvec",
    "ramvec",
    "polevec",
    "lat",
    "lon",
    "beta",
    "ineclipse",
    "ra",
    "dec",
    "roll",
    "acs_mode",
    "obsid",
    "in_constraint",
    "attitude_constraint",
    "attitude_constraint_scope",
    "star_tracker_hard_violations",
    "star_tracker_soft_violations",
    "star_tracker_functional_count",
    "star_tracker_status",
    "radiator_hard_violations",
    "sun_angle_deg",
    "earth_angle_deg",
    "moon_angle_deg",
  ];
  sampledFields.forEach((field) => {
    const value = data.ephem[field];
    if (Array.isArray(value) && value.length !== ephemLength) {
      findings.push({
        severity: "error",
        label: "Telemetry length mismatch",
        detail: `ephem.${field} has ${value.length} samples; ephem.utime has ${ephemLength}.`,
      });
    }
  });

  if (!Array.isArray(data.ephem.ra) || !Array.isArray(data.ephem.dec) || !Array.isArray(data.ephem.roll)) {
    findings.push({
      severity: "warn",
      label: "No attitude telemetry",
      detail: "The visualizer will not be able to compare plan intervals against executed RA/Dec/Roll telemetry.",
    });
  }

  return findings;
}

function validationFindings(
  constraints: ConstraintSummary,
  constraintTelemetry: ConstraintTelemetrySummary,
  attitudeConsistency: AttitudeConsistencySummary,
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  if (!constraintTelemetry.available) {
    findings.push({
      severity: "warn",
      label: "No executed constraint telemetry",
      detail: "Hard and soft COAST constraint telemetry is not present in this viz-data payload.",
    });
  }
  if (constraintTelemetry.hardViolationSamples > 0) {
    const top = constraintTelemetry.violations
      .filter((violation) => violation.kind === "hard")
      .slice(0, 3)
      .map((violation) => `${violation.constraint}: ${violation.samples}`)
      .join("; ");
    findings.push({
      severity: "error",
      label: "Executed hard constraint violation",
      detail:
        `${constraintTelemetry.hardViolationSamples} ephemeris sample` +
        `${constraintTelemetry.hardViolationSamples === 1 ? "" : "s"} reported a hard constraint violation` +
        `${top ? ` (${top})` : ""}.`,
    });
  }
  if (constraintTelemetry.softViolationSamples > 0) {
    const top = constraintTelemetry.violations
      .filter((violation) => violation.kind === "soft")
      .slice(0, 3)
      .map((violation) => `${violation.constraint}: ${violation.samples}`)
      .join("; ");
    findings.push({
      severity: "warn",
      label: "Executed soft constraint violation",
      detail:
        `${constraintTelemetry.softViolationSamples} ephemeris sample` +
        `${constraintTelemetry.softViolationSamples === 1 ? "" : "s"} reported a soft constraint violation` +
        `${top ? ` (${top})` : ""}.`,
    });
  }
  if (constraints.earthKeepoutConfigured && constraints.earthViolationSamples > 0) {
    findings.push({
      severity: "error",
      label: "Earth-limb keepout violation",
      detail:
        `Worst keepout margin ${constraints.earthKeepoutMinMarginDeg?.toFixed(2)} deg against ` +
        `${constraints.earthKeepoutDeg.toFixed(2)} deg schedule constraint ` +
        `at ${constraints.earthWorstTime === null ? "unknown time" : fmtTime(constraints.earthWorstTime)}` +
        `${constraints.earthWorstEntry ? ` during ${constraints.earthWorstEntry}` : ""}; ` +
        `raw limb clearance ${constraints.earthMinMarginDeg?.toFixed(2)} deg; ` +
        `${constraints.earthViolationSamples} samples below the configured keepout.`,
    });
  }
  if (constraints.sunKeepoutConfigured && constraints.sunViolationSamples > 0) {
    findings.push({
      severity: "error",
      label: "Sun keepout violation",
      detail:
        `Worst Sun keepout margin ${constraints.sunKeepoutMinMarginDeg?.toFixed(2)} deg against ` +
        `${constraints.sunKeepoutDeg.toFixed(2)} deg schedule constraint ` +
        `at ${
          constraints.sunKeepoutWorstTime === null ? "unknown time" : fmtTime(constraints.sunKeepoutWorstTime)
        }` +
        `${constraints.sunKeepoutWorstEntry ? ` during ${constraints.sunKeepoutWorstEntry}` : ""}; ` +
        `${constraints.sunViolationSamples} applicable samples below the configured keepout.`,
    });
  }
  if (attitudeConsistency.intervalsOverThreshold > 0) {
    findings.push({
      severity: "error",
      label: "Science attitude does not match schedule",
      detail:
        `${attitudeConsistency.intervalsOverThreshold} of ${attitudeConsistency.checkedIntervals} checked science intervals exceed ` +
        `${attitudeConsistency.thresholdDeg} deg boresight or ${attitudeConsistency.rollThresholdDeg} deg roll tolerance. ` +
        `Worst boresight error ${attitudeConsistency.maxBoresightErrorDeg?.toFixed(3)} deg` +
        (attitudeConsistency.worstBoresight
          ? ` at ${fmtTime(attitudeConsistency.worstBoresight.time)} during ${attitudeConsistency.worstBoresight.type} ${attitudeConsistency.worstBoresight.target}.`
          : "."),
    });
  }
  return findings;
}

export function buildPlanStats(data: VizData, options: PlanStatsOptions = {}): PlanStats {
  const utime = data.ephem.utime;
  const start = utime[0];
  const end = utime[utime.length - 1];
  const downlinkRateMBps = finiteNumber(options.downlinkRateMBps) ? options.downlinkRateMBps : null;
  const attitudeThresholdDeg = finiteNumber(options.attitudeThresholdDeg) ? options.attitudeThresholdDeg : 0.5;
  const rollThresholdDeg = finiteNumber(options.rollThresholdDeg) ? options.rollThresholdDeg : 1.0;
  const earthKeepout = configuredEarthLimbMinAngleDeg(data, options);
  const sunKeepout = configuredSunKeepout(data);
  const entries = sortedValidEntries(data.ppst);
  const activities = computeActivitySummaries(data.ppst);
  const gaps = computeGaps(entries, start, end);
  const slews = computeSlewSummaries(data.ppst);
  const stations = computeStationSummaries(data.ppst, downlinkRateMBps);
  const eclipseSegments = computeEclipseSegments(data, start, end);
  const constraints = computeConstraints(
    data,
    entries,
    earthKeepout.value,
    earthKeepout.configured,
    sunKeepout.value,
    sunKeepout.configured,
    sunKeepout.disabledInEclipse,
    sunKeepout.umbraOnly,
  );
  const constraintTelemetry = computeConstraintTelemetry(data, entries);
  const attitudeConsistency = computeAttitudeConsistency(
    data,
    entries,
    attitudeThresholdDeg,
    rollThresholdDeg,
  );
  const gspExecution = computeGspExecution(data, entries);
  const rawScheduledSec = data.ppst.reduce((total, entry) => total + entryDuration(entry), 0);
  const scheduledUnionSec = mergeWindowDuration(entries, start, end);
  const entrySlewSec = data.ppst.reduce(
    (total, entry) => total + Math.min(entryDuration(entry), numericField(entry.slewtime)),
    0,
  );
  const exposureSec = data.ppst.reduce((total, entry) => total + numericField(entry.exposure), 0);
  const gspSec = activities.find((row) => row.type === "GSP")?.durationSec ?? 0;
  const chargeSec = activities
    .filter((row) => isChargeType(row.type))
    .reduce((total, row) => total + row.durationSec, 0);
  const meta = data.meta;
  const branch = meta.coast_sim_branch;
  const head = meta.coast_sim_head;

  return {
    window: {
      start,
      end,
      durationSec: positiveDuration(start, end),
      beginUtc: meta.begin_utc,
      endUtc: meta.end_utc,
    },
    metadata: {
      mission: meta.mission,
      sourcePlan: meta.source_plan,
      tle: meta.tle,
      coastSim: branch || head ? [branch, head].filter(Boolean).join("@") : undefined,
    },
    totals: {
      entries: data.ppst.length,
      ephemSamples: utime.length,
      rawScheduledSec,
      scheduledUnionSec,
      idleSec: Math.max(0, positiveDuration(start, end) - scheduledUnionSec),
      exposureSec,
      entrySlewSec,
      explicitSlewSec: explicitSlewDuration(data.slews),
      gspSec,
      chargeSec,
      downlinkMB:
        downlinkRateMBps === null
          ? null
          : stations.reduce((total, station) => total + (station.downlinkMB ?? 0), 0),
    },
    downlinkRateMBps,
    constraints,
    constraintTelemetry,
    attitudeConsistency,
    gspExecution,
    orbitContext: computeOrbitContext(data, eclipseSegments),
    panelSunAngle: computePanelSunAngle(data),
    thermalGeometry: computeThermalGeometry(data),
    science: computeScienceSummary(data.ppst),
    timeline: computeTimeline(data, entries, gaps, start, end, eclipseSegments),
    slewDistribution: computeSlewDistribution(slews),
    gapCategories: computeGapCategories(gaps),
    activities,
    stations,
    gaps,
    slews,
    findings: [
      ...validationFindings(constraints, constraintTelemetry, attitudeConsistency),
      ...computeFindings(data, entries, start, end),
    ],
  };
}
