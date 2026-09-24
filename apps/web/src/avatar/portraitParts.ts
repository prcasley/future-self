// Original, procedurally drawn wardrobe for the portrait projection. Nothing is loaded from the
// network and nothing copies a game asset or a brand mark: every piece is canvas paths.
//
// World layout (Three.js units) shared with PortraitAvatar: the portrait plane is 1.6 x 2.0,
// centred on the origin; view (u, v) maps to x = (u - 0.5) * 1.6, y = (0.5 - v) * 2.0.

export type PartSpec = {
  /** Plane size in world units and its centre. */
  size: [number, number];
  center: [number, number, number];
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Canvas pixels per world unit. */
  density: number;
  /** "tint" parts are drawn in white and coloured by the aura in the shader. */
  colour: "fixed" | "tint";
  blend: "normal" | "additive";
  /** Fade the lower edge into the projector beam. */
  fade?: boolean;
};

const GOLD = "#e7c36a";
const GOLD_DEEP = "#8a6420";

function goldStroke(ctx: CanvasRenderingContext2D, width: number, glow = true) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD_DEEP;
  ctx.lineWidth = width + 2;
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = width;
  if (glow) {
    ctx.shadowColor = "rgba(255, 214, 120, 0.75)";
    ctx.shadowBlur = width * 3;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Metallic sheen: a lit spot fading into obsidian. */
function sheen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r * 0.05, x, y + r * 0.2, r);
  g.addColorStop(0, "#7a5aa3");
  g.addColorStop(0.3, "#3b2757");
  g.addColorStop(0.7, "#1a1029");
  g.addColorStop(1, "#08050e");
  return g;
}

function bezierPoint(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const u = 1 - t;
  return (
    u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
  );
}

// Pauldron outline in local pixels (500 per unit) for the right shoulder: origin at the neck
// side of the shoulder, x outward, y down. Dome rim and the two lames below it.
const DOME_TOP = [40, 70, 60, -5, 250, -20, 318, 120] as const;
const DOME_RIM = [318, 120, 250, 95, 130, 90, 40, 104] as const;
const lame = (i: number) => {
  const dy = 30 * i;
  return {
    top: [66, 88 + dy, 140, 100 + dy, 240, 112 + dy * 1.1, 302, 146 + dy * 1.2],
    bottom: [
      292,
      176 + dy * 1.2,
      232,
      140 + dy * 1.1,
      140,
      128 + dy,
      60,
      116 + dy,
    ],
  };
};

function pauldron(ctx: CanvasRenderingContext2D) {
  for (let i = 2; i >= 1; i--) {
    const { top, bottom } = lame(i);
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.bezierCurveTo(top[2], top[3], top[4], top[5], top[6], top[7]);
    ctx.lineTo(bottom[0], bottom[1]);
    ctx.bezierCurveTo(
      bottom[2],
      bottom[3],
      bottom[4],
      bottom[5],
      bottom[6],
      bottom[7],
    );
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top[1], 0, bottom[1] + 20);
    g.addColorStop(0, "#44305f");
    g.addColorStop(0.5, "#1c1230");
    g.addColorStop(1, "#09060f");
    ctx.fillStyle = g;
    ctx.fill();
    goldStroke(ctx, 1.4, false);
  }
  ctx.beginPath();
  ctx.moveTo(DOME_TOP[0], DOME_TOP[1]);
  ctx.bezierCurveTo(
    DOME_TOP[2],
    DOME_TOP[3],
    DOME_TOP[4],
    DOME_TOP[5],
    DOME_TOP[6],
    DOME_TOP[7],
  );
  ctx.bezierCurveTo(
    DOME_RIM[2],
    DOME_RIM[3],
    DOME_RIM[4],
    DOME_RIM[5],
    DOME_RIM[6],
    DOME_RIM[7],
  );
  ctx.closePath();
  ctx.fillStyle = sheen(ctx, 150, 22, 190);
  ctx.fill();
  goldStroke(ctx, 2.2);
  // Ridge along the dome, then a soft specular streak.
  ctx.beginPath();
  ctx.moveTo(84, 46);
  ctx.bezierCurveTo(150, 8, 238, 18, 296, 96);
  goldStroke(ctx, 1.1, false);
  ctx.beginPath();
  ctx.ellipse(150, 34, 70, 12, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 240, 255, 0.12)";
  ctx.fill();
  for (const t of [0.18, 0.38, 0.58, 0.78]) {
    ctx.beginPath();
    ctx.arc(
      bezierPoint(
        t,
        ...([DOME_RIM[0], DOME_RIM[2], DOME_RIM[4], DOME_RIM[6]] as const),
      ),
      bezierPoint(
        t,
        ...([DOME_RIM[1], DOME_RIM[3], DOME_RIM[5], DOME_RIM[7]] as const),
      ) - 7,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = GOLD;
    ctx.fill();
  }
}

