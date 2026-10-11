// The golden-ratio face scan: an overlay that turns the user's photo into a hologram scan, draws the
// face mesh, maps golden-ratio (Φ) proportions measured from their own landmarks, then shows a future
// projection written by NVIDIA Nemotron on Nebius Token Factory (local fallback when offline), and
// morphs a gold outline of the face toward the projected proportions. The photo stays in this
// browser; only the seven ratio numbers are sent for the projection.

import { useEffect, useMemo, useRef, useState } from "react";
import { projectScan, type ScanProjection } from "../api";
import { drawCrop, toView } from "../avatar/preparePortrait";
import {
  faceFromLandmarks,
  frameFor,
  inPhoto,
  type Crop,
} from "../avatar/portraitFrame";
import { AURA_COLOR, auraOf, type Aura } from "../sideLight";
import { analyzePhoto, type Analysis } from "./analyze";
import { meshContours, meshEdges, type Connection } from "./faceEngine";
import { blend, futureFace } from "./future";
import { LM, mapFace, projectionInput } from "./goldenRatio";
import {
  badges,
  buildCallouts,
  metrics,
  NARROW,
  place,
  spiral,
  timeline,
  toStage,
  WIDE,
  type Geometry,
} from "./hud";
import "./FaceScan.css";

export interface FaceScanProps {
  open: boolean;
  photoUrl: string | null;
  session: string;
  side: string | null;
  aura?: string | null;
  /** Increment to play the scan again. */
  replay?: number;
  onClose: () => void;
}

const SIDE_NAMES: Record<string, string> = {
  dream: "DREAM LIFE",
  good: "GOOD PATH",
  neutral: "NEUTRAL DRIFT",
  bad: "HARD ROAD",
};

// Canvas pixels per SVG unit (the canvases and the SVG share one view).
const K = 0.8;
// Timeline (ms from the scan starting); the callouts follow from hud.ts.
const SWEEP = [250, 1650];
const MESH = [1500, 2900];
const GUIDES = 2700;
const TITLE = 3000;
const MORPH_PERIOD = 3200;
// Landscape layout from this backdrop width (CSS px); phones get the 4:5 layout with a list.
const WIDE_MIN = 760;
const BADGE = 28;

type RGB = [number, number, number];
type Pt = { x: number; y: number };

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(width);
  c.height = Math.round(height);
  return c;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const css = (c: RGB, a: number) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** Luminance -> hologram colour: deep aura in the shadows, near-white in the highlights. */
function scanLut(aura: RGB) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const k = smooth(0.03, 0.97, i / 255);
    const lo = smooth(0, 0.55, k);
    const hi = smooth(0.5, 1, k);
    for (let c = 0; c < 3; c++) {
      const base = aura[c] * 0.05 + (aura[c] * 0.64 - aura[c] * 0.05) * lo;
      const top = aura[c] + (1 - aura[c]) * 0.72;
      lut[i * 3 + c] = 255 * (base + (top - base) * hi);
    }
  }
  return lut;
}

/** Soft edges wherever the photo ends inside the view (and at the view's sides). */
function fadeEdges(target: HTMLCanvasElement, crop: Crop) {
  const w = Math.max(8, Math.round(target.width / 8));
  const h = Math.max(8, Math.round(target.height / 8));
  const f = canvas(w, h);
  const fctx = f.getContext("2d")!;
  const data = fctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const side = smooth(0, 0.07, u) * smooth(0, 0.07, 1 - u);
      data.data[(y * w + x) * 4 + 3] =
        255 * side * inPhoto(u, (y + 0.5) / h, crop);
    }
  fctx.putImageData(data, 0, 0);
  const ctx = target.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(f, 0, 0, target.width, target.height);
  ctx.restore();
}

/** The photo as it is, before the scan line passes. */
function naturalImage(a: Analysis, crop: Crop, w: number, h: number) {
  const out = canvas(w, h);
  drawCrop(out.getContext("2d")!, a.image, crop, out.width, out.height);
  fadeEdges(out, crop);
  return out;
}

