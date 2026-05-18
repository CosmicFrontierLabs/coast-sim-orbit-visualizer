import type { TimelineSegment, TimelineSelection } from "./types";
import { findTimelineSegmentById } from "./timeline_segments";

function finiteNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clampTime(t: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, t));
}

export function selectionFromSegment(segment: TimelineSegment): TimelineSelection {
  return {
    id: segment.id,
    kind: segment.kind,
    start: segment.start,
    end: segment.end,
    focusTime: segment.focusTime,
  };
}

export function readTimelineUrlState(
  segments: TimelineSegment[],
  utime: number[],
): { selection: TimelineSelection | null; time: number | null } {
  if (utime.length === 0) return { selection: null, time: null };
  const params = new URLSearchParams(window.location.search);
  const segment = findTimelineSegmentById(segments, params.get("sel"));
  const requestedTime = finiteNumber(params.get("t"));
  const start = utime[0];
  const end = utime[utime.length - 1];
  return {
    selection: segment ? selectionFromSegment(segment) : null,
    time: requestedTime === null ? null : clampTime(requestedTime, start, end),
  };
}

export function writeTimelineUrlState(selection: TimelineSelection | null, time: number): void {
  const url = new URL(window.location.href);
  if (Number.isFinite(time)) {
    url.searchParams.set("t", time.toFixed(3).replace(/\.?0+$/, ""));
  }
  if (selection) {
    url.searchParams.set("sel", selection.id);
  } else {
    url.searchParams.delete("sel");
  }
  window.history.replaceState(null, "", url);
}
