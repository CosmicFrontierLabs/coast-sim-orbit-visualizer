import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePanelSunAngle, computeThermalGeometry } from "./plan_stats";
import type { EciVec, VizData } from "./types";

function vizData({
  times,
  sunvec,
  quaternions,
  direction = [0, 0, -1],
  modes,
  positions,
  eclipses,
}: {
  times: number[];
  sunvec: EciVec[];
  quaternions: Array<[number, number, number, number]>;
  direction?: EciVec | null;
  modes?: string[];
  positions?: EciVec[];
  eclipses?: number[];
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
      posvec: positions ?? times.map(() => [7000, 0, 0]),
      sunvec,
      ramvec: times.map(() => [0, 1, 0]),
      polevec: times.map(() => [0, 0, 1]),
      ineclipse: eclipses ?? zeros,
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

function earthViewFactorAtCenterAngle(angleDeg: number, surfaceName: string): number {
  const angleRad = (angleDeg * Math.PI) / 180;
  const position: EciVec = [
    -7000 * Math.cos(angleRad),
    -7000 * Math.sin(angleRad),
    0,
  ];
  const identity: [number, number, number, number] = [1, 0, 0, 0];
  const result = computeThermalGeometry(
    vizData({
      times: [0, 60],
      sunvec: [
        [0, 0, 1],
        [0, 0, 1],
      ],
      positions: [position, position],
      quaternions: [identity, identity],
    }),
  );
  const surface = result.surfaces.find((candidate) => candidate.name === surfaceName);
  assert.ok(surface, `missing ${surfaceName} surface`);
  return surface.meanEarthViewFactor;
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

  it("maps front-side sunlight onto the panel face", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60],
        sunvec: [
          [0, 1, 0],
          [0, 1, 0],
        ],
        quaternions: [identity, identity],
      }),
    );

    assert.deepEqual(result.panelBasisUSc, [1, 0, 0]);
    assert.deepEqual(result.panelBasisVSc, [0, 1, 0]);
    const bin = result.frontFaceBins.find(
      (candidate) => candidate.uMin <= 0 && candidate.uMax > 0 && candidate.vMax === 1,
    );
    assert.equal(bin?.sunlitDurationSec, 60);
    assert.ok((bin?.equivalentSunSec ?? Infinity) < 1e-10);
    assert.equal(result.backsideSunlitSec, 0);
  });

  it("reports sunlit time behind the panel separately", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60],
        sunvec: [
          [0, 0, 1],
          [0, 0, 1],
        ],
        quaternions: [identity, identity],
      }),
    );

    assert.equal(result.backsideSunlitSec, 60);
    assert.equal(
      result.frontFaceBins.reduce((total, candidate) => total + candidate.sunlitDurationSec, 0),
      0,
    );
  });

  it("excludes eclipse intervals from all panel-illumination summaries", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computePanelSunAngle(
      vizData({
        times: [0, 60, 120],
        sunvec: [
          [0, 0, -1],
          [0, 0, 1],
          [0, 0, 1],
        ],
        quaternions: [identity, identity, identity],
        eclipses: [1, 0, 0],
      }),
    );

    assert.equal(result.samples, 1);
    assert.equal(result.durationSec, 60);
    assert.equal(result.meanDeg, 180);
    assert.equal(result.backsideSunlitSec, 60);
    assert.equal(
      result.frontFaceBins.reduce((total, candidate) => total + candidate.sunlitDurationSec, 0),
      0,
    );
  });
});

