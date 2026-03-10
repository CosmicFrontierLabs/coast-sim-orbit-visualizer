import { DateTime } from "luxon";
import type { Attitude, PPSTEntry, SlewWindow } from "./types";

/**
 * Find the active PPST entry at time `t`.
 *
 * @param {number} t Unix timestamp (seconds).
 * @param {Array<{begin:number,end:number}>} ppst Sorted PPST windows.
 * @returns {object|null}
 */
export function activePPST(t: number, ppst: PPSTEntry[]): PPSTEntry | null {
  let lo = 0;
  let hi = ppst.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ppst[mid].end <= t) lo = mid + 1;
    else if (ppst[mid].begin > t) hi = mid - 1;
    else return ppst[mid];
  }
  return null;
}

/**
 * Find the active slew track at time `t`.
 *
 * @param {number} t Unix timestamp (seconds).
 * @param {Array<{begin:number,end:number}>} slews Slew windows.
 * @returns {object|null}
 */
export function activeSlew(t: number, slews: SlewWindow[]): SlewWindow | null {
  if (!slews || slews.length === 0) return null;
  for (let i = 0; i < slews.length; i++) {
    const s = slews[i];
    if (!s || !Number.isFinite(s.begin) || !Number.isFinite(s.end)) continue;
    if (t >= s.begin && t < s.end) return s;
  }
  return null;
}

/**
 * Wrap an angle in degrees to `[-180, 180)`.
 *
 * @param {number} x
 * @returns {number}
 */
export function wrapDeg180(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180;
}

/**
 * Interpolate shortest-path angular delta in degrees.
 *
 * @param {number} a0 Start angle in degrees.
 * @param {number} a1 End angle in degrees.
 * @param {number} f Interpolation factor in [0, 1].
 * @returns {number}
 */
export function lerpAngleDeg(a0: number, a1: number, f: number): number {
  const d = wrapDeg180(a1 - a0);
  return a0 + f * d;
}

/**
 * Interpolate RA/Dec/Roll along a slew track at time `t`.
 *
 * @param {{track:Array<{t:number,ra:number,dec:number,roll:number}>}} slew
 * @param {number} t Unix timestamp (seconds).
 * @returns {{ra:number,dec:number,roll:number}|null}
 */
export function interpSlewAtt(slew: SlewWindow, t: number): Attitude | null {
  const tr = slew.track;
  if (!tr || tr.length === 0) return null;
  if (t <= tr[0].t) return tr[0];
  if (t >= tr[tr.length - 1].t) return tr[tr.length - 1];

  let lo = 0;
  let hi = tr.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (tr[mid].t <= t) lo = mid;
    else hi = mid;
  }

  const a = tr[lo];
  const b = tr[hi];
  const dt = b.t - a.t;
  const f = dt > 0 ? (t - a.t) / dt : 0;
  return {
    ra: lerpAngleDeg(a.ra, b.ra, f),
    dec: a.dec + f * (b.dec - a.dec),
    roll: lerpAngleDeg(a.roll, b.roll, f),
  };
}

/**
 * Keep playback from skipping entirely over short slew windows in one frame.
 *
 * @param {number} tPrev Previous simulation time.
 * @param {number} tNext Proposed next simulation time.
 * @param {Array<{begin:number,end:number}>} slews Slew windows.
 * @returns {number}
 */
export function clampTimeAdvanceForSlews(tPrev: number, tNext: number, slews: SlewWindow[]): number {
  if (!slews || slews.length === 0 || tNext <= tPrev) return tNext;

  for (let i = 0; i < slews.length; i++) {
    const s = slews[i];
    if (!s || !Number.isFinite(s.begin) || !Number.isFinite(s.end)) continue;
    if (s.end <= tPrev) continue;
    if (s.begin > tNext) break;
    if (tPrev < s.begin && tNext >= s.end) return s.begin + 1e-3;
  }
  return tNext;
}

/**
 * Format Unix time as `YYYY/DDD hh:mm:ss UTC`.
 *
 * @param {number} unix Unix timestamp (seconds).
 * @returns {string}
 */
export function fmtTime(unix: number): string {
  const d = DateTime.fromSeconds(unix, { zone: "utc" });
  return `${d.year}/${String(d.ordinal).padStart(3, "0")} ${d.toFormat("HH:mm:ss")} UTC`;
}
