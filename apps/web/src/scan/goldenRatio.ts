// Golden-ratio (Φ) facial mapping from MediaPipe face-mesh landmarks. Pure functions: no DOM, no
// network, unit-tested in Node. Distances are measured on the photo and converted to centimetres
// using the iris as a ruler (the visible iris is about 11.7 mm across in most adults), so every
// number shown is an estimate from the user's own face, labeled "calculated / target".

export const PHI = 1.618;
export const IRIS_MM = 11.7;

export type Point = { x: number; y: number };

/** Landmark indices in the MediaPipe face mesh (478 points with refined irises). */
export const LM = {
  hairline: 10,
  chin: 152,
  faceRight: 234,
  faceLeft: 454,
  noseBridge: 168,
  noseTip: 1,
  noseBase: 2,
  noseRight: 129,
  noseLeft: 358,
  lipTop: 0,
  lipUpperInner: 13,
  lipLowerInner: 14,
  lipBottom: 17,
  mouthRight: 61,
  mouthLeft: 291,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  jawRight: 172,
  jawLeft: 397,
  irisRight: 468,
  irisLeft: 473,
  irisRightA: 469,
  irisRightB: 471,
  irisLeftA: 474,
  irisLeftB: 476,
} as const;

export type Distance = {
  key: string;
  label: string;
  a: number;
  b: number;
  px: number;
  cm: number;
};

export type Ratio = {
  key: string;
  label: string;
  value: number;
  target: number;
  /** Landmark the callout points at. */
  anchor: number;
  formula: string;
};

export type Mapping = {
  cmPerPx: number;
  distances: Record<string, Distance>;
  ratios: Ratio[];
};

const DISTANCES: [string, string, number, number][] = [
  ["faceWidth", "Full facial width", LM.faceRight, LM.faceLeft],
  ["faceHeight", "Face height", LM.hairline, LM.chin],
  [
    "innerCanthal",
    "Inner-canthal distance (d1)",
    LM.eyeRightInner,
    LM.eyeLeftInner,
  ],
  [
    "hairlineToBridge",
    "Hairline to nose bridge (d2)",
    LM.hairline,
    LM.noseBridge,
  ],
  ["bridgeToBase", "Nose bridge to nose base (d3)", LM.noseBridge, LM.noseBase],
  ["baseToChin", "Nose base to chin (d4)", LM.noseBase, LM.chin],
  ["rightEye", "Right eye aperture", LM.eyeRightOuter, LM.eyeRightInner],
  ["leftEye", "Left eye aperture", LM.eyeLeftInner, LM.eyeLeftOuter],
  ["upperLip", "Upper lip height", LM.lipTop, LM.lipUpperInner],
  ["lowerLip", "Lower lip height", LM.lipLowerInner, LM.lipBottom],
  ["mouthWidth", "Mouth width", LM.mouthRight, LM.mouthLeft],
  ["noseWidth", "Nose width", LM.noseRight, LM.noseLeft],
  ["jawWidth", "Jaw width", LM.jawRight, LM.jawLeft],
  ["interpupillary", "Interpupillary distance", LM.irisRight, LM.irisLeft],
];

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/**
 * Measure a face. `landmarks` are normalized to the photo (x, y in 0..1) and the photo is
 * `width` x `height` pixels. Returns null when the irises are missing (no ruler).
 */
export function mapFace(
  landmarks: Point[],
  width: number,
  height: number,
): Mapping | null {
  if (landmarks.length < 478) return null;
  const px = (a: number, b: number) =>
    Math.hypot(
      (landmarks[a].x - landmarks[b].x) * width,
      (landmarks[a].y - landmarks[b].y) * height,
    );
  const iris =
    (px(LM.irisRightA, LM.irisRightB) + px(LM.irisLeftA, LM.irisLeftB)) / 2;
  if (!(iris > 0.5)) return null;
  const cmPerPx = IRIS_MM / 10 / iris;
  const distances: Record<string, Distance> = {};
  for (const [key, label, a, b] of DISTANCES) {
    const d = px(a, b);
    distances[key] = { key, label, a, b, px: d, cm: round(d * cmPerPx, 1) };
  }
  const ratio = (n: string, d: string) =>
    distances[d].px > 0 ? round(distances[n].px / distances[d].px, 3) : 0;
  const ratios: Ratio[] = [
    {
      key: "faceRectangle",
      label: "Full face Φ rectangle",
      value: ratio("faceHeight", "faceWidth"),
      target: PHI,
      anchor: LM.faceLeft,
      formula: "height / width",
    },
    {
      key: "thirdsUpper",
      label: "d2 / d3",
      value: ratio("hairlineToBridge", "bridgeToBase"),
      target: PHI,
      anchor: LM.noseBridge,
      formula: "hairline→bridge / bridge→base",
    },
    {
      key: "thirdsLower",
      label: "d4 / d3",
      value: ratio("baseToChin", "bridgeToBase"),
      target: PHI,
      anchor: LM.noseBase,
      formula: "base→chin / bridge→base",
    },
    {
      key: "lips",
      label: "Lip Φ ratio",
      value: ratio("lowerLip", "upperLip"),
      target: PHI,
      anchor: LM.lipBottom,
      formula: "lower / upper lip",
    },
    {
      key: "mouthNose",
      label: "Mouth to nose width",
      value: ratio("mouthWidth", "noseWidth"),
      target: PHI,
      anchor: LM.mouthLeft,
      formula: "mouth / nose width",
    },
    {
      key: "jawMouth",
      label: "Mandibular contour & Φ",
      value: ratio("jawWidth", "mouthWidth"),
      target: PHI,
      anchor: LM.jawLeft,
      formula: "jaw / mouth width",
    },
    {
      key: "widthIpd",
      label: "Facial width & Φ",
      value: ratio("faceWidth", "interpupillary"),
      target: 2 * PHI - 1,
      anchor: LM.faceRight,
      formula: "width / interpupillary",
    },
  ];
  return { cmPerPx, distances, ratios };
}

/** How close a ratio is to its target, 0..100 (100 = on target). Display only, never a score of a person. */
export function closeness(value: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(value)) return 0;
  const off = Math.abs(value - target) / target;
  return Math.max(0, Math.round(100 * (1 - off)));
}

/** What the future projection is based on: the seven ratio numbers only, never pixels or the photo. */
export function projectionInput(mapping: Mapping): Record<string, number> {
  return Object.fromEntries(mapping.ratios.map((r) => [r.key, r.value]));
}