describe("computeThermalGeometry", () => {
  it("reports body-frame source directions and surface view factors", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computeThermalGeometry(
      vizData({
        times: [0, 60],
        sunvec: [
          [1, 0, 0],
          [1, 0, 0],
        ],
        quaternions: [identity, identity],
      }),
    );

    assert.equal(result.available, true);
    assert.deepEqual(result.samples[0].sunBody, [1, 0, 0]);
    assert.deepEqual(result.samples[0].earthBody, [-1, 0, 0]);
    const plusX = result.surfaces.find((surface) => surface.name === "+X");
    const minusX = result.surfaces.find((surface) => surface.name === "-X");
    assert.equal(plusX?.directSunEquivalentSec, 60);
    assert.equal(plusX?.meanEarthViewFactor, 0);
    assert.ok(Math.abs((minusX?.meanEarthViewFactor ?? 0) - (6371 / 7000) ** 2) < 1e-12);
    assert.ok(Math.abs((minusX?.meanDeepSpaceViewFactor ?? 0) - (1 - (6371 / 7000) ** 2)) < 1e-12);
    assert.equal(result.sunDwellBins[0].face, "+X");
    assert.equal(result.earthDwellBins[0].face, "-X");
    assert.equal(result.surfaces.length, 6);
    assert.equal(result.surfaces.at(-1)?.name, "-Z / solar panel");
  });

  it("excludes eclipse intervals from direct-Sun exposure and Sun dwell", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computeThermalGeometry(
      vizData({
        times: [0, 60],
        sunvec: [
          [1, 0, 0],
          [1, 0, 0],
        ],
        quaternions: [identity, identity],
        eclipses: [1, 0],
      }),
    );

    assert.equal(result.sunlitSec, 0);
    assert.equal(result.eclipseSec, 60);
    assert.equal(result.sunDwellBins.length, 0);
    assert.ok(result.surfaces.every((surface) => surface.directSunEquivalentSec === 0));
  });

  it("integrates a horizon-centered Earth disk symmetrically", () => {
    const angularRadiusRad = Math.asin(6371 / 7000);
    const expected =
      (angularRadiusRad - Math.sin(angularRadiusRad) * Math.cos(angularRadiusRad)) / Math.PI;
    const plusX = earthViewFactorAtCenterAngle(90, "+X");
    const minusX = earthViewFactorAtCenterAngle(90, "-X");

    assert.ok(Math.abs(plusX - expected) < 1e-9);
    assert.ok(Math.abs(minusX - expected) < 1e-9);
    assert.ok(Math.abs(plusX - minusX) < 1e-12);
  });

  it("is continuous across full, partial, and hidden Earth-disk boundaries", () => {
    const angularRadiusDeg = (Math.asin(6371 / 7000) * 180) / Math.PI;
    const fullBoundaryDeg = 90 - angularRadiusDeg;
    const hiddenBoundaryDeg = 90 + angularRadiusDeg;
    const deltaDeg = 0.1;

    const fullSide = earthViewFactorAtCenterAngle(fullBoundaryDeg - deltaDeg, "+X");
    const partialSide = earthViewFactorAtCenterAngle(fullBoundaryDeg + deltaDeg, "+X");
    assert.ok(Math.abs(fullSide - partialSide) < 0.002);

    const visibleSliver = earthViewFactorAtCenterAngle(hiddenBoundaryDeg - deltaDeg, "+X");
    const hiddenBoundary = earthViewFactorAtCenterAngle(hiddenBoundaryDeg, "+X");
    const hiddenSide = earthViewFactorAtCenterAngle(hiddenBoundaryDeg + deltaDeg, "+X");
    assert.ok(visibleSliver > 0);
    assert.ok(visibleSliver < 1e-6);
    assert.equal(hiddenBoundary, 0);
    assert.equal(hiddenSide, 0);
    assert.equal(earthViewFactorAtCenterAngle(180, "+X"), 0);
  });

  it("does not join direct-Sun dwell across an intervening cold interval", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const result = computeThermalGeometry(
      vizData({
        times: [0, 60, 180, 240],
        sunvec: [
          [1, 0, 0],
          [-1, 0, 0],
          [1, 0, 0],
          [1, 0, 0],
        ],
        quaternions: [identity, identity, identity, identity],
      }),
    );

    const plusX = result.surfaces.find((surface) => surface.name === "+X");
    assert.equal(plusX?.sunAbove10PercentSec, 120);
    assert.equal(plusX?.longestAbove10PercentSec, 60);
  });

  it("separates projected Sun exposure into load thresholds", () => {
    const identity: [number, number, number, number] = [1, 0, 0, 0];
    const yAt = (x: number): number => Math.sqrt(1 - x * x);
    const result = computeThermalGeometry(
      vizData({
        times: [0, 60, 120, 180],
        sunvec: [
          [0.05, yAt(0.05), 0],
          [0.25, yAt(0.25), 0],
          [0.75, yAt(0.75), 0],
          [1, 0, 0],
        ],
        quaternions: [identity, identity, identity, identity],
      }),
    );

    const plusX = result.surfaces.find((surface) => surface.name === "+X");
    assert.equal(plusX?.sunAbove10PercentSec, 120);
    assert.equal(plusX?.sunAbove50PercentSec, 60);
    assert.equal(plusX?.sunAbove90PercentSec, 0);
    assert.equal(plusX?.longestAbove10PercentSec, 120);
  });
});
