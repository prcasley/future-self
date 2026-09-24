// Browser glue for the portrait: decode the local photo, frame it on the face, cut the matte.
// With the on-device face engine, framing comes from face landmarks and the matte from the
// person mask (a clean head-and-shoulders cutout); without it, the heuristic face finder and
// matte stand in. Everything happens in canvases on this device; nothing is uploaded.

import { analyzePhoto, decode } from "../scan/analyze";
import { meshEdges, type Landmark } from "../scan/faceEngine";
import {
  computeMatte,
  faceFromLandmarks,
  findFace,
  frameFor,
  inPhoto,
  VIEW,
  type Crop,
  type Face,
} from "./portraitFrame";
import { drawNeutralBust } from "./portraitParts";

export const PORTRAIT_SIZE = { width: 640, height: 800 };
const ANALYSIS = 128;
const MATTE = { width: 160, height: 200 };

export type Prepared = {
  canvas: HTMLCanvasElement;
  /** Face-mesh wireframe in the same view, white on transparent; null without landmarks. */
  mesh: HTMLCanvasElement | null;
  face: Face | null;
  crop: Crop;
  /** Landmarks in view coordinates (0..1 across the portrait), when the engine found a face. */
  landmarks: Landmark[] | null;
  engine: "mediapipe" | "heuristic";
};

type Drawable = HTMLImageElement | HTMLCanvasElement;

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function sizeOf(source: Drawable): [number, number] {
  return source instanceof HTMLImageElement
    ? [source.naturalWidth, source.naturalHeight]
    : [source.width, source.height];
}

/** Draw the crop of the source into a target canvas, leaving outside-the-photo pixels transparent. */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  source: Drawable,
  crop: Crop,
  width: number,
  height: number,
) {
  const [iw, ih] = sizeOf(source);
  const sx0 = Math.max(0, crop.x * iw);
  const sy0 = Math.max(0, crop.y * ih);
  const sx1 = Math.min(iw, (crop.x + crop.w) * iw);
  const sy1 = Math.min(ih, (crop.y + crop.h) * ih);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  const toX = (sx: number) => ((sx / iw - crop.x) / crop.w) * width;
  const toY = (sy: number) => ((sy / ih - crop.y) / crop.h) * height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    sx0,
    sy0,
    sx1 - sx0,
    sy1 - sy0,
    toX(sx0),
    toY(sy0),
    toX(sx1) - toX(sx0),
    toY(sy1) - toY(sy0),
  );
}

/** Landmarks of the source photo mapped into view coordinates for a crop. */
export function toView(landmarks: Landmark[], crop: Crop): Landmark[] {
  return landmarks.map((p) => ({
    x: (p.x - crop.x) / crop.w,
    y: (p.y - crop.y) / crop.h,
    z: p.z,
  }));
}

/** Alpha canvas from per-pixel values at matte resolution. */
function alphaCanvas(values: (u: number, v: number, i: number) => number) {
  const m = canvas(MATTE.width, MATTE.height);
  const ctx = m.getContext("2d")!;
  const data = ctx.createImageData(m.width, m.height);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x;
      data.data[i * 4] = 255;
      data.data[i * 4 + 1] = 255;
      data.data[i * 4 + 2] = 255;
      data.data[i * 4 + 3] = Math.round(
        255 * values((x + 0.5) / m.width, (y + 0.5) / m.height, i),
      );
    }
  ctx.putImageData(data, 0, 0);
  return m;
}

function heuristicFace(img: HTMLImageElement): Face | null {
  const scale = ANALYSIS / Math.max(img.naturalWidth, img.naturalHeight);
  const a = canvas(
    Math.max(8, Math.round(img.naturalWidth * scale)),
    Math.max(8, Math.round(img.naturalHeight * scale)),
  );
  const actx = a.getContext("2d", { willReadFrequently: true })!;
  actx.drawImage(img, 0, 0, a.width, a.height);
  return findFace(actx.getImageData(0, 0, a.width, a.height));
}

function drawMesh(view: Landmark[], width: number, height: number) {
  const edges = meshEdges();
  if (!edges.length) return null;
  const out = canvas(width, height);
  const ctx = out.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of edges) {
    ctx.moveTo(view[a].x * width, view[a].y * height);
    ctx.lineTo(view[b].x * width, view[b].y * height);
  }
  ctx.stroke();
  return out;
}

export async function preparePortrait(url: string): Promise<Prepared> {
  const { image: img, landmarks, mask, engine } = await analyzePhoto(url);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const face = landmarks
    ? faceFromLandmarks(landmarks, W, H)
    : heuristicFace(img);
  const crop = frameFor(face, W, H);

  let matte: HTMLCanvasElement;
  if (mask) {
    // Person mask cropped into the view, feathered where the photo itself ends.
    matte = canvas(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height);
    const mctx = matte.getContext("2d")!;
    drawCrop(mctx, mask, crop, matte.width, matte.height);
    mctx.globalCompositeOperation = "destination-in";
    mctx.drawImage(
      alphaCanvas((u, v) => inPhoto(u, v, crop)),
      0,
      0,
      matte.width,
      matte.height,
    );
  } else {
    const m = canvas(MATTE.width, MATTE.height);
    const mctx = m.getContext("2d", { willReadFrequently: true })!;
    drawCrop(mctx, img, crop, m.width, m.height);
    const alpha = computeMatte(
      mctx.getImageData(0, 0, m.width, m.height),
      crop,
    );
    matte = alphaCanvas((_u, _v, i) => alpha[i]);
  }

  const out = canvas(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height);
  const octx = out.getContext("2d")!;
  drawCrop(octx, img, crop, out.width, out.height);
  octx.globalCompositeOperation = "destination-in";
  octx.imageSmoothingEnabled = true;
  octx.drawImage(matte, 0, 0, out.width, out.height);
  octx.globalCompositeOperation = "source-over";

  const view = landmarks ? toView(landmarks, crop) : null;
  return {
    canvas: out,
    mesh: view ? drawMesh(view, out.width, out.height) : null,
    face,
    crop,
    landmarks: view,
    engine,
  };
}

export function neutralPortrait(): HTMLCanvasElement {
  const out = canvas(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height);
  const ctx = out.getContext("2d");
  if (ctx) drawNeutralBust(ctx, out.width, out.height);
  return out;
}

/** Downscale a chosen file to a modest JPEG before it is kept on this device. */
export async function normalizePhoto(
  file: Blob,
  longSide = 1280,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await decode(url);
    const scale = Math.min(
      1,
      longSide / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const c = canvas(
      Math.round(img.naturalWidth * scale),
      Math.round(img.naturalHeight * scale),
    );
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      c.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { decode, VIEW };
