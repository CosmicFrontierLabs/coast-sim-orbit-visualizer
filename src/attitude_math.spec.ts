import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { buildAttitudeQ, renderedRollDeg, wrap180 } from "./attitude_math";

const assertVectorClose = (actual: THREE.Vector3, expected: THREE.Vector3): void => {
  assert.ok(actual.distanceTo(expected) < 1e-12, `${actual.toArray()} != ${expected.toArray()}`);
};

test("positive roll is right-handed about spacecraft +X", () => {
  const attitudeQ = buildAttitudeQ(0, 0, 90);

  assertVectorClose(
    new THREE.Vector3(0, 1, 0).applyQuaternion(attitudeQ),
    new THREE.Vector3(0, 0, 1),
  );
  assertVectorClose(
    new THREE.Vector3(0, 0, 1).applyQuaternion(attitudeQ),
    new THREE.Vector3(0, -1, 0),
  );
  assert.ok(Math.abs(renderedRollDeg(attitudeQ, 0, 0) - 90) < 1e-12);
});

test("RA/Dec/roll fallback round-trips through the rendered attitude", () => {
  for (const [ra, dec, roll] of [
    [15, -30, -170],
    [120, 45, -90],
    [275, 10, 45],
    [340, -60, 170],
    [45, 90, 30],
    [120, -90, 275],
  ]) {
    const actual = renderedRollDeg(buildAttitudeQ(ra, dec, roll), ra, dec);
    assert.ok(Math.abs(wrap180(actual - roll)) < 1e-10, `${actual} != ${roll}`);
  }
});

test("pole attitude uses COAST's RA-dependent Euler continuation", () => {
  const attitudeQ = buildAttitudeQ(45, 90, 30);

  assertVectorClose(
    new THREE.Vector3(0, 1, 0).applyQuaternion(attitudeQ),
    new THREE.Vector3(-0.9659258262890683, 0.2588190451025209, 0),
  );
  assertVectorClose(
    new THREE.Vector3(0, 0, 1).applyQuaternion(attitudeQ),
    new THREE.Vector3(-0.2588190451025209, -0.9659258262890683, 0),
  );
});

test("attitude remains continuous approaching either celestial pole", () => {
  for (const [ra, poleDec, roll] of [
    [45, 90, 30],
    [120, -90, 275],
  ]) {
    const atPole = buildAttitudeQ(ra, poleDec, roll);
    const nearPole = buildAttitudeQ(ra, poleDec - Math.sign(poleDec) * 0.001, roll);
    const distanceDeg = (2 * Math.acos(Math.min(1, Math.abs(atPole.dot(nearPole))))) / (Math.PI / 180);
    assert.ok(distanceDeg < 0.002, `${distanceDeg} deg discontinuity at Dec=${poleDec}`);
  }
});
