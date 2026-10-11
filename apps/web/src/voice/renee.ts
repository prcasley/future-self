// Reneė: ECHO's voice. A British English woman.
//
// Two engines, in order:
//  1. Reneė's own voice, served by our API (/api/voice/tts), which forwards to the Kokoro
//     model (voice bf_emma) running in our voice service. Same voice on every device.
//  2. The best British female voice built into this browser.
// It never switches silently: `describe()` always names the engine and the voice in use.

import { decodeEnvelope, mouthAt, smoothMouth } from "./envelope.ts";

export const RENEE = {
  name: "Reneė",
  accent: "British English",
  lang: "en-GB",
  serviceVoice: "bf_emma",
} as const;

export type VoiceLike = { name: string; lang: string; localService?: boolean };

// Best first. Natural (neural) voices in Edge, then Chrome, then Windows and macOS voices.
const PREFERRED: RegExp[] = [
  /\bSonia\b.*Natural/i,
  /\bLibby\b.*Natural/i,
  /\bMaisie\b.*Natural/i,
  /\bBella\b.*Natural/i,
  /\bHollie\b.*Natural/i,
  /Google UK English Female/i,
  /\bHazel\b/i,
  /\bSusan\b/i,
  /\bKate\b/i,
  /\bSerena\b/i,
  /\bMartha\b/i,
  /\bStephanie\b/i,
];
const MALE =
  /\b(male|george|ryan|thomas|daniel|arthur|oliver|alfie|elliot|ethan|noah|rhys)\b/i;

const isBritish = (v: VoiceLike) =>
  /^en[-_]GB$/i.test(v.lang) || /\bUK\b|United Kingdom/i.test(v.name);

/** The British female voice Reneė should use on this device, or null when it has none. */
export function pickReneeVoice<V extends VoiceLike>(
  voices: readonly V[],
): V | null {
  for (const pattern of PREFERRED) {
    const hit = voices.find((v) => pattern.test(v.name) && isBritish(v));
    if (hit) return hit;
  }
  return (
    voices.find(
      (v) => isBritish(v) && !MALE.test(v.name) && /female/i.test(v.name),
    ) ??
    voices.find((v) => isBritish(v) && !MALE.test(v.name)) ??
    null
  );
}

export type Engine =
  | { kind: "service"; voice: string }
  | { kind: "browser"; voice: string }
  | { kind: "missing" };

/** What the person sees, so the voice is never swapped without saying so. */
export function describe(engine: Engine): string {
  if (engine.kind === "service")
    return `Voice: ${RENEE.name} · British · Kokoro`;
  if (engine.kind === "browser")
    return `Voice: ${RENEE.name} · British · ${engine.voice} (this browser)`;
  return `Voice: ${RENEE.name} isn't available here, so ECHO is using this browser's default voice`;
}

/** Speed for the service, from the browser-style rate used per future side. */
export const serviceSpeed = (rate: number) =>
  Math.min(1.3, Math.max(0.7, rate));

type Item = { text: string; rate: number; pitch: number };

/**
 * A queue that speaks sentences in order and calls `onIdle` once, when everything queued
 * has finished. Sentences stream in from Nemotron one at a time, so speech starts early.
 */
