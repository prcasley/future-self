// Pure pixel logic for the portrait projection: find the face, frame it, and cut a soft
// head-and-shoulders matte. No DOM and no network, so the photo never leaves this device
// and every step runs under `node --test`.

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
/** Face centre and width, as fractions of the source image. */
export type Face = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  score: number;
};
/** Source rectangle (fractions of the source image) that fills the portrait view. May exceed 0..1. */
export type Crop = { x: number; y: number; w: number; h: number };

/** Where the face lands in the 4:5 portrait view (fractions of view width and height, y from top). */
export const VIEW = {
  aspect: 0.8,
  faceX: 0.5,
  faceY: 0.37,
  faceWidth: 0.38,
};

/** Head, neck, and shoulder shapes in view coordinates (x right, y down). Shared with the shader. */
export const BUST = {
  head: { cx: 0.5, cy: 0.35, rx: 0.29, ry: 0.31 },
  neck: { cx: 0.5, cy: 0.66, hx: 0.12, hy: 0.14 },
  torso: { cx: 0.5, cy: 1.08, rx: 0.56, ry: 0.4 },
};

/** Chroma-based skin test (YCbCr). Works across skin tones; rejects greys, beige walls, and orange. */
export function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return (
    y > 30 &&
    y < 250 &&
    cb >= 77 &&
    cb <= 127 &&
    cr >= 134 &&
    cr <= 176 &&
    cr - cb > 14
  );
}

const luma = (data: Uint8ClampedArray, p: number) =>
  0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];

type Head = { top: number; bottom: number; widest: number; cx: number };

type Run = { s: number; e: number; len: number };

/** Longest run of region pixels in one row, bridging small holes (eyes, brows, glasses). */
function longestRun(xs: number[], gap: number): Run | null {
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  let bs = xs[0];
  let be = xs[0];
  let s = xs[0];
  let e = xs[0];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - e <= gap + 1) e = xs[i];
    else {
      if (e - s > be - bs) {
        bs = s;
        be = e;
      }
      s = e = xs[i];
    }
  }
  if (e - s > be - bs) {
    bs = s;
    be = e;
  }
  return { s: bs, e: be, len: be - bs + 1 };
}

/**
 * The head part of a region. "fromTop" walks down from the top and stops at the neck (the neck
 * and chest hang below the face, so only the head sets the width); "whole" takes the widest run
 * anywhere, for a region already cut to the head rows. Stray pixels beside or above the head
 * (hair highlights) do not count: runs bridge small holes only, and the top is the first row
 * that reaches 40% of the widest run.
 */
export function measureHead(
  pixels: number[],
  w: number,
  h: number,
  mode: "fromTop" | "whole" = "fromTop",
): Head | null {
  const rows: number[][] = Array.from({ length: h }, () => []);
  for (const p of pixels) {
    const x = p % w;
    rows[(p - x) / w].push(x);
  }
  const gap = Math.max(2, Math.round(w * 0.025));
  const runs = rows.map((xs) => longestRun(xs, gap));
  const first = runs.findIndex((r) => r !== null);
  if (first < 0) return null;
  let widest = 0;
  let widestRow = first;
  let bottom = h;
  if (mode === "whole") {
    runs.forEach((run, y) => {
      if (run && run.len > widest) {
        widest = run.len;
        widestRow = y;
      }
    });
    bottom = widestRow;
    for (let y = widestRow; y < h; y++)
      if ((runs[y]?.len ?? 0) >= widest * 0.4) bottom = y + 1;
  } else
    for (let y = first; y < h; y++) {
      const run = runs[y];
      const len = run ? run.len : 0;
      if (widest && y - first > widest * 0.9 && len < widest * 0.62) {
        bottom = y;
        break;
      }
      if (y - first > Math.max(widest, 4) * 1.6) {
        bottom = y;
        break;
      }
      if (len > widest) {
        widest = len;
        widestRow = y;
      }
    }
  let top = first;
  while (top < widestRow && (runs[top]?.len ?? 0) < widest * 0.4) top++;
  let sum = 0;
  let count = 0;
  for (let y = top; y < bottom; y++) {
    const run = runs[y];
    if (run && run.len >= widest * 0.4) {
      sum += (run.s + run.e) / 2;
      count++;
    }
  }
  if (!count) return null;
  return { top, bottom, widest, cx: sum / count + 0.5 };
}

