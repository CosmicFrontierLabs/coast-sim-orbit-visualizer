import { clampTimeAdvanceForSlews } from "./timeline_utils";
import type { SlewWindow, TimeStepResult } from "./types";

/**
 * Advance simulation time by wall-clock delta and playback speed.
 *
 * @param {Object} deps
 * @param {number} deps.simTime Current simulation time.
 * @param {number} deps.ts Current frame timestamp from `requestAnimationFrame`.
 * @param {number|null} deps.prevTs Previous frame timestamp.
 * @param {boolean} deps.playing Whether playback is active.
 * @param {number} deps.speedIdx Index into `speeds`.
 * @param {number[]} deps.speeds Speed multipliers.
 * @param {Array<{begin:number,end:number}>} deps.slews Slew windows.
 * @param {number[]} deps.utime Ephemeris time axis.
 * @returns {{simTime:number, prevTs:number}}
 */
export function stepSimTime({
  simTime,
  ts,
  prevTs,
  playing,
  speedIdx,
  speeds,
  slews,
  utime,
}: {
  simTime: number;
  ts: number;
  prevTs: number | null;
  playing: boolean;
  speedIdx: number;
  speeds: number[];
  slews: SlewWindow[];
  utime: number[];
}): TimeStepResult {
  if (!playing) {
    return {
      simTime,
      prevTs: ts,
    };
  }

  const dt = prevTs === null ? 0 : (ts - prevTs) * 0.001;
  const proposed = simTime + dt * speeds[speedIdx];
  let nextSimTime = clampTimeAdvanceForSlews(simTime, proposed, slews || []);

  const tMax = utime[utime.length - 1];
  if (nextSimTime > tMax) {
    nextSimTime = utime[0];
  }

  return {
    simTime: nextSimTime,
    prevTs: ts,
  };
}