/** The photo as a hologram: luminance through the aura colour, cut out by the person mask. */
function hologramImage(
  a: Analysis,
  crop: Crop,
  aura: RGB,
  w: number,
  h: number,
) {
  const out = canvas(w, h);
  const W = out.width;
  const H = out.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  drawCrop(ctx, a.image, crop, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  let mask: Uint8ClampedArray | null = null;
  if (a.mask) {
    const m = canvas(W, H);
    const mctx = m.getContext("2d", { willReadFrequently: true })!;
    // The mask comes from a 256 x 256 model: soften it, then tighten it, for a clean edge.
    mctx.filter = `blur(${Math.max(1, Math.round(W / 360))}px)`;
    drawCrop(mctx, a.mask, crop, W, H);
    mask = mctx.getImageData(0, 0, W, H).data;
  }
  const edge = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) edge[i] = 255 * smooth(0.3, 0.72, i / 255);
  const lut = scanLut(aura);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const scan = y % 3 === 0 ? 0.8 : 1;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3]) continue;
      const l = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
      d[i] = lut[l * 3] * scan;
      d[i + 1] = lut[l * 3 + 1] * scan;
      d[i + 2] = lut[l * 3 + 2] * scan;
      if (mask) d[i + 3] = Math.min(d[i + 3], edge[mask[i + 3]]);
      else {
        // No person mask: a soft oval instead of a hard photo rectangle.
        const u = x / W - 0.5;
        const v = y / H - 0.46;
        d[i + 3] *= 1 - smooth(0.36, 0.5, Math.hypot(u / 0.9, v / 1.05));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  fadeEdges(out, crop);
  return out;
}

