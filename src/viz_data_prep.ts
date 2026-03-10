import type { SlewWindow, VizData } from "./types";

/**
 * Sanitize and sort slew records from the visualization payload.
 *
 * @param {Object} json
 * @returns {Array<Object>}
 */
export function buildCleanSlews(json: VizData): SlewWindow[] {
  return (json.slews || [])
    .filter(
      (s) =>
        s &&
        Number.isFinite(s.begin) &&
        Number.isFinite(s.end) &&
        s.end > s.begin &&
        Array.isArray(s.track) &&
        s.track.length >= 2,
    )
    .map((s) => ({
      ...s,
      track: s.track
        .filter(
          (p) =>
            p &&
            Number.isFinite(p.t) &&
            Number.isFinite(p.ra) &&
            Number.isFinite(p.dec) &&
            Number.isFinite(p.roll),
        )
        .sort((a, b) => a.t - b.t),
    }))
    .filter((s) => s.track.length >= 2)
    .sort((a, b) => a.begin - b.begin);
}