function pauldronSeams(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 2.4;
  for (const i of [1, 2]) {
    const { bottom } = lame(i);
    ctx.beginPath();
    ctx.moveTo(bottom[0] - 6, bottom[1] - 6);
    ctx.bezierCurveTo(
      bottom[2],
      bottom[3] - 6,
      bottom[4],
      bottom[5] - 6,
      bottom[6] + 8,
      bottom[7] - 6,
    );
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(DOME_RIM[0] - 10, DOME_RIM[1] - 4);
  ctx.bezierCurveTo(
    DOME_RIM[2],
    DOME_RIM[3] - 4,
    DOME_RIM[4],
    DOME_RIM[5] - 4,
    DOME_RIM[6] + 10,
    DOME_RIM[7] - 4,
  );
  ctx.stroke();
}

const ARMOR_BOX = { x0: -1.05, x1: 1.05, y0: -1.15, y1: -0.2 };

function toArmor(x: number, y: number, density: number): [number, number] {
  return [(x - ARMOR_BOX.x0) * density, (ARMOR_BOX.y1 - y) * density];
}

function gorgetPath(ctx: CanvasRenderingContext2D, d: number) {
  const [cx] = toArmor(0, 0, d);
  const [, top] = toArmor(0, -0.3, d);
  ctx.beginPath();
  ctx.moveTo(cx - 0.3 * d, top);
  ctx.quadraticCurveTo(cx, top + 0.2 * d, cx + 0.3 * d, top);
  ctx.lineTo(cx + 0.36 * d, top + 0.07 * d);
  ctx.quadraticCurveTo(cx, top + 0.3 * d, cx - 0.36 * d, top + 0.07 * d);
  ctx.closePath();
}

function breastplatePath(ctx: CanvasRenderingContext2D, d: number) {
  const [cx] = toArmor(0, 0, d);
  const [, top] = toArmor(0, -0.46, d);
  const [, bottom] = toArmor(0, -1.15, d);
  ctx.beginPath();
  ctx.moveTo(cx - 0.3 * d, top);
  ctx.quadraticCurveTo(cx, top + 0.08 * d, cx + 0.3 * d, top);
  ctx.bezierCurveTo(
    cx + 0.4 * d,
    top + 0.2 * d,
    cx + 0.34 * d,
    top + 0.46 * d,
    cx + 0.24 * d,
    bottom,
  );
  ctx.lineTo(cx - 0.24 * d, bottom);
  ctx.bezierCurveTo(
    cx - 0.34 * d,
    top + 0.46 * d,
    cx - 0.4 * d,
    top + 0.2 * d,
    cx - 0.3 * d,
    top,
  );
  ctx.closePath();
}

function sigil(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x, y - r * 0.72);
  ctx.lineTo(x + r * 0.34, y);
  ctx.lineTo(x, y + r * 0.72);
  ctx.lineTo(x - r * 0.34, y);
  ctx.closePath();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    ctx.moveTo(x + Math.cos(a) * r * 1.12, y + Math.sin(a) * r * 1.12);
    ctx.lineTo(x + Math.cos(a) * r * 1.42, y + Math.sin(a) * r * 1.42);
  }
}

