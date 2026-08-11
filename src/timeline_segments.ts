import type {
  PPSTEntry,
  SlewWindow,
  TimelineGapBoundary,
  TimelineSegment,
  TimelineSegmentKind,
  TimelineSegmentLane,
  VizData,
} from "./types";
import { fmtTime, ppstDisplayName, ppstTitle, ppstTrackingSummary } from "./timeline_utils";

function isFiniteWindow(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function secondsDuration(start: number, end: number): number {
  return Math.max(0, Math.round(end - start));
}

export function formatDuration(start: number, end: number): string {
  const total = secondsDuration(start, end);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function segmentKindForEntry(entry: PPSTEntry): TimelineSegmentKind {
  return (entry.obstype ?? "").toUpperCase() === "GSP" ? "gsp" : "entry";
}

function entrySegment(entry: PPSTEntry, entryIndex: number): TimelineSegment | null {
  if (!isFiniteWindow(entry.begin, entry.end)) return null;

  const kind = segmentKindForEntry(entry);
  const label = ppstDisplayName(entry);
  const titleParts = [
    `${kind === "gsp" ? "GSP" : entry.obstype ?? "ENTRY"} ${label}`,
    `${fmtTime(entry.begin)} to ${fmtTime(entry.end)}`,
    `duration ${formatDuration(entry.begin, entry.end)}`,
  ];
  const tracking = ppstTrackingSummary(entry);
  if (tracking) titleParts.push(tracking);

  return {
    id: `${kind}:${entryIndex}`,
    kind,
    lane: "activity",
    start: entry.begin,
    end: entry.end,
    focusTime: entry.begin,
    label,
    title: titleParts.join("\n"),
    entryIndex,
    entry,
  };
}

function gapSegment(
  start: number,
  end: number,
  gapIndex: number,
  gapBoundary: TimelineGapBoundary,
  prevEntryIndex?: number,
  nextEntryIndex?: number,
): TimelineSegment | null {
  if (!isFiniteWindow(start, end)) return null;
  const labelByBoundary: Record<TimelineGapBoundary, string> = {
    leading: "Initial gap",
    between: "Gap",
    trailing: "End gap",
  };
  const label = labelByBoundary[gapBoundary];
  return {
    id: `gap:${gapIndex}`,
    kind: "gap",
    lane: "gap",
    start,
    end,
    focusTime: start + (end - start) / 2,
    label,
    title: `${label.toUpperCase()}\n${fmtTime(start)} to ${fmtTime(end)}\nduration ${formatDuration(start, end)}`,
    gapBoundary,
    prevEntryIndex,
    nextEntryIndex,
  };
}

function slewSegment(entry: PPSTEntry, entryIndex: number): TimelineSegment | null {
  const slewtime = entry.slewtime ?? 0;
  if (!Number.isFinite(slewtime) || slewtime <= 0) return null;
  const start = entry.begin;
  const end = Math.min(entry.end, entry.begin + slewtime);
  if (!isFiniteWindow(start, end)) return null;
  const label = `Slew to ${ppstDisplayName(entry)}`;
  const details = [`SLEW`, label, `${fmtTime(start)} to ${fmtTime(end)}`, `duration ${formatDuration(start, end)}`];
  if (Number.isFinite(entry.slewdist)) details.push(`distance ${entry.slewdist?.toFixed(2)} deg`);
  return {
    id: `slew:${entryIndex}`,
    kind: "slew",
    lane: "slew",
    start,
    end,
    focusTime: start,
    label,
    title: details.join("\n"),
    entryIndex,
    entry,
  };
}

function explicitSlewSegment(slew: SlewWindow, slewIndex: number): TimelineSegment | null {
  if (!isFiniteWindow(slew.begin, slew.end)) return null;
  const label = slew.to ? `Slew to ${slew.to}` : "Slew";
  return {
    id: `slew-track:${slewIndex}`,
    kind: "slew",
    lane: "slew",
    start: slew.begin,
    end: slew.end,
    focusTime: slew.begin,
    label,
    title: `SLEW\n${label}\n${fmtTime(slew.begin)} to ${fmtTime(slew.end)}\nduration ${formatDuration(slew.begin, slew.end)}`,
    slewIndex,
    slew,
  };
}

export function buildTimelineSegments(data: VizData & { slews?: SlewWindow[] }): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const entries = data.ppst
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => isFiniteWindow(entry.begin, entry.end))
    .sort((a, b) => a.entry.begin - b.entry.begin);

  const t0 = data.ephem.utime[0];
  const t1 = data.ephem.utime[data.ephem.utime.length - 1];
  let gapIndex = 0;

  if (entries.length > 0) {
    const first = entries[0];
    const leadingGap = gapSegment(
      t0,
      first.entry.begin,
      gapIndex,
      "leading",
      undefined,
      first.entryIndex,
    );
    if (leadingGap) {
      segments.push(leadingGap);
      gapIndex += 1;
    }
  }

  entries.forEach(({ entry, entryIndex }, sortedIndex) => {
    const seg = entrySegment(entry, entryIndex);
    if (seg) segments.push(seg);

    const slew = slewSegment(entry, entryIndex);
    if (slew) segments.push(slew);

    const next = entries[sortedIndex + 1];
    if (next) {
      const gap = gapSegment(entry.end, next.entry.begin, gapIndex, "between", entryIndex, next.entryIndex);
      if (gap) {
        segments.push(gap);
        gapIndex += 1;
      }
    } else {
      const trailingGap = gapSegment(entry.end, t1, gapIndex, "trailing", entryIndex, undefined);
      if (trailingGap) segments.push(trailingGap);
    }
  });

  (data.slews ?? []).forEach((slew, slewIndex) => {
    const seg = explicitSlewSegment(slew, slewIndex);
    if (seg) segments.push(seg);
  });

  return segments.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const order: Record<TimelineSegmentKind, number> = {
      slew: 0,
      gsp: 1,
      entry: 2,
      gap: 3,
    };
    return order[a.kind] - order[b.kind];
  });
}

