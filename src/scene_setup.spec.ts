import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

// Scene constants read the page's optional asset base when imported.
Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
const { SC_AXIS_SHAFT_LEN, SC_HEAD_LEN } = await import("./constants");
const { makeVector } = await import("./scene_setup");
Reflect.deleteProperty(globalThis, "window");

test("body vectors retain solid shafts and their original length", () => {
  const [shaft, head] = makeVector(0x4488ff, SC_AXIS_SHAFT_LEN).children;
  assert.ok(shaft instanceof THREE.Line);
  assert.ok(shaft.material instanceof THREE.LineBasicMaterial);
  assert.ok(!(shaft.material instanceof THREE.LineDashedMaterial));
  assert.equal(shaft.material.color.getHex(), 0x4488ff);
  assert.equal(head.position.y, SC_AXIS_SHAFT_LEN + SC_HEAD_LEN * 0.5);
});

test("dashed panel vector has gaps and an arrowhead beyond a coincident body axis", () => {
  const length = SC_AXIS_SHAFT_LEN * 1.5;
  const [shaft, head] = makeVector(0xffee00, length, true).children;
  assert.ok(shaft instanceof THREE.Line);
  assert.ok(shaft.material instanceof THREE.LineDashedMaterial);
  assert.ok(shaft.material.dashSize > 0);
  assert.ok(shaft.material.gapSize > 0);
  const distances = shaft.geometry.getAttribute("lineDistance");
  assert.equal(distances.getX(0), 0);
  assert.ok(Math.abs(distances.getX(1) - length) < length * 1e-6);
  assert.ok(head.position.y - SC_HEAD_LEN * 0.5 > SC_AXIS_SHAFT_LEN + SC_HEAD_LEN);
});