export function createRenee(opts: {
  onIdle: () => void;
  onEngine: (engine: Engine) => void;
  /** null = browser speech has no accessible waveform; 0 = silent service audio. */
  onLevel?: (level: number | null) => void;
  fetchAudio?: (
    text: string,
    speed: number,
    signal: AbortSignal,
  ) => Promise<Blob | null>;
}) {
  const queue: Item[] = [];
  let runningEpoch = -1;
  let epoch = 0;
  let audio: HTMLAudioElement | null = null;
  let cancelPlayback: (() => void) | null = null;
  let abort: AbortController | null = null;
  let serviceDown = false;
  let lastEngine = "";

  const report = (engine: Engine) => {
    const key = JSON.stringify(engine);
    if (key !== lastEngine) {
      lastEngine = key;
      opts.onEngine(engine);
    }
  };

  const browserVoice = () =>
    typeof speechSynthesis === "undefined"
      ? null
      : pickReneeVoice(speechSynthesis.getVoices());

  const sayBrowser = (item: Item) =>
    new Promise<void>((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      opts.onLevel?.(null);
      const utterance = new SpeechSynthesisUtterance(item.text);
      const voice = browserVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        report({ kind: "browser", voice: voice.name });
      } else {
        utterance.lang = RENEE.lang;
        report({ kind: "missing" });
      }
      utterance.rate = item.rate;
      utterance.pitch = item.pitch;
      const finish = () => {
        if (cancelPlayback === finish) cancelPlayback = null;
        resolve();
      };
      cancelPlayback = finish;
      utterance.onend = utterance.onerror = finish;
      speechSynthesis.speak(utterance);
    });

  const sayService = async (item: Item, mine: number): Promise<boolean> => {
    if (!opts.fetchAudio || serviceDown) return false;
    opts.onLevel?.(0);
    abort = new AbortController();
    let blob: Blob | null = null;
    try {
      blob = await opts.fetchAudio(
        item.text,
        serviceSpeed(item.rate),
        abort.signal,
      );
    } catch {
      blob = null;
    }
    if (mine !== epoch) return true; // cancelled while fetching: nothing to say
    if (!blob) {
      serviceDown = true; // stay on the browser voice for the rest of this page
      return false;
    }
    const envelope = opts.onLevel ? await decodeEnvelope(blob) : null;
    if (mine !== epoch) return true;
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    audio = player;
    let frame = 0;
    let previous = 0;
    let lastTime = 0;
    const meter = (now: number) => {
      if (mine !== epoch) return;
      const target =
        player.paused || player.ended || player.muted
          ? 0
          : mouthAt(envelope!, player.currentTime) * player.volume;
      previous = smoothMouth(
        previous,
        target,
        lastTime ? (now - lastTime) / 1000 : 1 / 60,
      );
      lastTime = now;
      opts.onLevel?.(previous);
      frame = requestAnimationFrame(meter);
    };
    try {
      const played = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (success: boolean) => {
          if (settled) return;
          settled = true;
          player.onended = player.onerror = null;
          if (cancelPlayback === cancel) cancelPlayback = null;
          resolve(success);
        };
        const cancel = () => finish(true);
        cancelPlayback = cancel;
        player.onended = () => finish(true);
        player.onerror = () => finish(false);
        player
          .play()
          .then(() => {
            if (settled || mine !== epoch) return;
            report({ kind: "service", voice: RENEE.serviceVoice });
            if (envelope) frame = requestAnimationFrame(meter);
            else opts.onLevel?.(null);
          })
          .catch(() => finish(false));
      });
      if (!played) serviceDown = true;
      return played;
    } finally {
      if (frame) cancelAnimationFrame(frame);
      player.pause();
      URL.revokeObjectURL(url);
      if (audio === player) audio = null;
      if (mine === epoch) opts.onLevel?.(0);
    }
  };

  const pump = async () => {
    if (runningEpoch === epoch) return;
    const mine = epoch;
    runningEpoch = mine;
    while (queue.length && mine === epoch) {
      const item = queue.shift()!;
      const done = await sayService(item, mine);
      if (!done && mine === epoch) await sayBrowser(item);
    }
    if (runningEpoch === mine) runningEpoch = -1;
    if (mine === epoch) opts.onIdle();
  };

  return {
    say(text: string, rate = 1, pitch = 1) {
      const clean = text.trim();
      if (!clean) return;
      queue.push({ text: clean, rate, pitch });
      void pump();
    },
    cancel() {
      epoch += 1;
      queue.length = 0;
      abort?.abort();
      cancelPlayback?.();
      if (audio) {
        audio.pause();
        audio = null;
      }
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      opts.onLevel?.(0);
    },
    /** Try the service again, e.g. after the person reconnects. */
    retryService() {
      serviceDown = false;
    },
  };
}

/** Fetch Reneė's audio from our API. Returns null when the voice service isn't set up. */
export async function fetchReneeAudio(
  text: string,
  speed: number,
  signal: AbortSignal,
) {
  const response = await fetch("/api/voice/tts", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed }),
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.size > 0 ? blob : null;
}