/** Monarch set: sheened obsidian pauldrons, gorget, and tapered breastplate with gold trim. */
function drawArmor(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  d: number,
) {
  const [cx] = toArmor(0, 0, d);
  const [, top] = toArmor(0, -0.46, d);
  breastplatePath(ctx, d);
  const chest = ctx.createLinearGradient(cx - 0.38 * d, 0, cx + 0.38 * d, 0);
  chest.addColorStop(0, "#07040c");
  chest.addColorStop(0.32, "#261838");
  chest.addColorStop(0.5, "#3b2856");
  chest.addColorStop(0.68, "#261838");
  chest.addColorStop(1, "#07040c");
  ctx.fillStyle = chest;
  ctx.fill();
  goldStroke(ctx, 1.8);
  ctx.beginPath();
  ctx.moveTo(cx - 0.2 * d, top + 0.17 * d);
  ctx.quadraticCurveTo(cx - 0.08 * d, top + 0.25 * d, cx, top + 0.21 * d);
  ctx.quadraticCurveTo(
    cx + 0.08 * d,
    top + 0.25 * d,
    cx + 0.2 * d,
    top + 0.17 * d,
  );
  goldStroke(ctx, 1, false);
  sigil(ctx, cx, toArmor(0, -0.76, d)[1], 0.065 * d);
  goldStroke(ctx, 1.6);
  gorgetPath(ctx, d);
  ctx.fillStyle = sheen(ctx, cx - 0.08 * d, toArmor(0, -0.33, d)[1], 0.36 * d);
  ctx.fill();
  goldStroke(ctx, 2);
  for (const side of [1, -1]) {
    ctx.save();
    const [px, py] = toArmor(side * 0.19, -0.37, d);
    ctx.translate(px, py);
    ctx.scale(side * (d / 500) * 1.08, (d / 500) * 1.08);
    pauldron(ctx);
    ctx.restore();
  }
}

/** Glowing seams and gems for the monarch set, in white (the aura colours them). */
function drawArmorGlow(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  d: number,
) {
  const [cx] = toArmor(0, 0, d);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 10;
  for (const side of [1, -1]) {
    ctx.save();
    const [px, py] = toArmor(side * 0.19, -0.37, d);
    ctx.translate(px, py);
    ctx.scale(side * (d / 500) * 1.08, (d / 500) * 1.08);
    pauldronSeams(ctx);
    ctx.restore();
  }
  const gem = (y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, y - h);
    ctx.lineTo(cx + w, y);
    ctx.lineTo(cx, y + h);
    ctx.lineTo(cx - w, y);
    ctx.closePath();
    ctx.fill();
  };
  gem(toArmor(0, -0.43, d)[1], 0.028 * d, 0.042 * d);
  gem(toArmor(0, -0.76, d)[1], 0.022 * d, 0.046 * d);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, toArmor(0, -0.86, d)[1]);
  ctx.lineTo(cx, toArmor(0, -1.1, d)[1]);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

const MANTLE_BOX = { x0: -1.05, x1: 1.05, y0: -1.15, y1: 0.05 };

/** High standing collar behind the neck that sweeps over the shoulders and fades out. */
function drawMantle(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  d: number,
) {
  const X = (x: number) => (x - MANTLE_BOX.x0) * d;
  const Y = (y: number) => (MANTLE_BOX.y1 - y) * d;
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(X(s * 0.19), Y(-0.4));
    ctx.quadraticCurveTo(X(s * 0.22), Y(-0.12), X(s * 0.34), Y(-0.02));
    ctx.quadraticCurveTo(X(s * 0.46), Y(-0.3), X(s * 0.9), Y(-0.52));
    ctx.quadraticCurveTo(X(s * 1.02), Y(-0.62), X(s * 0.96), Y(-0.92));
    ctx.lineTo(X(s * 0.46), Y(-0.92));
    ctx.quadraticCurveTo(X(s * 0.24), Y(-0.7), X(s * 0.19), Y(-0.4));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Y(0), 0, Y(-0.92));
    g.addColorStop(0, "rgba(46, 26, 72, 1)");
    g.addColorStop(0.55, "rgba(22, 12, 36, 0.95)");
    g.addColorStop(1, "rgba(7, 4, 12, 0)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(X(s * 0.19), Y(-0.4));
    ctx.quadraticCurveTo(X(s * 0.22), Y(-0.12), X(s * 0.34), Y(-0.02));
    ctx.quadraticCurveTo(X(s * 0.46), Y(-0.3), X(s * 0.9), Y(-0.52));
    goldStroke(ctx, 1.8);
  }
}

