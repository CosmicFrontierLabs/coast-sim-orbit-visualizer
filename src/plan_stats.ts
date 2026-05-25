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
  sunMinAngleDeg: number | null;
  sunWorstTime: number | null;
  sunWorstEntry: string | null;
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
  attitudeConsistency: AttitudeConsistencySummary;
  gspExecution: GspExecutionSummary;
  orbitContext: OrbitContextSummary;
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

function computeConstraints(
  data: VizData,
  entries: WindowRef[],
  earthKeepoutDeg: number,
  earthKeepoutConfigured: boolean,
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
      sunMinAngleDeg: null,
      sunWorstTime: null,
      sunWorstEntry: null,
    };
  }

  let samples = 0;
  let earthMinMarginDeg: number | null = null;
  let earthWorstTime: number | null = null;
  let earthWorstEntry: string | null = null;
  let earthViolationSamples = 0;
  let earthPhysicalIntersectionSamples = 0;
  let earthKeepoutMinMarginDeg: number | null = null;
  let sunMinAngleDeg: number | null = null;
  let sunWorstTime: number | null = null;
  let sunWorstEntry: string | null = null;

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
      if (sunMinAngleDeg === null || sunAngle < sunMinAngleDeg) {
        sunMinAngleDeg = sunAngle;
        sunWorstTime = t;
        sunWorstEntry = activeLabel;
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
    sunMinAngleDeg,
    sunWorstTime,
    sunWorstEntry,
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
      if (t < checkWindow.begin || t > checkWindow.end) return;
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
        if (t < window.begin || t > window.end) return null;
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
  attitudeConsistency: AttitudeConsistencySummary,
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
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
  const entries = sortedValidEntries(data.ppst);
  const activities = computeActivitySummaries(data.ppst);
  const gaps = computeGaps(entries, start, end);
  const slews = computeSlewSummaries(data.ppst);
  const stations = computeStationSummaries(data.ppst, downlinkRateMBps);
  const eclipseSegments = computeEclipseSegments(data, start, end);
  const constraints = computeConstraints(data, entries, earthKeepout.value, earthKeepout.configured);
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
    attitudeConsistency,
    gspExecution,
    orbitContext: computeOrbitContext(data, eclipseSegments),
    science: computeScienceSummary(data.ppst),
    timeline: computeTimeline(data, entries, gaps, start, end, eclipseSegments),
    slewDistribution: computeSlewDistribution(slews),
    gapCategories: computeGapCategories(gaps),
    activities,
    stations,
    gaps,
    slews,
    findings: [
      ...validationFindings(constraints, attitudeConsistency),
      ...computeFindings(data, entries, start, end),
    ],
  };
}