/**
 * Largest plausible skin region near the upper middle of the frame. Light hair passes the chroma
 * test too, so the chosen region is re-measured on its brighter pixels: when that is clearly
 * narrower, the first measurement included hair and the brighter one is the face.
 */
export function findFace(img: Pixels): Face | null {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const alpha = data[i * 4 + 3];
    mask[i] =
      alpha > 127 && isSkin(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
        ? 1
        : 0;
  }
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best: { face: Face; pixels: number[]; head: Head } | null = null;
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels: number[] = [];
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      pixels.push(p);
      if (x > 0 && mask[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1;
        stack[sp++] = p + 1;
      }
      if (p >= w && mask[p - w] && !seen[p - w]) {
        seen[p - w] = 1;
        stack[sp++] = p - w;
      }
      if (p < n - w && mask[p + w] && !seen[p + w]) {
        seen[p + w] = 1;
        stack[sp++] = p + w;
      }
    }
    const fraction = pixels.length / n;
    if (fraction < 0.003 || fraction > 0.6) continue;
    const head = measureHead(pixels, w, h);
    if (!head || head.widest < Math.max(3, w * 0.05)) continue;
    const ratio = (head.bottom - head.top + 1) / head.widest;
    if (ratio < 0.55 || ratio > 2.6) continue;
    const cx = head.cx / w;
    const cy = (head.top + 0.62 * head.widest) / h;
    const centrality =
      Math.exp(-((cx - 0.5) ** 2) / 0.09) * (cy < 0.72 ? 1 : 0.35);
    const score = Math.sqrt(fraction) * centrality;
    if (!best || score > best.face.score)
      best = {
        pixels,
        head,
        face: {
          cx,
          cy,
          w: head.widest / w,
          h: (head.bottom - head.top + 1) / h,
          score,
        },
      };
  }
  if (!best) return null;
  // Hair check: keep only the region's brighter pixels within its head rows and measure again.
  const { pixels, head } = best;
  const inHead = pixels.filter((p) => {
    const y = Math.floor(p / w);
    return y >= head.top && y <= head.bottom;
  });
  const lumas = inHead.map((p) => luma(data, p)).sort((a, b) => a - b);
  const bright = 0.84 * lumas[Math.floor(lumas.length * 0.75)];
  const brighter = inHead.filter((p) => luma(data, p) >= bright);
  const face = measureHead(brighter, w, h, "whole");
  // Accept only the hair pattern: narrower AND starting clearly lower (hair sits on top), so a
  // face lit from one side is not mistaken for a narrower one.
  if (
    face &&
    brighter.length >= 12 &&
    face.widest < head.widest * 0.86 &&
    face.widest >= head.widest * 0.45 &&
    face.top - head.top >= head.widest * 0.15
  ) {
    // Horizontal centre stays with the whole head: bright pixels lean toward the lit side.
    return {
      cx: best.face.cx,
      cy: (face.top + 0.62 * face.widest) / h,
      w: face.widest / w,
      h: (face.bottom - face.top + 1) / h,
      score: best.face.score,
    };
  }
  return best.face;
}

/**
 * Face box from face-mesh landmarks (normalized to the photo), in the same convention as
 * findFace: cx on the facial midline, width cheek to cheek, cy = forehead top + 0.62 × width.
 */
export function faceFromLandmarks(
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
): Face {
  const at = (i: number) => landmarks[i];
  const w = Math.abs(at(454).x - at(234).x);
  const cx = (at(168).x + at(1).x + at(152).x) / 3;
  const cy = (at(10).y * height + 0.62 * w * width) / height;
  return { cx, cy, w, h: Math.abs(at(152).y - at(10).y), score: 1 };
}

