import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenee, describe, pickReneeVoice, RENEE } from "../src/voice/renee.ts";

const v = (name, lang) => ({ name, lang });

test("Reneė is a British woman", () => {
  assert.equal(RENEE.name, "Reneė");
  assert.equal(RENEE.lang, "en-GB");
  assert.equal(RENEE.serviceVoice, "bf_emma");
});

test("prefers the natural British female voice in Edge", () => {
  const voices = [
    v("Microsoft David - English (United States)", "en-US"),
    v("Microsoft Ryan Online (Natural) - English (United Kingdom)", "en-GB"),
    v("Google UK English Female", "en-GB"),
    v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB"),
  ];
  assert.match(pickReneeVoice(voices).name, /Sonia/);
});

test("uses Chrome's UK female voice when Edge voices are absent", () => {
  const voices = [v("Google US English", "en-US"), v("Google UK English Male", "en-GB"), v("Google UK English Female", "en-GB")];
  assert.equal(pickReneeVoice(voices).name, "Google UK English Female");
});

test("never picks a British man or an American voice", () => {
  assert.equal(pickReneeVoice([v("Google UK English Male", "en-GB"), v("Microsoft Zira", "en-US")]), null);
  assert.equal(pickReneeVoice([v("Microsoft George - English (United Kingdom)", "en-GB")]), null);
  assert.equal(pickReneeVoice([]), null);
});

test("the label always names the engine", () => {
  assert.match(describe({ kind: "service", voice: "bf_emma" }), /Reneė.*Kokoro/);
  assert.match(describe({ kind: "browser", voice: "Google UK English Female" }), /Google UK English Female/);
  assert.match(describe({ kind: "missing" }), /isn't available/);
});

const tick = () => new Promise((r) => setTimeout(r, 0));

test("speaks queued sentences in order through the service and goes idle once", async () => {
  const played = [];
  let idle = 0;
  const engines = [];
  globalThis.URL.createObjectURL = () => "blob:x";
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Audio = class {
    constructor() { this.onended = null; }
    play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
    pause() {}
  };
  const voice = createRenee({
    onIdle: () => idle++,
    onEngine: (e) => engines.push(e.kind),
    fetchAudio: async (text) => { played.push(text); return new Blob(["x"]); },
  });
  voice.say("One.");
  voice.say("Two.");
  voice.say("Three.");
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual(played, ["One.", "Two.", "Three."]);
  assert.equal(idle, 1);
  assert.deepEqual(engines, ["service"]);
});

test("falls back to the browser when the service is not set up, and says so", async () => {
  let idle = 0;
  const engines = [];
  const voice = createRenee({
    onIdle: () => idle++,
    onEngine: (e) => engines.push(e.kind),
    fetchAudio: async () => null,
  });
  voice.say("Hello.");
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(idle, 1);
  // No speechSynthesis in Node, so nothing was spoken and nothing claims Reneė spoke.
  assert.ok(!engines.includes("service"));
});

test("cancel stops the queue without reporting idle", async () => {
  let idle = 0;
  let calls = 0;
  const voice = createRenee({
    onIdle: () => idle++,
    onEngine: () => {},
    fetchAudio: (text, speed, signal) =>
      new Promise((resolve) => { calls++; signal.addEventListener("abort", () => resolve(null)); }),
  });
  voice.say("First.");
  voice.say("Second.");
  await tick();
  voice.cancel();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(calls, 1);
  assert.equal(idle, 0);
});

test("a rejected audio play never claims service playback and goes idle", async () => {
  const engines = [];
  const levels = [];
  let idle = 0;
  globalThis.Audio = class {
    play() { return Promise.reject(new Error("autoplay blocked")); }
    pause() {}
  };
  const voice = createRenee({ onIdle: () => idle++, onEngine: e => engines.push(e.kind),
    onLevel: level => levels.push(level), fetchAudio: async () => new Blob(["x"]) });
  voice.say("Hello.");
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(idle, 1);
  assert.ok(!engines.includes("service"));
  assert.equal(levels.at(-1), 0);
});

test("interrupt releases audio and closes the mouth without cancelling the next sentence", async () => {
  const players = [], released = [], levels = [];
  let idle = 0, urls = 0;
  globalThis.URL.createObjectURL = () => `blob:${++urls}`;
  globalThis.URL.revokeObjectURL = url => released.push(url);
  globalThis.Audio = class {
    constructor() { this.paused = false; players.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const voice = createRenee({ onIdle: () => idle++, onEngine: () => {},
    onLevel: level => levels.push(level), fetchAudio: async () => new Blob(["x"]) });
  voice.say("First.");
  await tick();
  voice.cancel();
  voice.say("Second.");
  await tick();
  assert.equal(players[0].paused, true);
  assert.equal(players[1].paused, false);
  assert.deepEqual(released, ["blob:1"]);
  assert.equal(idle, 0);
  players[1].onended();
  await tick();
  assert.equal(idle, 1);
  assert.equal(levels.at(-1), 0);
  assert.deepEqual(released, ["blob:1", "blob:2"]);
});