/** Dark stage with a glow, a perspective floor grid, a projector pedestal, and telemetry text. */
function backdrop(
  aura: RGB,
  lines: string[],
  w: number,
  h: number,
  pw: number,
) {
  const out = canvas(w, h);
  const W = out.width;
  const H = out.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#03060d";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(
    W / 2,
    H * 0.38,
    0,
    W / 2,
    H * 0.38,
    Math.max(W, H) * 0.55,
  );
  glow.addColorStop(0, css(aura, 0.22));
  glow.addColorStop(1, css(aura, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = css(aura, 0.05);
  ctx.lineWidth = 1;
  for (let x = W / 2 - 20 - Math.floor(W / 80) * 40; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Floor grid converging on a vanishing point behind the bust.
  const vx = W / 2;
  const floor = H * 0.81;
  ctx.strokeStyle = css(aura, 0.16);
  const spokes = Math.ceil(W / 140);
  for (let k = -spokes; k <= spokes; k++) {
    ctx.beginPath();
    ctx.moveTo(vx + k * 6, floor);
    ctx.lineTo(vx + k * 70, H);
    ctx.stroke();
  }
  for (let k = 0; k < 9; k++) {
    const y = floor + (H - floor) * (k / 8) ** 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Pedestal rings.
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = css(aura, 0.5 - k * 0.14);
    ctx.lineWidth = 2 - k * 0.5;
    ctx.shadowColor = css(aura, 0.8);
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H * 0.93,
      pw * (0.34 + k * 0.05),
      H * (0.036 + k * 0.006),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Telemetry: real numbers from this scan, dim, in the top-left corner.
  ctx.fillStyle = css(aura, 0.5);
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  lines.forEach((line, i) => ctx.fillText(line, 20, 30 + i * 20));
  return out;
}

/** Edges ordered top to bottom so the mesh draws in like a scan. */
function orderedEdges(view: Pt[]) {
  return meshEdges()
    .slice()
    .sort(
      (e1, e2) =>
        Math.min(view[e1[0]].y, view[e1[1]].y) -
        Math.min(view[e2[0]].y, view[e2[1]].y),
    );
}

function stroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  edges: Connection[],
  from = 0,
  to = edges.length,
) {
  ctx.beginPath();
  for (let i = from; i < to; i++) {
    const [a, b] = edges[i];
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
}

export function FaceScan({
  open,
  photoUrl,
  session,
  side,
  aura,
  replay = 0,
  onClose,
}: FaceScanProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [failed, setFailed] = useState(false);
  const [projection, setProjection] = useState<ScanProjection | null>(null);
  const [projectionFailed, setProjectionFailed] = useState(false);
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= WIDE_MIN,
  );
  const [runKey, setRunKey] = useState(0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLCanvasElement>(null);
  const meshCanvas = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const futureRef = useRef<Pt[] | null>(null);
  const noFutureRef = useRef(false);
  const auraKey: Aura = auraOf(aura);
  const colour = AURA_COLOR[auraKey];
  const ghostName = auraKey === "gold" ? "WHITE" : "GOLD";
  const g: Geometry = wide ? WIDE : NARROW;
  const reduced =
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  // Analyse the photo when the scan opens (shared with the portrait, so usually instant).
  useEffect(() => {
    if (!open || !photoUrl) return;
    let alive = true;
    setFailed(false);
    analyzePhoto(photoUrl)
      .then((a) => {
        if (!alive) return;
        setAnalysis(a);
        if (!a.landmarks) setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, photoUrl]);

  useEffect(() => {
    if (open) setRunKey((k) => k + 1);
  }, [open, replay]);

  const layout = useMemo(() => {
    if (!analysis?.landmarks) return null;
    const { image, landmarks } = analysis;
    const W = image.naturalWidth;
    const H = image.naturalHeight;
    const mapping = mapFace(landmarks, W, H);
    if (!mapping) return null;
    const crop = frameFor(faceFromLandmarks(landmarks, W, H), W, H);
    return { mapping, crop, view: toView(landmarks, crop) };
  }, [analysis]);

  // The future projection: ratio numbers only go to the API (Nemotron on Nebius, or local).
  useEffect(() => {
    if (!open || !layout) return;
    let alive = true;
    setProjection(null);
    setProjectionFailed(false);
    projectScan(session, projectionInput(layout.mapping), side)
      .then((p) => alive && setProjection(p))
      .catch(() => alive && setProjectionFailed(true));
    return () => {
      alive = false;
    };
  }, [open, layout, session, side, runKey]);

  // The projected face the outline morphs toward.
  useEffect(() => {
    futureRef.current =
      projection && layout
        ? futureFace(layout.view, projection.rows, 1, 1.25)
        : null;
    noFutureRef.current = projectionFailed;
  }, [projection, projectionFailed, layout]);

  useEffect(() => {
    const el = backdropRef.current;
    if (!el || !open) return;
    const observer = new ResizeObserver(() =>
      setWide(el.clientWidth >= WIDE_MIN && el.clientHeight >= 440),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // Focus moves into the dialog on open and back where it was on close; Escape closes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  const times = timeline(g.wide ? 12 : 6);

  // Canvas animation: the scan sweep turns the photo into the hologram, the mesh draws in, then the
  // projected outline breathes between the face now and the face projected.
  useEffect(() => {
    if (!open || !analysis || !layout) return;
    const target = stage.current;
    const wire = meshCanvas.current;
    if (!target || !wire) return;
    const ctx = target.getContext("2d");
    const wctx = wire.getContext("2d");
    if (!ctx || !wctx) return;
    const { crop, view, mapping } = layout;
    const ghost: RGB = auraKey === "gold" ? [1, 1, 1] : [1, 0.81, 0.42];
    const CW = target.width;
    const CH = target.height;
    const PW = g.pw * K;
    const PH = PW * 1.25;
    const X0 = g.px * K;
    const Y0 = g.py * K;
    const at = (p: Pt) => ({ x: X0 + p.x * PW, y: Y0 + p.y * PH });
    const natural = naturalImage(analysis, crop, PW, PH);
    const holo = hologramImage(analysis, crop, colour, PW, PH);
    const back = backdrop(
      colour,
      g.wide
        ? [
            "Φ  1.6180339887",
            `MESH  ${view.length} PTS`,
            "ENGINE  ON-DEVICE",
            "IRIS RULER  11.7 MM",
            `SCALE  ${mapping.cmPerPx.toFixed(4)} CM/PX`,
            `FACE  ${mapping.distances.faceWidth.cm.toFixed(1)} × ${mapping.distances.faceHeight.cm.toFixed(1)} CM`,
            "SUBJECT  YOU",
          ]
        : [],
      CW,
      CH,
      PW,
    );
    const edges = orderedEdges(view);
    const contours = meshContours();
    const pts = view.map(at);
    const base = canvas(CW, CH);
    const bctx = base.getContext("2d")!;
    wctx.clearRect(0, 0, CW, CH);
    wctx.lineWidth = 1;
    wctx.strokeStyle = css(colour, 0.5);
    let drawn = 0;
    let swept = false;
    let meshed = false;
    let ghostFrom = -1;
    const dots = () => {
      wctx.fillStyle = "#ffffff";
      wctx.shadowColor = css(colour, 1);
      wctx.shadowBlur = 10;
      for (const i of Object.values(LM)) {
        if (!pts[i]) continue;
        wctx.beginPath();
        wctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
        wctx.fill();
      }
      wctx.shadowBlur = 0;
    };
    const frame = (elapsed: number) => {
      if (!swept) {
        const sweep = reduced ? 1 : smooth(SWEEP[0], SWEEP[1], elapsed);
        const lineY = Y0 + sweep * PH;
        ctx.clearRect(0, 0, CW, CH);
        ctx.drawImage(back, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CW, lineY);
        ctx.clip();
        ctx.drawImage(holo, X0, Y0);
        ctx.restore();
        if (sweep < 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, lineY, CW, CH - lineY);
          ctx.clip();
          ctx.drawImage(natural, X0, Y0);
          ctx.restore();
          const band = ctx.createLinearGradient(0, lineY - 40, 0, lineY + 6);
          band.addColorStop(0, css(colour, 0));
          band.addColorStop(1, css(colour, 0.55));
          ctx.fillStyle = band;
          ctx.fillRect(0, lineY - 40, CW, 46);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, lineY - 1, CW, 2);
        }
        swept = sweep >= 1;
      }
      if (!meshed) {
        const progress = reduced
          ? 1
          : Math.min(1, Math.max(0, (elapsed - MESH[0]) / (MESH[1] - MESH[0])));
        const upTo = Math.floor(edges.length * progress);
        stroke(wctx, pts, edges, drawn, upTo);
        drawn = upTo;
        if (progress < 1) return false;
        dots();
        bctx.drawImage(wire, 0, 0);
        meshed = true;
      }
      if (noFutureRef.current) return swept;
      const future = futureRef.current;
      if (!future || (!reduced && elapsed < times.morph)) return false;
      if (ghostFrom < 0) ghostFrom = elapsed;
      const since = elapsed - ghostFrom;
      const alpha = reduced ? 1 : smooth(0, 700, since);
      const t = reduced
        ? 1
        : 0.5 - 0.5 * Math.cos((2 * Math.PI * since) / MORPH_PERIOD);
      const shape = blend(view, future, t).map(at);
      wctx.clearRect(0, 0, CW, CH);
      wctx.drawImage(base, 0, 0);
      wctx.save();
      wctx.lineWidth = 2;
      wctx.strokeStyle = css(ghost, 0.9 * alpha);
      wctx.shadowColor = css(ghost, 0.9 * alpha);
      wctx.shadowBlur = 8;
      stroke(wctx, shape, contours);
      wctx.restore();
      return reduced && swept;
    };
    let id = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (!frame(now - start)) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [
    open,
    analysis,
    layout,
    runKey,
    colour,
    auraKey,
    reduced,
    g,
    times.morph,
  ]);

  if (!open || !photoUrl) return null;

  const m = metrics(g);
  const rows = Object.fromEntries(
    (projection?.rows || []).map((row) => [row.key, row]),
  );
  const v = layout?.view;
  const P = (i: number) => toStage(g, v?.[i] ?? { x: 0, y: 0 });
  const faceBox = v
    ? {
        x0: P(LM.faceRight).x,
        x1: P(LM.faceLeft).x,
        y0: P(LM.hairline).y,
        y1: P(LM.chin).y,
      }
    : null;
  const callouts = layout ? buildCallouts(layout.mapping, !g.wide) : [];
  const placed = layout && g.wide ? place(callouts, layout.view, g) : [];
  const marks =
    layout && !g.wide ? badges(callouts, layout.view, g, BADGE, 244) : [];
  const sideName = projection?.side
    ? SIDE_NAMES[projection.side]
    : "YOUR CURRENT PATH";
  const nemotron = projection?.runner === "nemotron";
  const future = (key?: string) => {
    const row = key ? rows[key] : undefined;
    return row ? `→ ${row.future.toFixed(2)} · ${row.chance}% chance` : "";
  };
  const summary = layout
    ? `Golden ratio face mapping. ${layout.mapping.ratios
        .map(
          (r) =>
            `${r.label} ${r.value.toFixed(2)} against ${r.target.toFixed(3)}`,
        )
        .join("; ")}.`
    : "Golden ratio face scan";
  const T = g.wide
    ? {
        box: { x: g.vw / 2 - 470, y: 14, w: 940, h: 60 },
        title: { y: 55, size: 34 },
        sub: { y: 100, size: 19 },
        banner: { x: g.vw / 2 - 460, y: 114, w: 920, h: 78 },
        bannerTitle: { y: 149, size: 24 },
        bannerSub: { y: 178, size: 17 },
      }
    : {
        box: { x: 30, y: 14, w: 940, h: 70 },
        title: { y: 62, size: 38 },
        sub: { y: 119, size: 27 },
        banner: { x: 60, y: 138, w: 880, h: 96 },
        bannerTitle: { y: 180, size: 30 },
        bannerSub: { y: 218, size: 22 },
      };

  return (
    <div className="scan-backdrop" ref={backdropRef} onClick={onClose}>
      <div
        className={`scan-card aura-${auraKey}${g.wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Golden ratio face scan"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="scan-close"
          ref={closeButton}
          onClick={onClose}
          aria-label="Close the scan"
        >
          ×
        </button>
        <div className="scan-view" key={`${runKey}-${g.wide}`}>
          <canvas
            ref={stage}
            width={g.vw * K}
            height={g.vh * K}
            aria-hidden="true"
          />
          <canvas
            ref={meshCanvas}
            width={g.vw * K}
            height={g.vh * K}
            aria-hidden="true"
          />
          {!layout && (
            <div className="scan-wait" role="status">
              {failed
                ? "No face found in this photo."
                : "Scanning your photo on this device…"}
            </div>
          )}
          {layout && faceBox && (
            <svg
              viewBox={`0 0 ${g.vw} ${g.vh}`}
              role="img"
              aria-label={summary}
            >
              <g>
                <line
                  className="hud-draw"
                  pathLength={1}
                  x1={g.vw / 2}
                  y1={g.wide ? 200 : 250}
                  x2={g.vw / 2}
                  y2={g.vh - (g.wide ? 124 : 60)}
                  style={{ animationDelay: `${GUIDES}ms` }}
                />
                {[
                  LM.hairline,
                  LM.noseBridge,
                  LM.noseBase,
                  LM.lipLowerInner,
                  LM.chin,
                ].map((i, k) => (
                  <line
                    key={i}
                    className="hud-draw"
                    pathLength={1}
                    x1={faceBox.x0 - 70}
                    x2={faceBox.x1 + 70}
                    y1={P(i).y}
                    y2={P(i).y}
                    style={{ animationDelay: `${GUIDES + 120 * k}ms` }}
                  />
                ))}
                <rect
                  className="hud-draw phi-rect"
                  pathLength={1}
                  x={faceBox.x0}
                  y={faceBox.y0}
                  width={faceBox.x1 - faceBox.x0}
                  height={faceBox.y1 - faceBox.y0}
                  style={{ animationDelay: `${GUIDES + 500}ms` }}
                />
                <path
                  className="hud-draw phi-spiral"
                  pathLength={1}
                  d={spiral(
                    faceBox.x0,
                    faceBox.y0,
                    faceBox.x1 - faceBox.x0,
                    faceBox.y1 - faceBox.y0,
                  )}
                  style={{ animationDelay: `${GUIDES + 800}ms` }}
                />
              </g>
              <g className="hud-pop" style={{ animationDelay: `${TITLE}ms` }}>
                <rect
                  className="hud-box"
                  x={T.box.x}
                  y={T.box.y}
                  width={T.box.w}
                  height={T.box.h}
                />
                <text
                  className="hud-title"
                  x={g.vw / 2}
                  y={T.title.y}
                  fontSize={T.title.size}
                  textAnchor="middle"
                >
                  GOLDEN RATIO (Φ) FACIAL MAPPING
                </text>
                <text
                  className="hud-sub"
                  x={g.vw / 2}
                  y={T.sub.y}
                  fontSize={T.sub.size}
                  textAnchor="middle"
                >
                  {g.wide
                    ? "Φ = 1.618 · THE PROPORTION OF LIFE · SUBJECT: YOU · MEASURED ON THIS DEVICE"
                    : "Φ = 1.618 · SUBJECT: YOU · ON THIS DEVICE"}
                </text>
              </g>
              {placed.map((c) => {
                const edgeX = c.side === "left" ? c.x + c.w : c.x;
                const line = future(c.ratio?.key);
                return (
                  <g
                    key={c.key}
                    className="hud-pop"
                    style={{ animationDelay: `${c.delay}ms` }}
                  >
                    <line
                      className="hud-leader"
                      x1={c.ax}
                      y1={c.ay}
                      x2={edgeX}
                      y2={c.y + 20}
                    />
                    <circle className="hud-dot" cx={c.ax} cy={c.ay} r={5} />
                    <rect
                      className="hud-box"
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                    />
                    <text
                      className="hud-label"
                      x={c.x + 14}
                      y={c.y + m.lineH}
                      fontSize={m.label}
                    >
                      {c.title}
                    </text>
                    {c.lines.map((text, k) => (
                      <text
                        key={k}
                        className="hud-value"
                        x={c.x + 14}
                        y={c.y + m.lineH * (k + 2)}
                        fontSize={m.value}
                      >
                        {text}
                      </text>
                    ))}
                    {line && (
                      <text
                        className="hud-future"
                        x={c.x + 14}
                        y={c.y + m.lineH * (c.lines.length + 2)}
                        fontSize={m.value}
                        style={{
                          animationDelay: `${Math.max(0, times.future - c.delay)}ms`,
                        }}
                      >
                        {line}
                      </text>
                    )}
                  </g>
                );
              })}
              {marks.map((b) => (
                <g
                  key={b.key}
                  className="hud-pop"
                  style={{ animationDelay: `${b.delay}ms` }}
                >
                  <line
                    className="hud-leader"
                    x1={b.ax}
                    y1={b.ay}
                    x2={b.x}
                    y2={b.y}
                  />
                  <circle className="hud-dot" cx={b.ax} cy={b.ay} r={7} />
                  <circle className="hud-badge" cx={b.x} cy={b.y} r={BADGE} />
                  <text
                    className="hud-title"
                    x={b.x}
                    y={b.y + 11}
                    fontSize={32}
                    textAnchor="middle"
                  >
                    {b.n}
                  </text>
                </g>
              ))}
              {projection && (
                <g
                  className="hud-pop"
                  style={{ animationDelay: `${times.future}ms` }}
                >
                  <rect
                    className="hud-box future"
                    x={T.banner.x}
                    y={T.banner.y}
                    width={T.banner.w}
                    height={T.banner.h}
                  />
                  <text
                    className="hud-title"
                    x={g.vw / 2}
                    y={T.bannerTitle.y}
                    fontSize={T.bannerTitle.size}
                    textAnchor="middle"
                  >
                    {g.wide
                      ? `FUTURE PROJECTION · +${projection.weeks} WEEKS · ${sideName}`
                      : `FUTURE · +${projection.weeks} WEEKS · ${sideName}`}
                  </text>
                  <text
                    className="hud-sub"
                    x={g.vw / 2}
                    y={T.bannerSub.y}
                    fontSize={T.bannerSub.size}
                    textAnchor="middle"
                  >
                    {g.wide
                      ? nemotron
                        ? "PROJECTED BY NVIDIA NEMOTRON · NEBIUS TOKEN FACTORY"
                        : "LOCAL PROJECTION · NEBIUS NOT CONNECTED"
                      : nemotron
                        ? "NVIDIA NEMOTRON · NEBIUS"
                        : "LOCAL · NEBIUS NOT CONNECTED"}
                  </text>
                </g>
              )}
              {g.wide && (
                <g
                  className="hud-pop"
                  style={{ animationDelay: `${times.last + 300}ms` }}
                >
                  <rect
                    className="hud-box"
                    x={g.vw / 2 - 300}
                    y={g.vh - 118}
                    width={600}
                    height={102}
                  />
                  <text
                    className="hud-value"
                    x={g.vw / 2}
                    y={g.vh - 86}
                    fontSize={20}
                    textAnchor="middle"
                  >
                    Φ = Golden Ratio (1.618)
                  </text>
                  <text
                    className="hud-label"
                    x={g.vw / 2}
                    y={g.vh - 59}
                    fontSize={16}
                    textAnchor="middle"
                  >
                    CALCULATED / TARGET · CM FROM IRIS SIZE
                  </text>
                  <text
                    className="hud-label"
                    x={g.vw / 2}
                    y={g.vh - 33}
                    fontSize={16}
                    textAnchor="middle"
                  >
                    {`${ghostName} OUTLINE = PROJECTED SHAPE · +${projection?.weeks ?? 52} WEEKS`}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
        {!g.wide && marks.length > 0 && (
          <>
            <ol className="scan-list">
              {marks.map((b) => {
                const line = future(b.ratio?.key);
                return (
                  <li
                    key={b.key}
                    className="hud-pop"
                    style={{ animationDelay: `${b.delay}ms` }}
                  >
                    <span className="scan-num" aria-hidden="true">
                      {b.n}
                    </span>
                    <div>
                      <strong>{b.title}</strong>
                      {b.lines.map((text, k) => (
                        <span key={k}>{text}</span>
                      ))}
                      {line && <span className="scan-future">{line}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="scan-legend">
              Φ = Golden Ratio (1.618) · calculated / target · cm from iris size
              · {ghostName.toLowerCase()} outline = projected shape
            </p>
          </>
        )}
        <p className="scan-fine">
          {failed
            ? "I couldn't find a face in this photo. Try a well-lit, front-facing picture."
            : projection
              ? projection.disclaimer
              : projectionFailed
                ? "Projection unavailable right now. The measurements above are from your photo."
                : "Measured on this device. Only the seven ratio numbers are sent, to NVIDIA Nemotron on Nebius Token Factory, for the projection."}
        </p>
      </div>
    </div>
  );
}