/** Source crop that puts the face at VIEW.faceX/faceY with VIEW.faceWidth. Falls back to a centred selfie. */
export function frameFor(
  face: Face | null,
  imageWidth: number,
  imageHeight: number,
): Crop {
  const short = Math.min(imageWidth, imageHeight);
  const faceWidthPx = face ? face.w * imageWidth : 0.4 * short;
  const cxPx = face ? face.cx * imageWidth : imageWidth / 2;
  const cyPx = face ? face.cy * imageHeight : 0.42 * imageHeight;
  let viewW = faceWidthPx / VIEW.faceWidth;
  viewW = Math.min(Math.max(viewW, 0.2 * imageWidth), 4 * imageWidth);
  const viewH = viewW / VIEW.aspect;
  return {
    x: (cxPx - VIEW.faceX * viewW) / imageWidth,
    y: (cyPx - VIEW.faceY * viewH) / imageHeight,
    w: viewW / imageWidth,
    h: viewH / imageHeight,
  };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Distance to the head and to the body (neck + torso): 0 at the centre, 1 on the outline. */
export function bustParts(
  u: number,
  v: number,
): { head: number; body: number } {
  const { head, neck, torso } = BUST;
  const dh = Math.hypot((u - head.cx) / head.rx, (v - head.cy) / head.ry);
  const dn = Math.max(
    Math.abs(u - neck.cx) / neck.hx,
    Math.abs(v - neck.cy) / neck.hy,
  );
  const dt = Math.hypot((u - torso.cx) / torso.rx, (v - torso.cy) / torso.ry);
  return { head: dh, body: Math.min(dn, dt) };
}

/** 0 at the centre of the bust, 1 on its outline, >1 outside (view coordinates, y down). */
export function bustDistance(u: number, v: number): number {
  const d = bustParts(u, v);
  return Math.min(d.head, d.body);
}

/** Fraction of the view pixel that lies inside the source photo, feathered at the photo's own edges. */
export function inPhoto(u: number, v: number, crop: Crop): number {
  const sx = crop.x + u * crop.w;
  const sy = crop.y + v * crop.h;
  const edge = Math.min(sx, 1 - sx, sy, 1 - sy);
  return smoothstep(0, 0.035, edge);
}

function kmeans(samples: number[][], k: number, iterations = 6): number[][] {
  if (!samples.length) return [];
  const centers: number[][] = [];
  for (let i = 0; i < k; i++)
    centers.push(samples[Math.floor(((i + 0.5) * samples.length) / k)].slice());
  const sums = centers.map(() => [0, 0, 0, 0]);
  for (let it = 0; it < iterations; it++) {
    for (const s of sums) s.fill(0);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const acc = sums[bi];
      acc[0] += s[0];
      acc[1] += s[1];
      acc[2] += s[2];
      acc[3]++;
    }
    for (let i = 0; i < centers.length; i++)
      if (sums[i][3])
        centers[i] = [
          sums[i][0] / sums[i][3],
          sums[i][1] / sums[i][3],
          sums[i][2] / sums[i][3],
        ];
  }
  return centers;
}

/**
 * Soft matte for the framed view image: the bust shape, keyed against the photo's own background
 * in the outer ring only (the face core is always kept), feathered at the photo's edges, then blurred.
 */
export function computeMatte(view: Pixels, crop: Crop): Float32Array {
  const { width: w, height: h, data } = view;
  const n = w * h;
  const shape = new Float32Array(n);
  const ring = new Float32Array(n);
  const valid = new Float32Array(n);
  const samples: number[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      const parts = bustParts(u, v);
      const d = Math.min(parts.head, parts.body);
      shape[i] = 1 - smoothstep(0.86, 1.0, d);
      // Hair against a wall is keyed across the head's outer ring; clothes only at the body's rim.
      ring[i] =
        parts.head <= parts.body
          ? smoothstep(0.42, 0.78, parts.head)
          : smoothstep(0.72, 0.95, parts.body);
      valid[i] = inPhoto(u, v, crop);
      if (d > 1.2 && valid[i] > 0.9 && (x + y) % 2 === 0)
        samples.push([
          data[i * 4] / 255,
          data[i * 4 + 1] / 255,
          data[i * 4 + 2] / 255,
        ]);
    }
  }
  const palette = samples.length >= 24 ? kmeans(samples, 4) : [];
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!shape[i] || !valid[i]) continue;
    let key = 1;
    if (palette.length && ring[i] > 0) {
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      let nearest = Infinity;
      for (const c of palette)
        nearest = Math.min(
          nearest,
          Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2),
        );
      key = smoothstep(0.06, 0.16, nearest);
    }
    alpha[i] = shape[i] * valid[i] * (1 - ring[i] * (1 - key));
  }
  return blur(blur(alpha, w, h, 2), w, h, 1);
}

/** Separable box blur with clamped edges. */
export function blur(
  src: Float32Array,
  w: number,
  h: number,
  radius: number,
): Float32Array {
  if (radius < 1) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = sum / size;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = sum / size;
    }
  }
  return out;
}
