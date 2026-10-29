// A 3D head from one front-facing portrait, for the four-sided pyramid. The photo's face mesh
// (MediaPipe's 468 points with their depth) becomes a textured mask, set into a head shape that
// gives real side and back views. What a single photo cannot show (the sides of the head, the back
// of the hair) is a smooth head in the photo's own skin and hair colours, never invented detail.
// Pure math with no DOM, so every piece runs in node tests.

import {
  FACE,
  MESH_POINTS,
  delaunay,
  pointInPolygon,
  smoothstep,
  type Landmark,
} from "../living/geometry.ts";

/** Ellipsoid of the skull in head units (1 = cheek-to-cheek face width), centred on the origin. */
export type Skull = {
  rx: number;
  ry: number;
  rz: number;
  hairline: number;
  nose: number;
};

export type Head = {
  /** Rest positions of the face mask, 468 × xyz, y up, +z toward the viewer. */
  positions: Float32Array;
  /** Texture coordinates into the source photo (v up, for a flipped texture). */
  uvs: Float32Array;
  index: Uint32Array;
  /** How far each face vertex follows the jaw (0..1). */
  jaw: Float32Array;
  /** Upper eyelid vertices, how far each closes, and the lower-lid height it closes to. */
  lids: { i: number; weight: number; target: number }[];
  skull: Skull;
  /** The dark inside of the mouth, revealed when the jaw drops. */
  mouth: { x: number; y: number; z: number; w: number; h: number };
  chin: number;
  /** Iris centres (subject's right, then left), for the scenario's eye light. */
  irises: [number, number, number][];
  /** Maps head (x, y) back to the photo: u = x0 + x * sx, v = y0 - y * sy (both 0..1). */
  photo: { x0: number; y0: number; sx: number; sy: number };
  /** Ellipsoids that make the head shape behind the face: the cranium, then the jaw. */
  parts: {
    center: [number, number, number];
    radii: [number, number, number];
  }[];
};

/** Head views for the pyramid slots, in ghostSlots order (top, right, bottom, left), in degrees
 * of camera orbit. The front faces the viewer at the bottom edge; the viewer at the right edge
 * sees the head's left side, the one at the top sees the back. */
export const PYRAMID_VIEWS = [180, 90, 0, -90] as const;

const INNER_UPPER = new Set<number>([
  ...FACE.upperInnerLip,
  ...FACE.upperOuterLip,
]);
const INNER_LOWER = new Set<number>([
  ...FACE.lowerInnerLip,
  ...FACE.lowerOuterLip,
]);
const CORNERS = new Set<number>([
  FACE.mouthLeft,
  FACE.mouthRight,
  FACE.innerLeft,
  FACE.innerRight,
]);

/**
 * Build the head from normalized landmarks of a W × H photo. Returns null when the face is too
 * small or degenerate to rig.
 */
export function buildHead(lm: Landmark[], W: number, H: number): Head | null {
  if (lm.length < MESH_POINTS) return null;
  const px = (i: number) => lm[i].x * W;
  const py = (i: number) => lm[i].y * H;
  const unit = Math.hypot(
    px(FACE.faceLeft) - px(FACE.faceRight),
    py(FACE.faceLeft) - py(FACE.faceRight),
  );
  if (!(unit > 8)) return null;
  const midX = (px(FACE.faceLeft) + px(FACE.faceRight)) / 2;
  const midY = (py(FACE.forehead) + py(FACE.chin)) / 2;
  // MediaPipe's z uses about the same scale as x; negative is toward the camera.
  const X = (i: number) => (px(i) - midX) / unit;
  const Y = (i: number) => -(py(i) - midY) / unit;
  const Z = (i: number) => (-lm[i].z * W) / unit;

  const top = Y(FACE.forehead) + 0.32;
  const bottom = Y(FACE.chin) + 0.04;
  const ry = (top - bottom) / 2;
  const rz = 0.66;
  const cy = (top + bottom) / 2;
  const cz = Z(FACE.forehead) - 0.04 - rz;

  const n = MESH_POINTS;
  const positions = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = X(i);
    positions[i * 3 + 1] = Y(i) - cy;
    positions[i * 3 + 2] = Z(i) - cz;
    uvs[i * 2] = lm[i].x;
    uvs[i * 2 + 1] = 1 - lm[i].y;
  }
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = positions[i * 3];
    ys[i] = positions[i * 3 + 1];
  }
  const raw = delaunay(xs, ys);
  // Drop the triangles that close the mouth, so the jaw opens onto the dark of the mouth.
  const lips: [number, number][] = [
    ...FACE.upperInnerLip.map((i) => [xs[i], ys[i]] as [number, number]),
    ...[...FACE.lowerInnerLip]
      .reverse()
      .map((i) => [xs[i], ys[i]] as [number, number]),
  ];
  const oval = FACE.oval.map((i) => [xs[i], ys[i]] as [number, number]);
  const kept: number[] = [];
  for (let t = 0; t < raw.length; t += 3) {
    const [a, b, c] = [raw[t], raw[t + 1], raw[t + 2]];
    const gx = (xs[a] + xs[b] + xs[c]) / 3;
    const gy = (ys[a] + ys[b] + ys[c]) / 3;
    if (pointInPolygon(gx, gy, lips)) continue;
    if (!pointInPolygon(gx, gy, oval)) continue; // hull slivers outside the face
    // Counter-clockwise seen from the front.
    const cross =
      (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);
    if (cross >= 0) kept.push(a, b, c);
    else kept.push(a, c, b);
  }

  const lipY = (ys[FACE.lipUpper] + ys[FACE.lipLower]) / 2;
  const jaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (INNER_UPPER.has(i) && !CORNERS.has(i)) continue;
    let w = smoothstep(lipY + 0.005, lipY - 0.04, ys[i]);
    if (INNER_LOWER.has(i)) w = 1;
    if (CORNERS.has(i)) w = 0.4;
    w *= 1 - smoothstep(0.3, 0.5, Math.abs(xs[i]));
    jaw[i] = w;
  }

  const lids: Head["lids"] = [];
  for (const eye of [FACE.rightEye, FACE.leftEye]) {
    const target = eye.lower.reduce((s, i) => s + ys[i], 0) / eye.lower.length;
    for (const i of eye.upper) lids.push({ i, weight: 1, target });
    for (const i of eye.crease) lids.push({ i, weight: 0.35, target });
  }

  const zLip = positions[FACE.lipUpper * 3 + 2];
  const mouthW = Math.abs(xs[FACE.mouthLeft] - xs[FACE.mouthRight]);
  return {
    positions,
    uvs,
    index: Uint32Array.from(kept),
    jaw,
    lids,
    skull: {
      rx: 0.56,
      ry,
      rz,
      hairline: ys[FACE.forehead] - 0.02,
      nose: ys[FACE.noseTip],
    },
    mouth: {
      x: (xs[FACE.mouthLeft] + xs[FACE.mouthRight]) / 2,
      y: lipY - 0.03,
      z: zLip - 0.07,
      w: mouthW * 0.95,
      h: 0.16,
    },
    chin: ys[FACE.chin],
    irises: [FACE.irisRight, FACE.irisLeft].map(
      (i) => [X(i), Y(i) - cy, Z(i) - cz] as [number, number, number],
    ),
    photo: {
      x0: midX / W,
      y0: (midY - cy * unit) / H,
      sx: unit / W,
      sy: unit / H,
    },
    parts: [
      { center: [0, 0, 0], radii: [0.56, ry, rz] },
      // The jaw fills the lower face, so the profile has a chin and jawline rather than a mask edge.
      {
        center: [0, (lipY + ys[FACE.chin]) / 2 + 0.05, 0.12],
        radii: [0.43, Math.max(0.2, (lipY - ys[FACE.chin]) / 2 + 0.2), 0.5],
      },
    ],
  };
}

