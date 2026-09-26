// Living portrait geometry: a still portrait becomes a mesh that can blink, talk and turn its head.
// The photo's own pixels are warped, so the result stays as photoreal as the source image.
// Pure math with no DOM, so every piece runs in node tests.

export type Landmark = { x: number; y: number; z: number };

/** MediaPipe Face Mesh indices the rig uses (subject's right eye is on the image's left). */
export const FACE = {
  oval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ],
  upperInnerLip: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lowerInnerLip: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  upperOuterLip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  lowerOuterLip: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  rightEye: {
    upper: [246, 161, 160, 159, 158, 157, 173],
    lower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
    crease: [247, 30, 29, 27, 28, 56, 190],
    brow: [113, 225, 224, 223, 222, 221, 189],
  },
  leftEye: {
    upper: [466, 388, 387, 386, 385, 384, 398],
    lower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
    crease: [467, 260, 259, 257, 258, 286, 414],
    brow: [342, 445, 444, 443, 442, 441, 413],
  },
  forehead: 10,
  chin: 152,
  noseTip: 1,
  faceRight: 234,
  faceLeft: 454,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftOuter: 263,
  eyeLeftInner: 362,
  mouthRight: 61,
  mouthLeft: 291,
  innerRight: 78,
  innerLeft: 308,
  lipUpper: 13,
  lipLower: 14,
  irisRight: 468,
  irisLeft: 473,
} as const;

/** Landmarks 0–467 become mesh vertices; the irises (468–477) are tracked as highlights only. */
export const MESH_POINTS = 468;

export type Pose = {
  /** Radians. Positive yaw turns the face toward the image's right. */
  yaw: number;
  /** Radians. Positive pitch looks up. */
  pitch: number;
  /** Radians. Positive roll tilts clockwise on screen. */
  roll: number;
  /** 0 open … 1 closed, per eye (subject's right eye / left eye). */
  blinkR: number;
  blinkL: number;
  /** 0 closed … 1 fully open mouth. */
  open: number;
  /** 0 … 1 breathing lift. */
  breathe: number;
};

export const REST: Pose = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  blinkR: 0,
  blinkL: 0,
  open: 0,
  breathe: 0,
};

export type Rig = {
  width: number;
  height: number;
  count: number;
  /** x, y, z per vertex, in source pixels (z uses the image-width scale, like MediaPipe). */
  base: Float32Array;
  /** Texture coordinates per vertex (v measured from the image's bottom edge). */
  uv: Float32Array;
  /** How much a vertex follows the head: 1 on the face, falling to 0 at the image border. */
  follow: Float32Array;
  /** Vertical offset at a full blink, per eye. */
  blinkR: Float32Array;
  blinkL: Float32Array;
  /** Offset at a fully open mouth. */
  openX: Float32Array;
  openY: Float32Array;
  /** Upward offset at a full breath. */
  lift: Float32Array;
  /** Down the mouth opening: 0 at the upper jaw's edge … 1 on the lower lip. */
  gap: Float32Array;
  /** Along the mouth opening: 0 at the corner on the image's left … 1 at the other corner. */
  across: Float32Array;
  /** Triangles drawn straight from the photo (the photographed inside of the mouth included). */
  skin: Uint32Array;
  /** The strip that opens between the upper jaw and the lower lip as the jaw drops. */
  mouth: Uint32Array;
  pivot: [number, number, number];
  faceWidth: number;
  faceHeight: number;
  mouthWidth: number;
  eyeWidth: number;
  /** How far the lower lip drops at a fully open mouth, px. */
  drop: number;
  /** Centre of the mouth, px. */
  mouthCenter: [number, number];
  /** 1 when the photo's mouth is closed, so the opening needs drawn teeth; 0 when it shows its own. */
  teeth: number;
  /** Iris centres expressed inside a skin triangle, so highlights follow the warp. */
  irises: { tri: [number, number, number]; w: [number, number, number] }[];
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Delaunay triangulation (Bowyer–Watson). Returns vertex index triples. */
export function delaunay(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): Uint32Array {
  const n = xs.length;
  if (n < 3) return new Uint32Array(0);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]);
    maxY = Math.max(maxY, ys[i]);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1) * 32;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const X = Array.from(xs);
  const Y = Array.from(ys);
  X.push(midX - span, midX, midX + span);
  Y.push(midY - span, midY + span, midY - span);

  type Tri = {
    a: number;
    b: number;
    c: number;
    x: number;
    y: number;
    r: number;
  };
  const circum = (a: number, b: number, c: number): Tri => {
    const ax = X[a],
      ay = Y[a],
      bx = X[b],
      by = Y[b],
      cx = X[c],
      cy = Y[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return { a, b, c, x: 0, y: 0, r: Infinity };
    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { a, b, c, x, y, r: (ax - x) ** 2 + (ay - y) ** 2 };
  };

  let tris: Tri[] = [circum(n, n + 1, n + 2)];
  for (let p = 0; p < n; p++) {
    const px = X[p],
      py = Y[p];
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) {
      if ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r * (1 - 1e-12)) bad.push(t);
      else keep.push(t);
    }
    const edges = new Map<string, [number, number]>();
    const count = new Map<string, number>();
    for (const t of bad) {
      for (const [u, v] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        count.set(key, (count.get(key) || 0) + 1);
        edges.set(key, [u, v]);
      }
    }
    for (const [key, [u, v]] of edges) {
      if (count.get(key) === 1) keep.push(circum(u, v, p));
    }
    tris = keep;
  }
  const out: number[] = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    out.push(t.a, t.b, t.c);
  }
  return Uint32Array.from(out);
}

