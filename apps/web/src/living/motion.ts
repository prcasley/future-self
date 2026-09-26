// What moves the living portrait: idle life (blinks, micro head motion, breathing), ECHO's speech,
// and the viewer's own head when the camera mirror is on. Pure functions and small state machines.

import { FACE, REST, type Landmark, type Pose } from "./geometry.ts";

const DEG = Math.PI / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Deterministic 0..1 noise for an integer and a seed. */
export function hash(n: number, seed = 0): number {
  let h = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Natural blinking: every 2.2–6.5 s, sometimes twice in a row. */
export class Blinker {
  private seed: number;
  private next: number;
  private start = -Infinity;
  private k = 0;
  constructor(seed = 1) {
    this.seed = seed;
    this.next = 1.2 + 2 * hash(0, seed);
  }
  /** Eyelid closure 0..1 at time t (seconds, non-decreasing). */
  at(t: number): number {
    if (t >= this.next) {
      this.start = this.next;
      this.k += 1;
      const double = hash(this.k, this.seed + 7) < 0.12;
      this.next =
        this.start + (double ? 0.32 : 2.2 + 4.3 * hash(this.k, this.seed));
    }
    return blinkShape(t - this.start);
  }
}

/** Close in 70 ms, hold 30 ms, open in 150 ms. */
export function blinkShape(dt: number): number {
  if (dt < 0 || dt > 0.25) return 0;
  if (dt < 0.07) return dt / 0.07;
  if (dt < 0.1) return 1;
  const u = (dt - 0.1) / 0.15;
  return 1 - u * u * (3 - 2 * u);
}

/** Small, slow head motion so a still face never looks frozen. */
export function idleHead(
  t: number,
  seed = 1,
): Pick<Pose, "yaw" | "pitch" | "roll"> {
  const p = seed * 1.7;
  return {
    yaw:
      (1.6 * Math.sin(t * 0.37 + p) + 0.7 * Math.sin(t * 0.83 + 2 * p)) * DEG,
    pitch:
      (1.0 * Math.sin(t * 0.29 + 3 * p) + 0.4 * Math.sin(t * 0.71 + p)) * DEG,
    roll:
      (0.8 * Math.sin(t * 0.23 + 5 * p) + 0.3 * Math.sin(t * 0.61 + 4 * p)) *
      DEG,
  };
}

/** Breathing, about one breath every 4.5 seconds. */
export function breathe(t: number): number {
  return 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 4.5);
}

/**
 * Mouth opening while ECHO talks: syllables at about 4.4 per second with varied sizes and short
 * pauses. Used when no audio level is available (the browser voice does not expose one).
 */
export function speechOpen(t: number, seed = 1): number {
  const rate = 4.4;
  const i = Math.floor(t * rate);
  const u = t * rate - i;
  const pause = hash(i, seed + 11) < 0.16;
  const size = pause ? 0.04 : 0.28 + 0.62 * hash(i, seed);
  const shape = Math.pow(Math.sin(Math.PI * u), 0.8);
  return clamp01(size * shape);
}

/** Speech also nods the head slightly on stressed syllables. */
export function speechNod(t: number, seed = 1): number {
  const i = Math.floor(t * 2.2);
  const u = t * 2.2 - i;
  return hash(i, seed + 3) > 0.55 ? 1.4 * DEG * Math.sin(Math.PI * u) : 0;
}

export type Signals = {
  yaw: number;
  pitch: number;
  roll: number;
  /** Eye aspect ratios (open height / width) of the subject's right and left eye. */
  earR: number;
  earL: number;
  /** Inner-lip gap / inner mouth width. */
  mouth: number;
};

/**
 * Raw head and face signals from one frame of camera landmarks. `aspect` is the frame's
 * width / height, so x and z share units with y.
 */
