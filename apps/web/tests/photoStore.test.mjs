import { test } from "node:test";
import assert from "node:assert/strict";

function database({ fail = false, stored = new Blob(["old"]) } = {}) {
  let value = stored;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        if (fail) {
          request.error = new Error("Storage unavailable");
          request.onerror();
          return;
        }
        request.result = {
          close() {},
          transaction() {
            const tx = {
              objectStore: () => ({
                get: () => ({ result: value }),
                put: (blob) => {
                  value = blob;
                  return {};
                },
                delete: () => {
                  value = undefined;
                  return {};
                },
              }),
            };
            queueMicrotask(() => tx.oncomplete());
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
}

test("failed save retains the new page-only portrait over an older stored one", async () => {
  const store = await import("../src/avatar/photoStore.ts?save-failure");
  database({ fail: true });
  const replacement = new Blob(["new"]);
  assert.equal(await store.savePhoto(replacement), false);
  database();
  assert.equal(await store.loadPhoto(), replacement);
});

test("failed deletion reports uncertainty and does not restore the photo this visit", async () => {
  const store = await import("../src/avatar/photoStore.ts?delete-failure");
  database({ fail: true });
  assert.equal(await store.forgetPhoto(), false);
  database();
  assert.equal(await store.loadPhoto(), null);
});

test("successful deletion removes the durable copy for a fresh page", async () => {
  database();
  const store = await import("../src/avatar/photoStore.ts?success");
  assert.equal(await store.savePhoto(new Blob(["new"])), true);
  assert.equal(await store.forgetPhoto(), true);
  const fresh = await import("../src/avatar/photoStore.ts?fresh-page");
  assert.equal(await fresh.loadPhoto(), null);
});
