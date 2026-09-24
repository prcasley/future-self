// The "future face": the user's landmarks reshaped so their proportions hit the projected ratios.
// A marketing visual, not a prediction: small, smooth geometric edits in the face's own frame (so a
// tilted head works), each chosen so that re-measuring the result gives the projected numbers.
// Pure functions, unit-tested in Node.

import { LM } from "./goldenRatio.ts";

type P = { x: number; y: number };
export type FutureRow = { key: string; now: number; future: number };

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const increasing = (xs: number[]) =>
  xs.every((x, i) => i === 0 || x > xs[i - 1]);

/** Piecewise-linear map through increasing knots, extended with the end slopes. */
function remap(v: number, from: number[], to: number[]): number {
  const n = from.length;
  let i = 0;
  if (v >= from[n - 1]) i = n - 2;
  else while (i < n - 2 && v > from[i + 1]) i++;
  const span = from[i + 1] - from[i];
  const t = span ? (v - from[i]) / span : 0;
  return to[i] + t * (to[i + 1] - to[i]);
}

/**
 * Reshape `points` (normalized 0..1 over a `width` x `height` space) toward the projected ratios.
 * Unknown keys are ignored and each change is capped at 20%. Returns new normalized points.
 */
export function futureFace(
  points: P[],
  rows: FutureRow[],
  width: number,
  height: number,
): P[] {
  if (points.length < 478) return points.map((p) => ({ x: p.x, y: p.y }));
  const f: Record<string, number> = {};
  for (const r of rows)
    if (r.now > 0 && r.future > 0) f[r.key] = clamp(r.future / r.now, 0.8, 1.2);
  const k = (key: string) => f[key] ?? 1;

  // Face frame: v runs hairline -> chin, u runs face-right -> face-left, origin at the nose bridge.
  const px = points.map((p) => ({ x: p.x * width, y: p.y * height }));
  const down = {
    x: px[LM.chin].x - px[LM.hairline].x,
    y: px[LM.chin].y - px[LM.hairline].y,
  };
  const len = Math.hypot(down.x, down.y) || 1;
  const v = { x: down.x / len, y: down.y / len };
  let u = { x: -v.y, y: v.x };
  const across = {
    x: px[LM.faceLeft].x - px[LM.faceRight].x,
    y: px[LM.faceLeft].y - px[LM.faceRight].y,
  };
  if (u.x * across.x + u.y * across.y < 0) u = { x: -u.x, y: -u.y };
  const o = px[LM.noseBridge];
  const uv = px.map((p) => {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    return { u: dx * u.x + dy * u.y, v: dx * v.x + dy * v.y };
  });
  const U = (i: number) => uv[i].u;
  const V = (i: number) => uv[i].v;
  const D = (a: number, b: number) => Math.hypot(U(a) - U(b), V(a) - V(b));
  const mouthNose0 =
    D(LM.mouthRight, LM.mouthLeft) / D(LM.noseRight, LM.noseLeft);
  const jawMouth0 = D(LM.jawRight, LM.jawLeft) / D(LM.mouthRight, LM.mouthLeft);

  // 1. Vertical: face thirds and total height through knots down the midline; the lower lip
  //    grows by the lip factor while the upper lip keeps its size.
  const main = [LM.hairline, LM.noseBridge, LM.noseBase, LM.chin].map(V);
  if (increasing(main)) {
    const [h, b, n, c] = main;
    const d3 = n - b;
    const heightNext = (c - h) * k("faceRectangle") * k("widthIpd");
    const d2r = ((b - h) / d3) * k("thirdsUpper");
    const d4r = ((c - n) / d3) * k("thirdsLower");
    const d3n = heightNext / (d2r + 1 + d4r);
    const d4n = d3n * d4r;
    let from = main;
    let to = [-d2r * d3n, 0, d3n, d3n + d4n];
    const lips = [
      LM.lipTop,
      LM.lipUpperInner,
      LM.lipLowerInner,
      LM.lipBottom,
    ].map(V);
    const all = [h, b, n, ...lips, c];
    if (increasing(all)) {
      const [l0, l13, l14, l17] = lips;
      const lip = (l17 - l14) * k("lips");
      const flex = l0 - n + (c - l17);
      const s = flex > 0 ? (d4n - (l14 - l0) - lip) / flex : -1;
      if (s > 0) {
        from = all;
        const y0 = d3n + (l0 - n) * s;
        const y14 = y0 + (l14 - l0);
        to = [to[0], 0, d3n, y0, y0 + (l13 - l0), y14, y14 + lip, d3n + d4n];
      }
    }
    for (const p of uv) p.v = remap(p.v, from, to);
  }

  // 2. Face width at the cheeks; everything between the pupils stays put (so the pupil
  //    distance holds).
  const e = Math.max(Math.abs(U(LM.irisRight)), Math.abs(U(LM.irisLeft)));
  const wide = Math.abs(U(LM.faceRight)) + Math.abs(U(LM.faceLeft));
  if (wide > 2 * e && k("widthIpd") !== 1) {
    const kw = (wide * k("widthIpd") - 2 * e) / (wide - 2 * e);
    for (const p of uv) {
      const a = Math.abs(p.u);
      if (a > e) p.u = Math.sign(p.u) * (e + (a - e) * kw);
    }
  }

  // 3. Mouth width, around the mouth only (the nose above it is untouched).
  const mouthU = (U(LM.mouthRight) + U(LM.mouthLeft)) / 2;
  const mouthV = (V(LM.mouthRight) + V(LM.mouthLeft)) / 2;
  const mouthHalf = D(LM.mouthRight, LM.mouthLeft) / 2;
  const noseV = (V(LM.noseRight) + V(LM.noseLeft)) / 2;
  if (mouthHalf > 0 && mouthV > noseV) {
    const km =
      (mouthNose0 * k("mouthNose") * D(LM.noseRight, LM.noseLeft)) /
      (2 * mouthHalf);
    const ru = mouthHalf * 1.5;
    const rv = (mouthV - noseV) * 0.9;
    if (km !== 1)
      for (const p of uv) {
        const r = Math.hypot((p.u - mouthU) / ru, (p.v - mouthV) / rv);
        const w = 1 - smooth(0.7, 1, r);
        if (w > 0) p.u = mouthU + (p.u - mouthU) * (1 + (km - 1) * w);
      }
  }

  // 4. Jaw width, fading in from below the mouth corners down to the jaw angle.
  const mouthLow = Math.max(V(LM.mouthRight), V(LM.mouthLeft));
  const jawV = Math.min(V(LM.jawRight), V(LM.jawLeft));
  const jaw = D(LM.jawRight, LM.jawLeft);
  if (jaw > 0 && jawV > mouthLow) {
    const kj =
      (jawMouth0 * k("jawMouth") * D(LM.mouthRight, LM.mouthLeft)) / jaw;
    if (kj !== 1)
      for (const p of uv) {
        const w = smooth(mouthLow, jawV, p.v);
        if (w > 0) p.u = p.u * (1 + (kj - 1) * w);
      }
  }

  return uv.map((p) => ({
    x: (o.x + p.u * u.x + p.v * v.x) / width,
    y: (o.y + p.u * u.y + p.v * v.y) / height,
  }));
}

/** Ease between the face now (t = 0) and the projected face (t = 1). */
export function blend(now: P[], next: P[], t: number): P[] {
  const s = smooth(0, 1, t);
  return now.map((p, i) => ({
    x: p.x + (next[i].x - p.x) * s,
    y: p.y + (next[i].y - p.y) * s,
  }));
}
