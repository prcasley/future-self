import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ghostSlots,
  ghostTransform,
  mirrorScale,
} from "../src/ghost/layout.ts";

test("reflection defaults to mirrored and switches without changing vertical orientation", () => {
  assert.equal(mirrorScale(), -1);
  assert.equal(mirrorScale(true), -1);
  assert.equal(mirrorScale(false), 1);
  const point = { x: 0.3, y: -0.8 };
  const reflected = { x: point.x * mirrorScale(), y: point.y };
  assert.deepEqual(reflected, { x: -0.3, y: -0.8 });
  assert.equal(reflected.x * mirrorScale(), point.x);
});
test("single projection is centered and upright", () => {
  assert.deepEqual(ghostSlots("single"), [
    { name: "centre", x: 50, y: 50, rotation: 0 },
  ]);
});
test("pyramid has four symmetric outward facing portraits and a clear centre", () => {
  const slots = ghostSlots("pyramid");
  assert.deepEqual(
    slots.map((s) => s.name),
    ["top", "right", "bottom", "left"],
  );
  assert.equal(new Set(slots.map((s) => `${s.x},${s.y}`)).size, 4);
  for (const s of slots) {
    assert.equal(Math.hypot(s.x - 50, s.y - 50), 31);
    const angle = (s.rotation * Math.PI) / 180;
    // Upright head vector (0,-1), rotated clockwise in screen coordinates.
    const head = [Math.sin(angle), -Math.cos(angle)];
    assert.ok(Math.abs(head[0] - (s.x - 50) / 31) < 1e-10);
    assert.ok(Math.abs(head[1] - (s.y - 50) / 31) < 1e-10);
  }
});
test("each pyramid face mirrors in its own coordinates before rotation", () => {
  for (const { rotation } of ghostSlots("pyramid")) {
    assert.equal(
      ghostTransform(rotation),
      `translate(-50%, -50%) rotate(${rotation}deg) scaleX(-1)`,
    );
    assert.equal(
      ghostTransform(rotation, false),
      `translate(-50%, -50%) rotate(${rotation}deg) scaleX(1)`,
    );
  }
});
