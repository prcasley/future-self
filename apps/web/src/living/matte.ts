// Cutting the person out of a photo without a light fringe. The segmentation mask is soft and a
// little wide, so its edge is tightened, and the colours along that edge are pulled in from the
// person instead of the mix of person and background the photo has there.
// The pixel math is pure (RGBA arrays), so it runs in node tests; `spreadColors` needs a canvas.

export const MATTE = {
  /** Mask confidence where the cut-out edge begins … where it is solid. */
  lo: 0.45,
  hi: 0.85,
  /** Confidence above which a pixel is surely the person. */
  core: 0.92,
  /** Below this confidence an edge pixel takes the person's colour; above it, its own. */
  own: 0.6,
};

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The photo reduced to the pixels that are surely the person; everything else transparent. */
export function personCore(
  photo: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(photo.length);
  const cut = MATTE.core * 255;
  for (let i = 0; i < photo.length; i += 4) {
    if (mask[i + 3] < cut) continue;
    out[i] = photo[i];
    out[i + 1] = photo[i + 1];
    out[i + 2] = photo[i + 2];
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Cut the person out of `photo` in place: the tightened mask becomes its alpha, and along the edge
 * the person's own colours (`spread`: the core spread outward) replace the photo's, which there
 * still carry the background. Masks carry their confidence in alpha.
 */
export function applyMatte(
  photo: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  spread: Uint8ClampedArray | null,
): void {
  for (let i = 0; i < photo.length; i += 4) {
    const m = mask[i + 3] / 255;
    const a = smooth(MATTE.lo, MATTE.hi, m);
    photo[i + 3] = Math.round(255 * a);
    if (a === 0 || !spread || spread[i + 3] === 0) continue;
    const own = smooth(MATTE.own, MATTE.core, m);
    for (let c = 0; c < 3; c++)
      photo[i + c] = Math.round(
        spread[i + c] + (photo[i + c] - spread[i + c]) * own,
      );
  }
}

/**
 * Spread a partly transparent image's colours into its transparent parts (push–pull): halve it
 * down to a few pixels, then fill each level's holes from the level below it. Returns the filled
 * RGBA pixels at full size; areas far from any colour may stay transparent.
 */
export function spreadColors(core: ImageData): Uint8ClampedArray {
  const make = (w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return { canvas, ctx };
  };
  const levels = [make(core.width, core.height)];
  levels[0].ctx.putImageData(core, 0, 0);
  while (
    Math.max(
      levels[levels.length - 1].canvas.width,
      levels[levels.length - 1].canvas.height,
    ) > 8
  ) {
    const prev = levels[levels.length - 1].canvas;
    const next = make(
      Math.max(1, Math.ceil(prev.width / 2)),
      Math.max(1, Math.ceil(prev.height / 2)),
    );
    next.ctx.drawImage(prev, 0, 0, next.canvas.width, next.canvas.height);
    levels.push(next);
  }
  for (let k = levels.length - 2; k >= 0; k--) {
    const { canvas, ctx } = levels[k];
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(levels[k + 1].canvas, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }
  return levels[0].ctx.getImageData(0, 0, core.width, core.height).data;
}

/**
 * Soften a mask's alpha with a blur of about `radius` px (two box passes each way). The person
 * mask comes from a small segmentation grid, so its upscaled edge steps; this rounds it off
 * before the edge is tightened.
 */
export function blurAlpha(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Uint8ClampedArray {
  const r = Math.max(0, Math.round(radius));
  const a = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) a[p] = mask[p * 4 + 3];
  if (r > 0) {
    const tmp = new Float32Array(Math.max(w, h));
    const pass = (n: number, stride: number, lines: number, step: number) => {
      for (let line = 0; line < lines; line++) {
        const o = line * step;
        let sum = 0;
        for (let k = -r; k <= r; k++)
          sum += a[o + Math.min(n - 1, Math.max(0, k)) * stride];
        for (let k = 0; k < n; k++) {
          tmp[k] = sum / (2 * r + 1);
          const add = Math.min(n - 1, k + r + 1);
          const drop = Math.max(0, k - r);
          sum += a[o + add * stride] - a[o + drop * stride];
        }
        for (let k = 0; k < n; k++) a[o + k * stride] = tmp[k];
      }
    };
    for (let round = 0; round < 2; round++) {
      pass(w, 1, h, w); // along rows
      pass(h, w, w, 1); // along columns
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) out[p * 4 + 3] = a[p];
  return out;
}

/**
 * Cut the person out of `canvas` using `mask` (same size, confidence in alpha). `softness` is
 * about one cell of the segmentation grid, in canvas px.
 */
export function cutOut(
  canvas: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  softness = 0,
): void {
  const ctx = canvas.getContext("2d");
  const mctx = mask.getContext("2d");
  if (!ctx || !mctx) return;
  const { width: w, height: h } = canvas;
  const photo = ctx.getImageData(0, 0, w, h);
  const confidence = blurAlpha(
    mctx.getImageData(0, 0, w, h).data,
    w,
    h,
    softness,
  );
  let spread: Uint8ClampedArray | null = null;
  try {
    spread = spreadColors(
      new ImageData(personCore(photo.data, confidence), w, h),
    );
  } catch {
    spread = null; // the edge then keeps the photo's colours
  }
  applyMatte(photo.data, confidence, spread);
  ctx.putImageData(photo, 0, 0);
}
