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

import {
  DEFAULT_GHOST_CONFIG,
  normalizeGhostConfig,
} from "../src/ghost/config.ts";

test("one serializable config covers all display calibration without image data", () => {
  assert.deepEqual(
    normalizeGhostConfig(JSON.parse(JSON.stringify(DEFAULT_GHOST_CONFIG))),
    DEFAULT_GHOST_CONFIG,
  );
  assert.equal(DEFAULT_GHOST_CONFIG.mirrored, true);
  assert.equal(DEFAULT_GHOST_CONFIG.follow, false);
  assert.equal(DEFAULT_GHOST_CONFIG.keepAwake, true);
  const normalized = normalizeGhostConfig({
    size: Infinity,
    vertical: -999,
    brightness: 100,
    contrast: NaN,
    layout: "unknown",
    mirrored: "false",
    imageUrl: "private-photo",
    rim: -1,
    feather: 100,
  });
  assert.equal(normalized.size, 100);
  assert.equal(normalized.vertical, -30);
  assert.equal(normalized.brightness, 1.8);
  assert.equal(normalized.contrast, 1.16);
  assert.equal(normalized.layout, "single");
  assert.equal(normalized.mirrored, true);
  assert.equal(normalized.rim, 0);
  assert.equal(normalized.feather, 85);
  assert.equal("imageUrl" in normalized, false);
});

test("the live glow follows real state: Reneė's loudness, a thinking breath, steady listening", async () => {
  const { liveGlow } = await import("../src/ghost/layout.ts");
  assert.equal(liveGlow("idle", 1, 0), 0);
  assert.equal(liveGlow("listening", 1, 5), 0.12);
  assert.ok(liveGlow("speaking", 1, 0) > liveGlow("speaking", 0.2, 0));
  assert.equal(liveGlow("speaking", 7, 0), liveGlow("speaking", 1, 0)); // loudness is clamped
  const breath = [0, 0.6, 1.2, 1.8].map((t) => liveGlow("thinking", 0, t));
  assert.ok(Math.max(...breath) - Math.min(...breath) > 0.1);
  assert.equal(liveGlow("thinking", 0, 0), liveGlow("thinking", 0, 0)); // reduced motion: steady
});