export function pointInPolygon(
  x: number,
  y: number,
  poly: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function barycentric(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number, number] | null {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const w = 1 - u - v;
  return u >= -1e-6 && v >= -1e-6 && w >= -1e-6 ? [u, v, w] : null;
}

/** Linear interpolation of y along a polyline at x (points sorted by x inside). */
function polylineY(points: [number, number][], x: number): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0][0]) return sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [x0, y0] = sorted[i - 1];
    const [x1, y1] = sorted[i];
    if (x <= x1)
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return sorted[sorted.length - 1][1];
}

/**
 * Build the rig for one portrait. `landmarks` are MediaPipe's normalized landmarks for the
 * source image (x, y in 0..1; z on the width scale), `width`/`height` the source size in px.
 */
export function buildRig(
  landmarks: Landmark[],
  width: number,
  height: number,
): Rig {
  if (landmarks.length < MESH_POINTS)
    throw new Error("need 468 face landmarks");
  const W = width;
  const H = height;
  const px = (i: number) => landmarks[i].x * W;
  const py = (i: number) => landmarks[i].y * H;
  const dist = (a: number, b: number) =>
    Math.hypot(px(a) - px(b), py(a) - py(b));

  const faceWidth = dist(FACE.faceRight, FACE.faceLeft);
  const faceHeight = dist(FACE.forehead, FACE.chin);
  const mouthWidth = dist(FACE.mouthRight, FACE.mouthLeft);
  const eyeWidth =
    (dist(FACE.eyeRightOuter, FACE.eyeRightInner) +
      dist(FACE.eyeLeftOuter, FACE.eyeLeftInner)) /
    2;
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const i of FACE.oval) {
    cx += px(i);
    cy += py(i);
    cz += landmarks[i].z * W;
  }
  cx /= FACE.oval.length;
  cy /= FACE.oval.length;
  cz /= FACE.oval.length;
  const chinY = py(FACE.chin);

  // Depth is flattened: a 2D warp cannot show what a real turn reveals, so the head moves nearly
  // as one piece and the face inside it keeps only a little parallax.
  const PARALLAX = 0.6;
  const pivotZ = cz + faceWidth * 0.35;

  // Vertices: the face mesh, three rings around the face (hair, head edge, neck and shoulders), and
  // the image border, which stays pinned.
  const X: number[] = [];
  const Y: number[] = [];
  const Z: number[] = [];
  const F: number[] = [];
  for (let i = 0; i < MESH_POINTS; i++) {
    X.push(px(i));
    Y.push(py(i));
    Z.push(cz + PARALLAX * (landmarks[i].z * W - cz));
    F.push(1);
  }
  const minGap = Math.max(2, faceWidth * 0.03);
  const tryAdd = (x: number, y: number, z: number, follow: number) => {
    x = clamp(x, 0, W);
    y = clamp(y, 0, H);
    for (let i = MESH_POINTS; i < X.length; i++)
      if (Math.hypot(X[i] - x, Y[i] - y) < minGap) return;
    for (const i of FACE.oval)
      if (Math.hypot(px(i) - x, py(i) - y) < minGap) return;
    X.push(x);
    Y.push(y);
    Z.push(z);
    F.push(follow);
  };
  const rings: [number, number, number, number][] = [
    // scale, follow, depth, keep every nth oval point
    [1.28, 1, cz + faceWidth * 0.08, 1],
    [1.75, 0.6, cz + faceWidth * 0.2, 2],
    [2.4, 0.2, pivotZ, 3],
  ];
  for (const [s, follow, z, every] of rings) {
    FACE.oval.forEach((i, k) => {
      if (k % every) return;
      const x = cx + (px(i) - cx) * s;
      const y = cy + (py(i) - cy) * s;
      // The neck and shoulders turn less than the head.
      tryAdd(x, y, z, y > chinY ? follow * 0.55 : follow);
    });
  }
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    tryAdd(t * W, 0, pivotZ, 0);
    tryAdd(t * W, H, pivotZ, 0);
    tryAdd(0, t * H, pivotZ, 0);
    tryAdd(W, t * H, pivotZ, 0);
  }
  const meshCount = X.length;

  // Triangles. The inside of the mouth as photographed stays with the upper jaw (teeth do not
  // stretch); a strip between it and the lower lip opens as the jaw drops.
  const all = delaunay(X, Y);
  const upperInner = FACE.upperInnerLip as readonly number[];
  const lowerInner = FACE.lowerInnerLip as readonly number[];
  const lipPolygon: [number, number][] = [
    ...upperInner.map((i) => [px(i), py(i)] as [number, number]),
    ...[...lowerInner]
      .reverse()
      .slice(1, -1)
      .map((i) => [px(i), py(i)] as [number, number]),
  ];
  // Upper-jaw copies of the lower inner lip (corners excluded): where the photo's mouth ends.
  const jawCopy = new Map<number, number>();
  for (const i of lowerInner.slice(1, -1)) {
    jawCopy.set(i, X.length);
    X.push(X[i]);
    Y.push(Y[i]);
    Z.push(Z[i]);
    F.push(1);
  }
  const count = X.length;
  const skin: number[] = [];
  for (let t = 0; t < all.length; t += 3) {
    const tri = [all[t], all[t + 1], all[t + 2]];
    const [a, b, c] = tri;
    const area =
      Math.abs((X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a])) /
      2;
    if (area < 1e-6) continue;
    const mx = (X[a] + X[b] + X[c]) / 3;
    const my = (Y[a] + Y[b] + Y[c]) / 3;
    const inside =
      tri.every((v) => upperInner.includes(v) || lowerInner.includes(v)) &&
      pointInPolygon(mx, my, lipPolygon);
    skin.push(...(inside ? tri.map((v) => jawCopy.get(v) ?? v) : tri));
  }
  const gap = new Float32Array(count);
  const mouth: number[] = [];
  const top = lowerInner.map((i) => jawCopy.get(i) ?? i);
  for (let k = 0; k < lowerInner.length - 1; k++) {
    const [s0, s1] = [top[k], top[k + 1]];
    const [l0, l1] = [lowerInner[k], lowerInner[k + 1]];
    if (s0 !== l0) mouth.push(s0, s1, l0);
    if (s1 !== l1) mouth.push(s1, l1, l0);
  }
  for (const i of lowerInner) gap[i] = 1;
  for (const i of jawCopy.values()) gap[i] = 0;
  gap[FACE.innerRight] = gap[FACE.innerLeft] = 0.5;
  const across = new Float32Array(count);
  const leftX = X[FACE.innerRight];
  const spanX = Math.max(1e-6, X[FACE.innerLeft] - leftX);
  for (const i of [...lowerInner, ...jawCopy.values()])
    across[i] = clamp((X[i] - leftX) / spanX, 0, 1);

  // Blink: upper lids close onto the lower lid; creases and brows follow a little.
  type Eye = {
    upper: readonly number[];
    lower: readonly number[];
    crease: readonly number[];
    brow: readonly number[];
  };
  const blinkFor = (eye: Eye) => {
    const dy = new Float32Array(count);
    const lower = eye.lower.map((i) => [px(i), py(i)] as [number, number]);
    const upper = eye.upper.map((i) => [px(i), py(i)] as [number, number]);
    const lash = eyeWidth * 0.035;
    const rise = 0.12; // the lower lid rises this share of the opening
    const upperMove = eye.upper.map((i) => {
      const low = polylineY(lower, px(i));
      const target = low - rise * Math.max(0, low - py(i)) - lash;
      return Math.max(0, target - py(i));
    });
    eye.upper.forEach((i, k) => (dy[i] = upperMove[k]));
    const nearest = (x: number) => {
      let best = 0;
      for (let k = 1; k < upper.length; k++)
        if (Math.abs(upper[k][0] - x) < Math.abs(upper[best][0] - x)) best = k;
      return upperMove[best];
    };
    for (const i of eye.crease) dy[i] = 0.55 * nearest(px(i));
    for (const i of eye.brow) dy[i] = 0.1 * nearest(px(i));
    for (const i of eye.lower.slice(1, -1)) {
      const gap = polylineY(lower, px(i)) - polylineY(upper, px(i));
      dy[i] = -rise * Math.max(0, gap);
    }
    return dy;
  };
  const blinkR = blinkFor(FACE.rightEye);
  const blinkL = blinkFor(FACE.leftEye);

  // Mouth: the jaw drops and the lower lip follows it, evenly across the middle and less toward
  // the corners; the upper lip lifts slightly.
  const openX = new Float32Array(count);
  const openY = new Float32Array(count);
  const drop = mouthWidth * 0.28;
  const mouthX = (px(FACE.lipUpper) + px(FACE.lipLower)) / 2;
  const mouthY = (py(FACE.lipUpper) + py(FACE.lipLower)) / 2;
  const arc = (x: number) => {
    const u = clamp(Math.abs(x - mouthX) / (mouthWidth * 0.5), 0, 1);
    return 0.3 + 0.7 * (1 - u ** 2.5);
  };
  const corners = [
    FACE.innerRight,
    FACE.innerLeft,
    FACE.mouthRight,
    FACE.mouthLeft,
  ] as number[];
  const lower = [...lowerInner, ...FACE.lowerOuterLip];
  const upperLip = [...upperInner, ...FACE.upperOuterLip];
  for (let i = 0; i < meshCount; i++) {
    if (F[i] === 0 || corners.includes(i)) continue; // the border stays pinned
    if (lower.includes(i)) {
      openY[i] = drop * arc(X[i]);
      continue;
    }
    if (upperLip.includes(i)) {
      openY[i] = -drop * 0.06 * arc(X[i]);
      continue;
    }
    const wv = smoothstep(
      mouthY - mouthWidth * 0.05,
      mouthY + mouthWidth * 0.45,
      Y[i],
    );
    const wh =
      1 -
      smoothstep(faceWidth * 0.33, faceWidth * 0.6, Math.abs(X[i] - mouthX));
    const wn =
      Y[i] > chinY
        ? 1 - 0.85 * smoothstep(chinY, chinY + faceHeight * 0.35, Y[i])
        : 1;
    openY[i] = drop * wv * wh * wn;
  }
  for (const [i, inner] of [
    [FACE.innerRight, true],
    [FACE.innerLeft, true],
    [FACE.mouthRight, false],
    [FACE.mouthLeft, false],
  ] as [number, boolean][]) {
    openY[i] = drop * (inner ? 0.28 : 0.22);
    openX[i] = Math.sign(mouthX - X[i]) * mouthWidth * (inner ? 0.03 : 0.04);
  }

  // Breathing lifts the shoulders most and the head a little.
  const lift = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (F[i] === 0) continue;
    lift[i] =
      Y[i] > chinY
        ? 0.35 + 0.65 * smoothstep(chinY, chinY + faceHeight * 0.6, Y[i])
        : 0.35;
  }

  const base = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    base[i * 3] = X[i];
    base[i * 3 + 1] = Y[i];
    base[i * 3 + 2] = Z[i];
    uv[i * 2] = X[i] / W;
    uv[i * 2 + 1] = 1 - Y[i] / H;
  }

  const skinTris = Uint32Array.from(skin);
  const irises: Rig["irises"] = [];
  for (const iris of [FACE.irisRight, FACE.irisLeft]) {
    if (!landmarks[iris]) continue;
    const ix = px(iris),
      iy = py(iris);
    for (let t = 0; t < skinTris.length; t += 3) {
      const [a, b, c] = [skinTris[t], skinTris[t + 1], skinTris[t + 2]];
      const w = barycentric(ix, iy, X[a], Y[a], X[b], Y[b], X[c], Y[c]);
      if (w) {
        irises.push({ tri: [a, b, c], w });
        break;
      }
    }
  }

  // A photo with the mouth already open shows its own teeth; a closed one gets drawn teeth.
  const restGap = dist(FACE.lipUpper, FACE.lipLower) / Math.max(1, mouthWidth);

  return {
    width: W,
    height: H,
    count,
    base,
    uv,
    follow: Float32Array.from(F),
    blinkR,
    blinkL,
    openX,
    openY,
    lift,
    gap,
    across,
    skin: skinTris,
    mouth: Uint32Array.from(mouth),
    pivot: [cx, cy + faceHeight * 0.05, pivotZ],
    faceWidth,
    faceHeight,
    mouthWidth,
    eyeWidth,
    drop,
    mouthCenter: [mouthX, mouthY],
    teeth: restGap < 0.06 ? 1 : 0,
    irises,
  };
}

