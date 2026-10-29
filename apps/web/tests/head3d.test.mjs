import { test } from "node:test";
import assert from "node:assert/strict";
import { FACE, pointInPolygon } from "../src/living/geometry.ts";
import {
  PYRAMID_VIEWS,
  buildHead,
  poseFace,
  shapeSkull,
} from "../src/ghost/head3d.ts";
import { ghostSlots } from "../src/ghost/layout.ts";
import { W, H, face } from "./face-fixture.mjs";

const head = buildHead(face(), W, H);
const y = (p, i) => p[i * 3 + 1];

test("pyramid shows front, both sides and the back, one per slot", () => {
  assert.equal(PYRAMID_VIEWS.length, ghostSlots("pyramid").length);
  const bySlot = Object.fromEntries(
    ghostSlots("pyramid").map((s, i) => [s.name, PYRAMID_VIEWS[i]]),
  );
  assert.deepEqual(bySlot, { bottom: 0, right: 90, top: 180, left: -90 });
});

test("the head is built in face-width units with the nose in front", () => {
  assert.ok(head);
  const p = head.positions;
  const width = Math.abs(p[FACE.faceLeft * 3] - p[FACE.faceRight * 3]);
  assert.ok(Math.abs(width - 1) < 0.02, `face width ${width}`);
  assert.ok(p[FACE.noseTip * 3 + 2] > p[FACE.faceLeft * 3 + 2]);
  assert.ok(y(p, FACE.forehead) > y(p, FACE.chin));
  assert.ok(head.index.length > 300 * 3);
});

test("no triangle closes the mouth", () => {
  const p = head.positions;
  const lips = [
    ...FACE.upperInnerLip.map((i) => [p[i * 3], y(p, i)]),
    ...[...FACE.lowerInnerLip].reverse().map((i) => [p[i * 3], y(p, i)]),
  ];
  for (let t = 0; t < head.index.length; t += 3) {
    const [a, b, c] = head.index.slice(t, t + 3);
    const gx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3;
    const gy = (y(p, a) + y(p, b) + y(p, c)) / 3;
    assert.equal(pointInPolygon(gx, gy, lips), false);
  }
});

test("the jaw drops the lower lip and chin but not the upper lip", () => {
  const open = poseFace(head, 1, 0);
  const rest = head.positions;
  assert.ok(y(open, FACE.lipLower) < y(rest, FACE.lipLower) - 0.05);
  assert.ok(y(open, FACE.chin) < y(rest, FACE.chin) - 0.05);
  assert.equal(y(open, FACE.lipUpper), y(rest, FACE.lipUpper));
  assert.equal(y(open, FACE.forehead), y(rest, FACE.forehead));
  assert.deepEqual(poseFace(head, 0, 0), rest);
});

test("a blink brings the upper lids down to the lower lids", () => {
  const shut = poseFace(head, 0, 1);
  for (const eye of [FACE.rightEye, FACE.leftEye]) {
    const lower =
      eye.lower.reduce((s, i) => s + y(head.positions, i), 0) /
      eye.lower.length;
    for (const i of eye.upper) assert.ok(Math.abs(y(shut, i) - lower) < 1e-6);
  }
});

test("the head shape stays behind the face and is hair on the crown and back", () => {
  const p = head.positions;
  const nose = shapeSkull(
    head,
    p[FACE.noseTip * 3],
    y(p, FACE.noseTip),
    5,
    true,
  );
  assert.ok(nose.z < p[FACE.noseTip * 3 + 2]);
  assert.ok(shapeSkull(head, 0, head.skull.ry * 0.95, 0, false).skin < 0.05);
  assert.ok(shapeSkull(head, 0, 0, -0.6, false).skin < 0.05);
  assert.ok(shapeSkull(head, 0.5, head.chin, 0.1, false).skin > 0.95);
});

test("too few landmarks or a tiny face cannot be rigged", () => {
  assert.equal(buildHead([], W, H), null);
  assert.equal(buildHead(face(), 4, 4), null);
});
