/**
 * The pieces that make talking to ECHO feel like a conversation rather than a walkie-talkie:
 * speaking each sentence as soon as it streams in, cutting Reneė off when you start talking
 * (barge-in), stopping on a spoken goodbye, and pausing after a quiet minute. Pure logic here;
 * main.tsx wires it to the microphone, speech recognition and Reneė.
 */

/** Splits a streaming reply into sentences as they complete, so Reneė can start early. */
export function createSentenceStream() {
  let spoken = 0; // characters of the streamed text already handed to the voice
  let streamed = "";
  return {
    /** Feed the whole reply-so-far; returns sentences that completed since the last call. */
    feed(text: string): string[] {
      streamed = text;
      const out: string[] = [];
      // A sentence ends at . ! ? (optionally followed by closing quotes) and then whitespace.
      const end = /[.!?]+["'”’)]*\s+/g;
      end.lastIndex = spoken;
      let match: RegExpExecArray | null;
      while ((match = end.exec(text))) {
        const stop = match.index + match[0].length;
        const sentence = text.slice(spoken, stop).trim();
        // Very short fragments ("Hi.") wait to join the next sentence for natural phrasing.
        if (sentence.length >= 12) {
          out.push(sentence);
          spoken = stop;
        }
      }
      return out;
    },
    /** The final answer arrived: what is left to say without repeating anything. */
    rest(finalText: string): string {
      if (!spoken) return finalText.trim();
      const said = streamed.slice(0, spoken);
      if (finalText.startsWith(said)) return finalText.slice(spoken).trim();
      // The server's answer isn't the streamed text (a tool ran): say the answer itself.
      return finalText.trim() === streamed.trim() ? "" : finalText.trim();
    },
    get started() {
      return spoken > 0;
    },
  };
}

const STOP =
  /^\s*(?:ok(?:ay)?[,\s]+)?(?:stop listening|go to sleep|goodbye(?: echo)?|bye(?: bye)?(?: echo)?|good ?night(?: echo)?|that'?s all(?: for (?:now|today))?|end (?:the )?session)\W*$/i;

// What's left of a stop command when barge-in clipped its first word ("stop listening" → "listening").
const STOP_TAIL = /^\s*(?:listening|all(?: for (?:now|today))?)\W*$/i;

/**
 * A spoken request to stop listening. Matches the whole utterance, so "stop" mid-sentence doesn't.
 * Right after a barge-in the recogniser starts a beat late, so the clipped tail also counts there.
 */
export function isStopCommand(text: string, afterBargeIn = false): boolean {
  return STOP.test(text) || (afterBargeIn && STOP_TAIL.test(text));
}

export const QUIET_PAUSE_MS = 60_000;

/**
 * Barge-in: decides from the microphone level whether the person has started talking over Reneė.
 * The first CALIBRATE_MS after arming learn the room (and any of Reneė's voice the echo canceller
 * leaves behind); speech must then stay clearly above that floor for HOLD_MS.
 */
export const CALIBRATE_MS = 400;
export const HOLD_MS = 280;
export type BargeState = { elapsed: number; floor: number; samples: number; above: number };

export function bargeStart(): BargeState {
  return { elapsed: 0, floor: 0, samples: 0, above: 0 };
}

export function bargeStep(
  state: BargeState,
  rms: number,
  dtMs: number,
): { state: BargeState; fire: boolean } {
  const next = { ...state, elapsed: state.elapsed + dtMs };
  if (next.elapsed <= CALIBRATE_MS) {
    next.samples += 1;
    next.floor += (rms - next.floor) / next.samples; // running mean of the room level
    return { state: next, fire: false };
  }
  const threshold = Math.max(0.02, next.floor * 3);
  next.above = rms > threshold ? next.above + dtMs : 0;
  return { state: next, fire: next.above >= HOLD_MS };
}

/** Root-mean-square level of one block of microphone samples. */
export function rmsOf(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/**
 * Microphone watcher for barge-in. Uses the browser's echo cancellation so Reneė's own voice
 * from the speakers doesn't count as the person talking. Returns null if the mic isn't available;
 * the conversation then works as before, with the Interrupt button and Space.
 */
export async function createBargeIn(onSpeech: () => void) {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return null;
  }
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const block = new Float32Array(analyser.fftSize);
  let timer: number | null = null;
  let state = bargeStart();
  const disarm = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  return {
    /**
     * Start watching while Reneė speaks. Already watching (her next sentence queued): keep going,
     * so the room isn't re-learned mid-reply and a barge-in can land between sentences.
     */
    arm() {
      if (timer !== null) return;
      state = bargeStart();
      void context.resume();
      let last = performance.now();
      timer = window.setInterval(() => {
        const now = performance.now();
        analyser.getFloatTimeDomainData(block);
        const step = bargeStep(state, rmsOf(block), now - last);
        last = now;
        state = step.state;
        if (step.fire) {
          disarm();
          onSpeech();
        }
      }, 40);
    },
    disarm,
    /** Release the microphone at the end of the session. */
    close() {
      disarm();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
