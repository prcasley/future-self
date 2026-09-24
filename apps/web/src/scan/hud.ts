// Layout for the golden-ratio scan HUD: which callouts to show, where their boxes go, and the
// golden spiral. Pure functions (no DOM), unit-tested in Node.

import { LM, PHI, type Mapping, type Ratio } from "./goldenRatio.ts";

/**
 * The scan view in SVG units. The photo's 4:5 portrait area (pw wide) sits inside it: centred in a
 * landscape stage on wide screens (callouts beside the face), filling a 4:5 stage on phones
 * (numbered markers on the face, the readings listed underneath).
 */
export type Geometry = {
  wide: boolean;
  vw: number;
  vh: number;
  pw: number;
  px: number;
  py: number;
};
export const WIDE: Geometry = {
  wide: true,
  vw: 1600,
  vh: 1125,
  pw: 900,
  px: 350,
  py: 0,
};
export const NARROW: Geometry = {
  wide: false,
  vw: 1000,
  vh: 1250,
  pw: 1000,
  px: 0,
  py: 0,
};

/** A point normalized to the portrait area (0..1) in view units. */
export function toStage(g: Geometry, p: { x: number; y: number }) {
  return { x: g.px + p.x * g.pw, y: g.py + p.y * g.pw * 1.25 };
}

// Timeline (ms from opening).
export const CALLOUTS = 3700;
export const STEP = 300;

export type Callout = {
  key: string;
  title: string;
  anchor: number;
  side: "left" | "right";
  lines: string[];
  ratio?: Ratio;
};

export type Placed = Callout & {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  delay: number;
};

const fmt = (v: number, digits = 2) => v.toFixed(digits);

/** Twelve labeled callouts (six on a phone), in the style of a facial-mapping chart. */
export function buildCallouts(mapping: Mapping, compact: boolean): Callout[] {
  const d = mapping.distances;
  const r = Object.fromEntries(mapping.ratios.map((x) => [x.key, x]));
  const ratioLine = (x: Ratio) => `${fmt(x.value)} / Φ ${fmt(x.target, 3)}`;
  const cm = (key: string) => `${fmt(d[key].cm, 1)} cm`;
  const all: (Callout & { compact: boolean })[] = [
    {
      key: "faceRectangle",
      title: "FULL FACE Φ RECTANGLE",
      anchor: LM.faceRight,
      side: "left",
      lines: ["height / width", ratioLine(r.faceRectangle)],
      ratio: r.faceRectangle,
      compact: true,
    },
    {
      key: "innerCanthal",
      title: "INNER-CANTHAL DISTANCE (d1)",
      anchor: LM.eyeRightInner,
      side: "left",
      lines: [cm("innerCanthal")],
      compact: true,
    },
    {
      key: "rightEye",
      title: "RIGHT EYE APERTURE",
      anchor: LM.eyeRightOuter,
      side: "left",
      lines: [cm("rightEye")],
      compact: false,
    },
    {
      key: "upperLip",
      title: "UPPER LIP HEIGHT",
      anchor: LM.lipTop,
      side: "left",
      lines: [cm("upperLip")],
      compact: false,
    },
    {
      key: "lips",
      title: "LIP Φ RATIO",
      anchor: LM.lipBottom,
      side: "left",
      lines: ["lower / upper", ratioLine(r.lips)],
      ratio: r.lips,
      compact: true,
    },
    {
      key: "jawMouth",
      title: "MANDIBULAR CONTOUR & Φ",
      anchor: LM.jawRight,
      side: "left",
      lines: ["jaw / mouth width", ratioLine(r.jawMouth)],
      ratio: r.jawMouth,
      compact: false,
    },
    {
      key: "widthIpd",
      title: "FULL FACIAL WIDTH",
      anchor: LM.faceLeft,
      side: "right",
      lines: [cm("faceWidth"), `÷ pupils ${ratioLine(r.widthIpd)}`],
      ratio: r.widthIpd,
      compact: false,
    },
    {
      key: "hairline",
      title: "HAIRLINE TO NOSE BRIDGE (d2)",
      anchor: LM.hairline,
      side: "right",
      lines: [cm("hairlineToBridge")],
      compact: true,
    },
    {
      key: "leftEye",
      title: "LEFT EYE APERTURE",
      anchor: LM.eyeLeftOuter,
      side: "right",
      lines: [cm("leftEye")],
      compact: false,
    },
    {
      key: "thirdsUpper",
      title: "NOSE BRIDGE TO BASE (d3)",
      anchor: LM.noseBridge,
      side: "right",
      lines: [cm("bridgeToBase"), `d2/d3 ${ratioLine(r.thirdsUpper)}`],
      ratio: r.thirdsUpper,
      compact: true,
    },
    {
      key: "mouthNose",
      title: "MOUTH TO NOSE WIDTH",
      anchor: LM.noseLeft,
      side: "right",
      lines: ["mouth / nose width", ratioLine(r.mouthNose)],
      ratio: r.mouthNose,
      compact: false,
    },
    {
      key: "thirdsLower",
      title: "NOSE BASE TO CHIN (d4)",
      anchor: LM.chin,
      side: "right",
      lines: [cm("baseToChin"), `d4/d3 ${ratioLine(r.thirdsLower)}`],
      ratio: r.thirdsLower,
      compact: true,
    },
  ];
  return all
    .filter((c) => !compact || c.compact)
    .map(({ compact: _, ...c }) => c);
}

