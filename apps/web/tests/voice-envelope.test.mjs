import { test } from "node:test";
import assert from "node:assert/strict";
import { audioEnvelope, mouthAt, smoothMouth } from "../src/voice/envelope.ts";
import { composePose } from "../src/living/motion.ts";

test("mouth follows actual sample energy and closes during recorded silence", () => {
  const samples = new Float32Array(1000);
  for (let i = 200; i < 600; i++) samples[i] = i % 2 ? 0.1 : -0.1;
  const envelope = audioEnvelope([samples], 1000);
  assert.equal(mouthAt(envelope, 0.1), 0);
  assert.ok(mouthAt(envelope, 0.3) > 0.7);
  assert.equal(mouthAt(envelope, 0.8), 0);
  for (const t of [-1, 2, NaN, Infinity]) assert.equal(mouthAt(envelope, t), 0);
  assert.equal(mouthAt(audioEnvelope([], 24000), 0), 0);
});

test("stereo energy does not cancel opposite phase channels; jaw is bounded", () => {
  const envelope = audioEnvelope([new Float32Array(240).fill(1), new Float32Array(240).fill(-1)], 24000);
  assert.equal(mouthAt(envelope, 0), 1);
  assert.equal(mouthAt(audioEnvelope([new Float32Array(240).fill(0.002)], 24000), 0), 0);
});

test("attack is fast, release is smooth and reaches silence independent of frame rate", () => {
  assert.ok(smoothMouth(0, 1, 0.05) > 0.8);
  assert.ok(smoothMouth(1, 0, 0.05) > 0.4);
  for (const fps of [30, 60, 120]) {
    let level = 1;
    for (let i = 0; i < fps; i++) level = smoothMouth(level, 0, 1 / fps);
    assert.equal(level, 0);
  }
});

test("service waveform overrides synthetic and camera mouth but preserves head and blinking", () => {
  const camera = { yaw: 0.2, pitch: 0.1, roll: 0.1, blinkR: 0.4, blinkL: 0.3, open: 0.9, breathe: 0 };
  const original = composePose(1.3, "speaking", 0.5, camera, 2);
  const quiet = composePose(1.3, "speaking", 0.5, camera, 2, 0);
  assert.deepEqual({ ...quiet, open: original.open }, original);
  assert.equal(quiet.open, 0);
  assert.equal(composePose(1.3, "speaking", 0, null, 2, 0.6).open, 0.6);
  assert.equal(composePose(1.3, "speaking", 0, null, 2, null).open, composePose(1.3, "speaking", 0, null, 2).open);
  assert.equal(composePose(1.3, "idle", 0, null, 2, 1).open, 0);
});