export function measure(lm: Landmark[], aspect: number): Signals {
  const P = (i: number) => ({
    x: lm[i].x * aspect,
    y: lm[i].y,
    z: lm[i].z * aspect,
  });
  const d = (a: number, b: number) => {
    const p = P(a),
      q = P(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  const r = P(FACE.eyeRightOuter),
    l = P(FACE.eyeLeftOuter);
  const cr = P(FACE.faceRight),
    cl = P(FACE.faceLeft);
  const top = P(FACE.forehead),
    chin = P(FACE.chin);
  return {
    roll: Math.atan2(l.y - r.y, l.x - r.x),
    yaw: Math.atan2(cl.z - cr.z, cl.x - cr.x),
    pitch: Math.atan2(-(chin.z - top.z), chin.y - top.y),
    earR:
      d(159, 145) / Math.max(1e-6, d(FACE.eyeRightOuter, FACE.eyeRightInner)),
    earL: d(386, 374) / Math.max(1e-6, d(FACE.eyeLeftOuter, FACE.eyeLeftInner)),
    mouth:
      d(FACE.lipUpper, FACE.lipLower) /
      Math.max(1e-6, d(FACE.innerRight, FACE.innerLeft)),
  };
}

/** How far the portrait follows the viewer's head, radians. */
export const MIRROR_LIMITS = { yaw: 12 * DEG, pitch: 8 * DEG, roll: 12 * DEG };

/**
 * Turns camera signals into a mirrored pose: the viewer's neutral head (the first second) becomes
 * rest, left and right swap like a mirror, and every channel is smoothed.
 */
export class MirrorCalibrator {
  private samples: Signals[] = [];
  private base: Signals | null = null;
  private pose: Pose = { ...REST };
  private last = -1;
  private settle: number;
  private mirrorMouth: boolean;
  constructor(settle = 12, mirrorMouth = false) {
    this.settle = settle;
    this.mirrorMouth = mirrorMouth;
  }

  get calibrated() {
    return this.base !== null;
  }

  reset() {
    this.samples = [];
    this.base = null;
    this.pose = { ...REST };
    this.last = -1;
  }

  /** Feed one frame's signals at time t (seconds); returns the smoothed, mirrored pose. */
  update(s: Signals, t: number): Pose {
    if (!this.base) {
      this.samples.push(s);
      if (this.samples.length < this.settle) return this.pose;
      const mid = (k: keyof Signals) => {
        const v = this.samples.map((x) => x[k]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      this.base = {
        yaw: mid("yaw"),
        pitch: mid("pitch"),
        roll: mid("roll"),
        earR: mid("earR"),
        earL: mid("earL"),
        mouth: mid("mouth"),
      };
    }
    const b = this.base;
    // A photo can only turn so far before the warp shows, so large head moves are eased into a
    // limit instead of stopping dead at it.
    const soft = (v: number, m: number) => m * Math.tanh(v / m);
    // Mirror: the viewer's left eye drives the portrait's eye on the same side of the screen.
    const target: Pose = {
      yaw: soft(-(s.yaw - b.yaw), MIRROR_LIMITS.yaw),
      pitch: soft(s.pitch - b.pitch, MIRROR_LIMITS.pitch),
      roll: soft(-(s.roll - b.roll), MIRROR_LIMITS.roll),
      blinkR: clamp01((b.earL * 0.82 - s.earL) / (b.earL * 0.55)),
      blinkL: clamp01((b.earR * 0.82 - s.earR) / (b.earR * 0.55)),
      open: this.mirrorMouth ? clamp01((s.mouth - b.mouth - 0.04) / 0.45) : 0,
      breathe: 0,
    };
    const dt = this.last < 0 ? 1 / 30 : Math.max(0, t - this.last);
    this.last = t;
    const follow = (tau: number) => 1 - Math.exp(-dt / tau);
    const k = follow(0.09);
    const kb = follow(0.03);
    const p = this.pose;
    this.pose = {
      yaw: p.yaw + (target.yaw - p.yaw) * k,
      pitch: p.pitch + (target.pitch - p.pitch) * k,
      roll: p.roll + (target.roll - p.roll) * k,
      blinkR: p.blinkR + (target.blinkR - p.blinkR) * kb,
      blinkL: p.blinkL + (target.blinkL - p.blinkL) * kb,
      open: p.open + (target.open - p.open) * kb,
      breathe: 0,
    };
    return this.pose;
  }
}

export type Mode = "idle" | "listening" | "thinking" | "speaking";

/**
 * The portrait's pose at time t: idle life, the mode (listening leans in, thinking looks away a
 * little, speaking moves the mouth), and optionally the mirrored camera pose on top.
 */
export function composePose(
  t: number,
  mode: Mode,
  blink: number,
  mirror: Pose | null,
  seed = 1,
): Pose {
  const head = idleHead(t, seed);
  const pose: Pose = {
    yaw: head.yaw,
    pitch: head.pitch,
    roll: head.roll,
    blinkR: blink,
    blinkL: blink,
    open: 0,
    breathe: breathe(t),
  };
  if (mode === "listening") {
    pose.roll += 2.5 * DEG;
    pose.pitch -= 1 * DEG;
  } else if (mode === "thinking") {
    pose.yaw += 4 * DEG * Math.sin(t * 0.5);
    pose.pitch += 2 * DEG;
  } else if (mode === "speaking") {
    pose.open = speechOpen(t, seed);
    pose.pitch += speechNod(t, seed);
  }
  if (mirror) {
    // The camera leads; idle motion shrinks to a trace so the mirror feels direct.
    pose.yaw = mirror.yaw + head.yaw * 0.2;
    pose.pitch =
      mirror.pitch +
      head.pitch * 0.2 +
      (mode === "speaking" ? speechNod(t, seed) : 0);
    pose.roll = mirror.roll + head.roll * 0.2;
    pose.blinkR = Math.max(blink, mirror.blinkR);
    pose.blinkL = Math.max(blink, mirror.blinkL);
    pose.open = Math.max(pose.open, mirror.open);
  }
  return pose;
}
