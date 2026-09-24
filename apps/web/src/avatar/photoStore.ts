// The user's photo lives only in this browser (IndexedDB). It is never sent to the API,
// never logged, and "forget my photo" deletes it. If storage is unavailable (private
// windows), the photo lasts for this page only.

const DB_NAME = "the-other-side";
const STORE = "portrait";
const KEY = "me";

let memory: Blob | null | undefined;

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

export async function savePhoto(blob: Blob): Promise<boolean> {
  memory = blob;
  try {
    await run("readwrite", (store) => store.put(blob, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function loadPhoto(): Promise<Blob | null> {
  if (memory !== undefined) return memory;
  try {
    const stored = await run<Blob | undefined>("readonly", (store) =>
      store.get(KEY),
    );
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function forgetPhoto(): Promise<boolean> {
  memory = null;
  try {
    await run("readwrite", (store) => store.delete(KEY));
    return true;
  } catch {
    // A failed transaction does not prove an older stored portrait was deleted.
    return false;
  }
}
