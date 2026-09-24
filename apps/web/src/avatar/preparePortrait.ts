// Browser glue for the portrait: decode the local photo, frame it on the face, cut the matte.
// Everything happens in canvases on this device; nothing is uploaded.

import {
  computeMatte,
  findFace,
  frameFor,
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
  face: Face | null;
  crop: Crop;
};

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
  return img;
}

/** Draw the crop of the source into a target canvas, leaving outside-the-photo pixels transparent. */
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  crop: Crop,
  width: number,
  height: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
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
    img,
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

export async function preparePortrait(url: string): Promise<Prepared> {
  const img = await decode(url);
  const scale = ANALYSIS / Math.max(img.naturalWidth, img.naturalHeight);
  const a = canvas(
    Math.max(8, Math.round(img.naturalWidth * scale)),
    Math.max(8, Math.round(img.naturalHeight * scale)),
  );
  const actx = a.getContext("2d", { willReadFrequently: true })!;
  actx.drawImage(img, 0, 0, a.width, a.height);
  const face = findFace(actx.getImageData(0, 0, a.width, a.height));
  const crop = frameFor(face, img.naturalWidth, img.naturalHeight);

  const m = canvas(MATTE.width, MATTE.height);
  const mctx = m.getContext("2d", { willReadFrequently: true })!;
  drawCrop(mctx, img, crop, m.width, m.height);
  const alpha = computeMatte(mctx.getImageData(0, 0, m.width, m.height), crop);
  const matte = mctx.createImageData(m.width, m.height);
  for (let i = 0; i < alpha.length; i++) {
    matte.data[i * 4] = 255;
    matte.data[i * 4 + 1] = 255;
    matte.data[i * 4 + 2] = 255;
    matte.data[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  mctx.clearRect(0, 0, m.width, m.height);
  mctx.putImageData(matte, 0, 0);

  const out = canvas(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height);
  const octx = out.getContext("2d")!;
  drawCrop(octx, img, crop, out.width, out.height);
  octx.globalCompositeOperation = "destination-in";
  octx.imageSmoothingEnabled = true;
  octx.drawImage(m, 0, 0, out.width, out.height);
  octx.globalCompositeOperation = "source-over";
  return { canvas: out, face, crop };
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

export { VIEW };
