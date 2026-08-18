import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePanelSunAngle } from "./plan_stats";
import type { EciVec, VizData } from "./types";

function vizData({
  times,
  sunvec,
  quaternions,
  direction = [0, 0, -1],
  modes,
}: {
  times: number[];
  sunvec: EciVec[];
  quaternions: Array<[number, number, number, number]>;
  direction?: EciVec | null;
  modes?: string[];
}): VizData {
  const zeros = times.map(() => 0);
  return {
    meta: {
      n_ephem: times.length,
      n_ppst: 0,
      solar_panel: direction ? { gimbled: false, direction_sc: direction } : undefined,
    },
    ephem: {
      utime: times,
      posvec: times.map(() => [7000, 0, 0]),
      sunvec,
      ramvec: times.map(() => [0, 1, 0]),
      polevec: times.map(() => [0, 0, 1]),
      ineclipse: zeros,
      lat: zeros,
      lon: zeros,
      beta: zeros,
      quat_w: quaternions.map((q) => q[0]),
      quat_x: quaternions.map((q) => q[1]),
      quat_y: quaternions.map((q) => q[2]),
      quat_z: quaternions.map((q) => q[3]),
      acs_mode: modes,
    },
    ppst: [],
    slews: [],
  };
}

describe("computePanelSunAngle", () => {
  it("weights each boundary sample by the following interval duration", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60, 180],
        sunvec: [
          [0, 0, -1],
          [0, 0, 1],
          [0, 0, -1],
        ],
        quaternions: [identity, identity, identity],
      }),
    );

    assert.equal(result.available, true);
    assert.equal(result.samples, 2);
    assert.equal(result.durationSec, 180);
    assert.ok(Math.abs((result.meanDeg ?? 0) - 120) < 1e-10);
    assert.ok(Math.abs((result.medianDeg ?? 0) - 180) < 1e-10);
    assert.equal(result.within45Sec, 60);
    assert.equal(result.within90Sec, 60);
    assert.equal(result.bins[0].durationSecByMode.IDLE, 60);
    assert.equal(result.bins.at(-1)?.durationSecByMode.IDLE, 120);
  });

  it("applies the declared inertial-to-body quaternion without conjugating it", () => {
    const halfAngle = Math.PI / 4;
    const plus90AboutY: [number, number, number, number] = [Math.cos(halfAngle), 0, Math.sin(halfAngle), 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60],
        sunvec: [
          [1, 0, 0],
          [1, 0, 0],
        ],
        quaternions: [plus90AboutY, plus90AboutY],
      }),
    );

    assert.equal(result.available, true);
    assert.ok((result.maxDeg ?? Infinity) < 1e-10);
  });

  it("groups charging telemetry under the charging mode", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60],
        sunvec: [
          [0, 0, -1],
          [0, 0, -1],
        ],
        quaternions: [identity, identity],
        modes: ["CHARGING", "IDLE"],
      }),
    );

    assert.deepEqual(result.modes, ["CHARGING"]);
    assert.equal(result.bins[0].durationSecByMode.CHARGING, 60);
  });

  it("reports missing panel metadata instead of assuming an orientation", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60],
        sunvec: [
          [0, 0, -1],
          [0, 0, -1],
        ],
        quaternions: [identity, identity],
        direction: null,
      }),
    );

    assert.equal(result.available, false);
    assert.match(result.unavailableReason ?? "", /panel direction/);
  });
});