/**
 * Pose the rig: expressions first (blinks, mouth, breath), then the head turn about a pivot behind
 * the face, blended per vertex so the border stays pinned. Writes x, y pairs into `out`.
 */
export function posePoints(
  rig: Rig,
  pose: Pose,
  out?: Float32Array,
): Float32Array {
  const n = rig.count;
  const result = out && out.length >= n * 2 ? out : new Float32Array(n * 2);
  const [cx, cy, cz] = rig.pivot;
  const cyaw = Math.cos(pose.yaw),
    syaw = Math.sin(pose.yaw);
  const cpit = Math.cos(pose.pitch),
    spit = Math.sin(pose.pitch);
  const crol = Math.cos(pose.roll),
    srol = Math.sin(pose.roll);
  const breath = pose.breathe * rig.faceHeight * 0.012;
  for (let i = 0; i < n; i++) {
    const bx = rig.base[i * 3];
    const by = rig.base[i * 3 + 1];
    const bz = rig.base[i * 3 + 2];
    const x = bx + pose.open * rig.openX[i];
    const y =
      by +
      pose.blinkR * rig.blinkR[i] +
      pose.blinkL * rig.blinkL[i] +
      pose.open * rig.openY[i] -
      breath * rig.lift[i];
    // yaw (about the vertical axis), then pitch, then roll in the image plane
    const dx = x - cx;
    const dy = y - cy;
    const dz = bz - cz;
    const x1 = dx * cyaw - dz * syaw;
    const z1 = dx * syaw + dz * cyaw;
    const y2 = dy * cpit + z1 * spit;
    const x3 = x1 * crol - y2 * srol;
    const y3 = x1 * srol + y2 * crol;
    const f = rig.follow[i];
    result[i * 2] = x + f * (cx + x3 - x);
    result[i * 2 + 1] = y + f * (cy + y3 - y);
  }
  return result;
}

/** Where the iris centres sit in the posed mesh. */
export function irisPoints(rig: Rig, posed: Float32Array): [number, number][] {
  return rig.irises.map(({ tri, w }) => [
    w[0] * posed[tri[0] * 2] +
      w[1] * posed[tri[1] * 2] +
      w[2] * posed[tri[2] * 2],
    w[0] * posed[tri[0] * 2 + 1] +
      w[1] * posed[tri[1] * 2 + 1] +
      w[2] * posed[tri[2] * 2 + 1],
  ]);
}