/** Text metrics shared by the layout and the renderer. */
export function metrics(g: Geometry) {
  return g.wide
    ? {
        width: 460,
        lineH: 31,
        pad: 18,
        gap: 14,
        top: 206,
        bottom: g.vh - 16,
        margin: 18,
        label: 20,
        value: 23,
      }
    : {
        width: 300,
        lineH: 28,
        pad: 16,
        gap: 12,
        top: 250,
        bottom: g.vh - 20,
        margin: 18,
        label: 18,
        value: 21,
      };
}

/**
 * Stack callouts in two columns beside the face, each near its anchor's height, without overlaps
 * and inside the view. Ratio callouts keep a row for the future projection.
 */
export function place(
  callouts: Callout[],
  view: { x: number; y: number }[],
  g: Geometry,
): Placed[] {
  const m = metrics(g);
  const out: Placed[] = [];
  for (const side of ["left", "right"] as const) {
    const group = callouts
      .filter((c) => c.side === side)
      .map((c) => {
        const a = toStage(g, view[c.anchor]);
        return {
          ...c,
          ax: a.x,
          ay: a.y,
          h: m.pad + m.lineH * (c.lines.length + 1 + (c.ratio ? 1 : 0)),
        };
      })
      .sort((a, b) => a.ay - b.ay);
    let y = m.top;
    const ys = group.map((c) => {
      y = Math.max(y, c.ay - c.h / 2);
      const at = y;
      y += c.h + m.gap;
      return at;
    });
    // Pull the column back up if it runs past the bottom, using the slack between boxes.
    let over = y - m.gap - m.bottom;
    for (let i = group.length - 1; i >= 0 && over > 0; i--) {
      const room =
        i === 0 ? ys[0] - m.top : ys[i] - (ys[i - 1] + group[i - 1].h + m.gap);
      const shift = Math.min(over, Math.max(0, room));
      for (let j = i; j < group.length; j++) ys[j] -= shift;
      over -= shift;
    }
    group.forEach((c, i) =>
      out.push({
        ...c,
        w: m.width,
        x: side === "left" ? m.margin : g.vw - m.margin - m.width,
        y: ys[i],
        delay: 0,
      }),
    );
  }
  out.sort((a, b) => a.ay - b.ay);
  out.forEach((c, i) => (c.delay = CALLOUTS + i * STEP));
  return out;
}

/**
 * A golden spiral: squares carved from a golden rectangle, one quarter arc per square, fitted
 * inside the face box. Built landscape, then rotated a quarter turn to stand upright.
 */
export function spiral(fx: number, fy: number, fw: number, fh: number): string {
  const S = fh / fw > PHI ? fw : fh / PHI; // short side of the fitted rectangle
  const L = S * PHI;
  const x0 = fx + (fw - S) / 2;
  const y0 = fy + (fh - L) / 2;
  const at = (u: number, v: number) =>
    `${(x0 + S - v).toFixed(1)} ${(y0 + u).toFixed(1)}`;
  let rx = 0;
  let ry = 0;
  let rw = L;
  let rh = S;
  let d = "";
  for (let k = 0; k < 9; k++) {
    let start: [number, number];
    let end: [number, number];
    let s: number;
    switch (k % 4) {
      case 0: // left square
        s = rh;
        start = [rx, ry + s];
        end = [rx + s, ry];
        rx += s;
        rw -= s;
        break;
      case 1: // top square
        s = rw;
        start = [rx, ry];
        end = [rx + s, ry + s];
        ry += s;
        rh -= s;
        break;
      case 2: // right square
        s = rh;
        start = [rx + rw, ry];
        end = [rx + rw - s, ry + s];
        rw -= s;
        break;
      default: // bottom square
        s = rw;
        start = [rx + s, ry + rh];
        end = [rx, ry + rh - s];
        rh -= s;
    }
    if (s < 1.5) break;
    if (!d) d = `M ${at(...start)}`;
    d += ` A ${s.toFixed(1)} ${s.toFixed(1)} 0 0 1 ${at(...end)}`;
  }
  return d;
}

export type Badge = Callout & {
  n: number;
  ax: number;
  ay: number;
  x: number;
  y: number;
  delay: number;
};

/**
 * Phone layout: a numbered badge per reading in the gutters beside the face, at its anchor's
 * height (pushed apart when two would touch). The readings themselves are listed below the view.
 */
export function badges(
  callouts: Callout[],
  view: { x: number; y: number }[],
  g: Geometry,
  r = 28,
  top = 0,
): Badge[] {
  const left = toStage(g, view[LM.faceRight]).x - r * 2.2;
  const right = toStage(g, view[LM.faceLeft]).x + r * 2.2;
  const out = callouts
    .map((c) => {
      const a = toStage(g, view[c.anchor]);
      return {
        ...c,
        ax: a.x,
        ay: a.y,
        x: Math.min(
          g.vw - r - 4,
          Math.max(r + 4, c.side === "left" ? left : right),
        ),
        y: a.y,
        n: 0,
        delay: 0,
      };
    })
    .sort((a, b) => a.ay - b.ay);
  for (const side of ["left", "right"] as const) {
    let last = top + r - (r * 2 + 10);
    for (const b of out.filter((x) => x.side === side)) {
      b.y = Math.max(b.y, last + r * 2 + 10);
      last = b.y;
    }
  }
  out.forEach((b, i) => {
    b.n = i + 1;
    b.delay = CALLOUTS + i * STEP;
  });
  return out;
}

/** When the future appears and when the projected face starts to morph, for a layout. */
export function timeline(count: number) {
  const last = CALLOUTS + Math.max(0, count - 1) * STEP;
  return { last, future: last + 700, morph: last + 1200 };
}