/** Face vertices for a jaw opening (0..1) and eyelid closure (0..1). */
export function poseFace(
  head: Head,
  open: number,
  blink: number,
  out?: Float32Array,
): Float32Array {
  const p = out ?? new Float32Array(head.positions.length);
  p.set(head.positions);
  if (open > 0) {
    for (let i = 0; i < head.jaw.length; i++) {
      const w = head.jaw[i] * open;
      if (!w) continue;
      p[i * 3 + 1] -= 0.09 * w;
      p[i * 3 + 2] -= 0.03 * w;
    }
  }
  if (blink > 0) {
    for (const { i, weight, target } of head.lids) {
      const y = head.positions[i * 3 + 1];
      p[i * 3 + 1] = y + (target - y) * blink * weight;
    }
  }
  return p;
}

/**
 * Fit a head-shape vertex to the face mask: inside the face it sits just behind the mask, and
 * just outside the face it is drawn forward to meet the mask's edge, so no gap or step shows in
 * profile. Also says how much skin (1) or hair (0) colour it wears where the photo can't see.
 */
export function shapeSkull(
  head: Head,
  x: number,
  y: number,
  z: number,
  front: boolean,
): { z: number; skin: number } {
  const { positions } = head;
  let zOut = z;
  if (front) {
    const oval = FACE.oval.map(
      (i) => [positions[i * 3], positions[i * 3 + 1]] as [number, number],
    );
    if (pointInPolygon(x, y, oval)) {
      let best = Infinity;
      let face = z;
      for (let i = 0; i < MESH_POINTS; i++) {
        const d = (positions[i * 3] - x) ** 2 + (positions[i * 3 + 1] - y) ** 2;
        if (d < best) {
          best = d;
          face = positions[i * 3 + 2];
        }
      }
      // Deeper toward the middle of the face, where nothing of the head can show.
      zOut =
        face - 0.04 - 0.12 * smoothstep(0, 0.12, ovalDistance(head, x, y).d);
    } else {
      const { d, z: edge } = ovalDistance(head, x, y);
      const w = 1 - smoothstep(0, 0.18, d);
      zOut = z + (Math.max(z, edge - 0.03) - z) * w;
    }
  }
  const { skull } = head;
  // Above the nose line the head is hair; below it, skin. The back keeps hair down to the nape.
  const crown = smoothstep(skull.nose - 0.02, skull.nose + 0.12, y);
  const back =
    smoothstep(0.1, -0.3, z) *
    smoothstep(skull.nose - 0.45, skull.nose - 0.1, y);
  return { z: zOut, skin: 1 - Math.max(crown, back) };
}

/** Distance from (x, y) to the nearest face-outline point, and that point's depth. */
function ovalDistance(
  head: Head,
  x: number,
  y: number,
): { d: number; z: number } {
  const p = head.positions;
  let best = Infinity;
  let z = 0;
  for (const i of FACE.oval) {
    const d = (p[i * 3] - x) ** 2 + (p[i * 3 + 1] - y) ** 2;
    if (d < best) {
      best = d;
      z = p[i * 3 + 2];
    }
  }
  return { d: Math.sqrt(best), z };
}
