// The future gallery: one portrait per side of the Crossing (dream, good, neutral, bad) plus
// "home" (the present). Sources, in order:
//   1. portraits the user set in this browser (IndexedDB, same database as the photo)
//   2. the developer's private gallery, served in dev only from private/media/portraits/
//      (gitignored, never built into the hosted demo)
//   3. the user's own photo (handled by the caller as the final fallback)
// Nothing here is ever uploaded. "forget my photo" and "delete all my data" clear it too.

export const SIDES = ["home", "dream", "good", "neutral", "bad"] as const;
export type Side = (typeof SIDES)[number];
export type Gallery = Partial<Record<Side, string>>;

const DB_NAME = "the-other-side";
const STORE = "portrait";
const PREFIX = "future:";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const memory = new Map<Side, Blob>();

export async function saveSidePortrait(
  side: Side,
  blob: Blob,
): Promise<boolean> {
  memory.set(side, blob);
  try {
    await run("readwrite", (store) => store.put(blob, PREFIX + side));
    return true;
  } catch {
    return false;
  }
}

export async function forgetSidePortraits(): Promise<boolean> {
  memory.clear();
  try {
    for (const side of SIDES)
      await run("readwrite", (store) => store.delete(PREFIX + side));
    return true;
  } catch {
    return false;
  }
}

async function loadStored(): Promise<Partial<Record<Side, Blob>>> {
  const out: Partial<Record<Side, Blob>> = {};
  for (const side of SIDES) {
    const cached = memory.get(side);
    if (cached) {
      out[side] = cached;
      continue;
    }
    try {
      const stored = await run<Blob | undefined>("readonly", (store) =>
        store.get(PREFIX + side),
      );
      if (stored) out[side] = stored;
    } catch {
      /* storage unavailable: fall through to the other sources */
    }
  }
  return out;
}

async function loadPrivate(): Promise<Gallery> {
  try {
    const response = await fetch("/private-portraits/manifest.json", {
      cache: "no-store",
    });
    if (!response.ok) return {};
    const manifest = (await response.json()) as Record<string, string>;
    const out: Gallery = {};
    for (const side of SIDES)
      if (manifest[side]) out[side] = "/private-portraits/" + manifest[side];
    return out;
  } catch {
    return {};
  }
}

/** Object URLs (stored) and same-origin URLs (private gallery), keyed by side. */
export async function loadGallery(): Promise<{
  urls: Gallery;
  stored: Side[];
}> {
  const [stored, dev] = await Promise.all([loadStored(), loadPrivate()]);
  const urls: Gallery = { ...dev };
  const keys: Side[] = [];
  for (const side of SIDES) {
    const blob = stored[side];
    if (blob) {
      urls[side] = URL.createObjectURL(blob);
      keys.push(side);
    }
  }
  return { urls, stored: keys };
}

export function releaseGallery(gallery: Gallery) {
  for (const url of Object.values(gallery))
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}