export function findTimelineSegmentById(
  segments: TimelineSegment[],
  id: string | null,
): TimelineSegment | null {
  if (!id) return null;
  return segments.find((segment) => segment.id === id) ?? null;
}

export function findTimelineSegmentAtTime(
  segments: TimelineSegment[],
  t: number,
  lane?: TimelineSegmentLane,
): TimelineSegment | null {
  const matches = segments.filter(
    (segment) => t >= segment.start && t < segment.end && (!lane || segment.lane === lane),
  );
  if (matches.length === 0) return null;
  const priority: Record<TimelineSegmentKind, number> = {
    slew: 0,
    gsp: 1,
    entry: 2,
    gap: 3,
  };
  matches.sort((a, b) => {
    const p = priority[a.kind] - priority[b.kind];
    if (p !== 0) return p;
    return a.end - a.start - (b.end - b.start);
  });
  return matches[0];
}

export function segmentDetail(segment: TimelineSegment, data?: VizData): string {
  const lines = [
    `${fmtTime(segment.start)} to ${fmtTime(segment.end)}`,
    `duration ${formatDuration(segment.start, segment.end)}`,
  ];

  if (segment.kind === "gap") {
    const prev = segment.prevEntryIndex !== undefined ? data?.ppst[segment.prevEntryIndex] : undefined;
    const next = segment.nextEntryIndex !== undefined ? data?.ppst[segment.nextEntryIndex] : undefined;
    if (prev) lines.push(`after ${prev.obstype ?? "ENTRY"} ${ppstDisplayName(prev)}`);
    if (next) lines.push(`before ${next.obstype ?? "ENTRY"} ${ppstDisplayName(next)}`);
    if (segment.gapBoundary === "leading") lines.push("before first plan entry");
    if (segment.gapBoundary === "trailing") lines.push("after final plan entry");
  }

  if (segment.entry) {
    if (segment.entry.station) lines.push(`station ${segment.entry.station}`);
    if (segment.entry.contact_begin !== undefined && segment.entry.contact_end !== undefined) {
      lines.push(`contact ${fmtTime(segment.entry.contact_begin)} to ${fmtTime(segment.entry.contact_end)}`);
    }
    if (
      Number.isFinite(segment.entry.slewtime) &&
      (segment.kind === "slew" || (segment.entry.slewtime ?? 0) > 0)
    ) {
      lines.push(`slew ${segment.entry.slewtime}s`);
    }
    if (
      Number.isFinite(segment.entry.slewdist) &&
      (segment.kind === "slew" || (segment.entry.slewdist ?? 0) > 0)
    ) {
      lines.push(`slew distance ${segment.entry.slewdist?.toFixed(2)} deg`);
    }
    const tracking = ppstTrackingSummary(segment.entry);
    if (tracking) lines.push(tracking);
  }

  return lines.join("\n");
}
