// One analysis per photo, shared by the portrait projection and the golden-ratio scan:
// decode, then face landmarks and a person mask from the on-device engine. If the engine
// cannot load (no WebGL, missing files, too slow), the analysis says so and the callers
// fall back to the heuristic framing and matte. Nothing here touches the network except
// this app's own /mediapipe files.

import { readFace, segmentPerson, type Landmark } from "./faceEngine";

export type Analysis = {
  image: HTMLImageElement;
  landmarks: Landmark[] | null;
  mask: HTMLCanvasElement | null;
  engine: "mediapipe" | "heuristic";
};

const ENGINE_TIMEOUT_MS = 25000;
const cache = new Map<string, Promise<Analysis>>();

export async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
  return img;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("engine timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function analyzePhoto(url: string): Promise<Analysis> {
  let hit = cache.get(url);
  if (hit) return hit;
  hit = (async (): Promise<Analysis> => {
    const image = await decode(url);
    let landmarks: Landmark[] | null;
    try {
      landmarks = await withTimeout(readFace(image), ENGINE_TIMEOUT_MS);
    } catch {
      return { image, landmarks: null, mask: null, engine: "heuristic" };
    }
    // Landmarks are worth keeping even if the person mask fails; the matte then falls back.
    let mask: HTMLCanvasElement | null = null;
    try {
      mask = await withTimeout(segmentPerson(image), ENGINE_TIMEOUT_MS);
    } catch {
      mask = null;
    }
    return { image, landmarks, mask, engine: "mediapipe" };
  })();
  cache.set(url, hit);
  hit.catch(() => cache.delete(url));
  while (cache.size > 2) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return hit;
}
