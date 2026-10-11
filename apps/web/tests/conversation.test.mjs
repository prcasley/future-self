import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALIBRATE_MS,
  HOLD_MS,
  bargeStart,
  bargeStep,
  createSentenceStream,
  isStopCommand,
  rmsOf,
} from "../src/voice/conversation.ts";

test("sentences are spoken as they complete, and the end never repeats them", () => {
  const stream = createSentenceStream();
  assert.deepEqual(stream.feed("Hi. Good evening. I'm you, one"), ["Hi. Good evening."]); // "Hi." alone waits
  assert.deepEqual(stream.feed("Hi. Good evening. I'm you, one year from now. Let's"), [
    "I'm you, one year from now.",
  ]);
  assert.equal(stream.started, true);
  const final = "Hi. Good evening. I'm you, one year from now. Let's talk about what got us here.";
  assert.deepEqual(stream.feed(final), []); // the last sentence has no trailing space yet
  assert.equal(stream.rest(final), "Let's talk about what got us here.");
});

test("a reply that never streamed is said whole, and a tool answer replaces the stream", () => {
  assert.equal(createSentenceStream().rest("Saved your goal."), "Saved your goal.");
  const stream = createSentenceStream();
  stream.feed("Let me save that for you right now. ");
  assert.equal(stream.rest("Saved: learn Python. Want a first mission?"), "Saved: learn Python. Want a first mission?");
  const same = createSentenceStream();
  same.feed("That sounds like a strong goal to me! ");
  assert.equal(same.rest("That sounds like a strong goal to me!"), "");
});

test("only a whole goodbye utterance stops listening", () => {
  for (const text of ["stop listening", "Okay, goodbye ECHO.", "bye echo", "That's all for now", "goodnight", "end session"])
    assert.ok(isStopCommand(text), text);
  for (const text of ["don't stop listening to me", "goodbye to my old habits is my goal", "stop", "how do I stop procrastinating"])
    assert.ok(!isStopCommand(text), text);
});

test("barge-in learns the room, ignores blips, and fires on sustained speech", () => {
  let state = bargeStart();
  let fired = false;
  const run = (rms, ms, step = 40) => {
    for (let t = 0; t < ms; t += step) {
      const result = bargeStep(state, rms, step);
      state = result.state;
      fired ||= result.fire;
    }
  };
  run(0.01, CALIBRATE_MS); // room plus leftover echo
  run(0.2, 120); // a cough
  run(0.01, 200);
  assert.equal(fired, false);
  run(0.2, HOLD_MS + 40); // the person talks
  assert.equal(fired, true);
});

test("a loud room raises the bar instead of firing constantly", () => {
  let state = bargeStart();
  let fired = false;
  for (let t = 0; t < 3000; t += 40) {
    const result = bargeStep(state, t < CALIBRATE_MS ? 0.05 : 0.08, 40);
    state = result.state;
    fired ||= result.fire;
  }
  assert.equal(fired, false);
});

test("rms of silence is zero and of a full-scale square wave is one", () => {
  assert.equal(rmsOf(new Float32Array(0)), 0);
  assert.equal(rmsOf(new Float32Array(64)), 0);
  assert.equal(rmsOf(Float32Array.from({ length: 64 }, (_, i) => (i % 2 ? 1 : -1))), 1);
});

test("a stop command clipped by barge-in still stops, but only right after a barge-in", () => {
  assert.equal(isStopCommand("listening"), false);
  assert.equal(isStopCommand("listening", true), true);
  assert.equal(isStopCommand("all for now", true), true);
  assert.equal(isStopCommand("stop listening", true), true);
  assert.equal(isStopCommand("listening to music helps me focus", true), false);
  assert.equal(isStopCommand("all of my goals", true), false);
});
