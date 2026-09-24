// On-device face engine: MediaPipe Face Mesh (478 landmarks with irises) and Selfie Segmentation
// (a soft person mask). Both run in this browser from files this app serves at /mediapipe/.
// The photo is never uploaded.
//
// The two legacy solutions share global loader names, so every start-up and every run goes
// through one queue: one solution finishes initializing before the other loads its runtime.

export type Landmark = { x: number; y: number; z: number };
export type Connection = [number, number];
export type Source = HTMLImageElement | HTMLCanvasElement;

type Solution = {
  setOptions(options: Record<string, unknown>): void;
  onResults(listener: (results: any) => void): void;
  initialize(): Promise<void>;
  reset(): void;
  send(inputs: { image: Source }): Promise<void>;
};

declare global {
  interface Window {
    FaceMesh?: new (config: {
      locateFile: (file: string) => string;
    }) => Solution;
    SelfieSegmentation?: new (config: {
      locateFile: (file: string) => string;
    }) => Solution;
    FACEMESH_TESSELATION?: Connection[];
    FACEMESH_FACE_OVAL?: Connection[];
    FACEMESH_CONTOURS?: Connection[];
  }
}

const BASE = "/mediapipe";
const scripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  let loading = scripts.get(src);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        el.remove();
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, loading);
  }
  return loading;
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

let mesh: Solution | null = null;
let segmenter: Solution | null = null;

async function meshSolution(): Promise<Solution> {
  if (mesh) return mesh;
  await loadScript(`${BASE}/face_mesh/face_mesh.js`);
  if (!window.FaceMesh) throw new Error("Face mesh unavailable");
  const solution = new window.FaceMesh({
    locateFile: (file) => `${BASE}/face_mesh/${file}`,
  });
  solution.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    selfieMode: false,
  });
  await solution.initialize();
  mesh = solution;
  return solution;
}

async function segmenterSolution(): Promise<Solution> {
  if (segmenter) return segmenter;
  await loadScript(`${BASE}/selfie_segmentation/selfie_segmentation.js`);
  if (!window.SelfieSegmentation)
    throw new Error("Selfie segmentation unavailable");
  const solution = new window.SelfieSegmentation({
    locateFile: (file) => `${BASE}/selfie_segmentation/${file}`,
  });
  // 0 = general model (256x256): best for head-and-shoulders portraits.
  solution.setOptions({ modelSelection: 0, selfieMode: false });
  await solution.initialize();
  segmenter = solution;
  return solution;
}

/** 478 normalized landmarks (x, y in 0..1 of the source; 468–477 are the irises), or null. */
export function readFace(image: Source): Promise<Landmark[] | null> {
  return serial(async () => {
    const solution = await meshSolution();
    let found: Landmark[] | null = null;
    solution.onResults((results) => {
      const face = results?.multiFaceLandmarks?.[0];
      found = face
        ? face.map((p: Landmark) => ({ x: p.x, y: p.y, z: p.z }))
        : null;
    });
    solution.reset(); // a still photo: no tracking carried over from an earlier one
    await solution.send({ image });
    return found;
  });
}

/** Person mask the size of the source: alpha 255 = person, 0 = background. Null if unavailable. */
export function segmentPerson(
  image: Source,
): Promise<HTMLCanvasElement | null> {
  return serial(async () => {
    const solution = await segmenterSolution();
    let mask: HTMLCanvasElement | null = null;
    solution.onResults((results) => {
      const out = results?.segmentationMask;
      if (!out) return;
      const w = "naturalWidth" in image ? image.naturalWidth : image.width;
      const h = "naturalHeight" in image ? image.naturalHeight : image.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // The solution reuses its buffer, so copy it now. The mask carries confidence in alpha.
      ctx.drawImage(out, 0, 0, w, h);
      mask = canvas;
    });
    await solution.send({ image });
    return mask;
  });
}

/** Triangle edges of the face mesh, for drawing. Available once the face mesh has loaded. */
export function meshEdges(): Connection[] {
  return window.FACEMESH_TESSELATION || [];
}

/** Outline edges only: face oval, eyes, brows and lips. */
export function meshContours(): Connection[] {
  return window.FACEMESH_CONTOURS || [];
}