/** Crown-like ring of light that sits behind the head: original ticks, rays, and diamonds. */
function drawHalo(ctx: CanvasRenderingContext2D, w: number) {
  const c = w / 2;
  const R = w * 0.383;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = w * 0.03;
  ctx.lineWidth = w * 0.006;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = w * 0.002;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.93, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const long = k % 6 === 0;
    const r0 = R * 1.02;
    const r1 = R * (long ? 1.12 : 1.05);
    ctx.lineWidth = w * (long ? 0.004 : 0.002);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const g = ctx.createLinearGradient(
      c + Math.cos(a) * R * 1.08,
      c + Math.sin(a) * R * 1.08,
      c + Math.cos(a) * R * 1.3,
      c + Math.sin(a) * R * 1.3,
    );
    g.addColorStop(0, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = w * 0.003;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 1.08, c + Math.sin(a) * R * 1.08);
    ctx.lineTo(c + Math.cos(a) * R * 1.3, c + Math.sin(a) * R * 1.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 - Math.PI / 2;
    const x = c + Math.cos(a) * R;
    const y = c + Math.sin(a) * R;
    const s = w * 0.016;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.6, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.6, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGlow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(
    w / 2,
    h * 0.42,
    0,
    w / 2,
    h * 0.42,
    w / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Projector beam: narrow at the emitter, opening upward, with faint streaks. */
function drawBeam(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h);
  ctx.lineTo(w * 0.66, h);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  for (let k = 1; k < 12; k++) {
    const t = k / 12;
    ctx.beginPath();
    ctx.moveTo(w * (0.34 + 0.32 * t), h);
    ctx.lineTo(w * t, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawSprite(ctx: CanvasRenderingContext2D, w: number) {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

/** Neutral stand-in bust in the portrait view layout, used before a photo is chosen. */
export function drawNeutralBust(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#c9dcf5");
  g.addColorStop(0.55, "#7d97bb");
  g.addColorStop(1, "#2d3f5c");
  ctx.fillStyle = g;
  ctx.filter = `blur(${Math.round(w * 0.012)}px)`;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.35, w * 0.21, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.41, h * 0.5, w * 0.18, h * 0.24);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 1.08, w * 0.52, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
}

export const OUTFITS = ["casual", "monarch"] as const;
export type Outfit = (typeof OUTFITS)[number];

export function outfitOf(value: string | null | undefined): Outfit {
  return (OUTFITS as readonly string[]).includes(value || "")
    ? (value as Outfit)
    : "casual";
}

const DENSITY = 500;

/** Every part, keyed by slot. Outfits own armour/mantle; the aura owns halo, glow, beam. */
export const PARTS: Record<string, PartSpec> = {
  glow: {
    size: [2.6, 3.0],
    center: [0, 0.12, -0.5],
    density: 100,
    colour: "tint",
    blend: "additive",
    draw: (ctx, w, h) => drawGlow(ctx, w, h),
  },
  halo: {
    size: [1.3, 1.3],
    center: [0, 0.34, -0.3],
    density: 400,
    colour: "tint",
    blend: "additive",
    draw: (ctx, w) => drawHalo(ctx, w),
  },
  beam: {
    size: [2.4, 1.3],
    center: [0, -0.72, -0.35],
    density: 120,
    colour: "tint",
    blend: "additive",
    draw: (ctx, w, h) => drawBeam(ctx, w, h),
  },
  mantle: {
    size: [MANTLE_BOX.x1 - MANTLE_BOX.x0, MANTLE_BOX.y1 - MANTLE_BOX.y0],
    center: [0, (MANTLE_BOX.y0 + MANTLE_BOX.y1) / 2, -0.1],
    density: DENSITY,
    colour: "fixed",
    blend: "normal",
    draw: (ctx, w, h) => drawMantle(ctx, w, h, DENSITY),
  },
  armor: {
    size: [ARMOR_BOX.x1 - ARMOR_BOX.x0, ARMOR_BOX.y1 - ARMOR_BOX.y0],
    center: [0, (ARMOR_BOX.y0 + ARMOR_BOX.y1) / 2, 0.16],
    density: DENSITY,
    colour: "fixed",
    blend: "normal",
    fade: true,
    draw: (ctx, w, h) => drawArmor(ctx, w, h, DENSITY),
  },
  armorGlow: {
    size: [ARMOR_BOX.x1 - ARMOR_BOX.x0, ARMOR_BOX.y1 - ARMOR_BOX.y0],
    center: [0, (ARMOR_BOX.y0 + ARMOR_BOX.y1) / 2, 0.17],
    density: DENSITY,
    colour: "tint",
    blend: "additive",
    fade: true,
    draw: (ctx, w, h) => drawArmorGlow(ctx, w, h, DENSITY),
  },
};

/** Which parts each outfit wears. */
export const OUTFIT_PARTS: Record<Outfit, string[]> = {
  casual: [],
  monarch: ["mantle", "armor", "armorGlow"],
};

export function paintPart(spec: PartSpec): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(spec.size[0] * spec.density);
  canvas.height = Math.round(spec.size[1] * spec.density);
  const ctx = canvas.getContext("2d");
  if (ctx) spec.draw(ctx, canvas.width, canvas.height);
  return canvas;
}
