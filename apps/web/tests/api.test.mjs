import { test } from "node:test";
import assert from "node:assert/strict";
import { turn } from "../src/api.ts";

test("SSE handles byte-fragmented unicode and CRLF frames", async () => {
  const original = globalThis.fetch;
  const bytes = new TextEncoder().encode(
    'event: sentence\r\ndata: {"text":"You’re ready."}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n',
  );
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      }),
    );
  try {
    const results = [];
    for await (const item of turn(
      "test",
      "hello",
      new AbortController().signal,
    ))
      results.push(item);
    assert.equal(results[0].data.text, "You’re ready.");
    assert.equal(results[1].event, "done");
  } finally {
    globalThis.fetch = original;
  }
});

test("truncated streams fail visibly rather than silently finishing", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('event: token\ndata: {"text":"hello"}\n\n');
  try {
    await assert.rejects(async () => {
      for await (const item of turn(
        "test",
        "hello",
        new AbortController().signal,
      )) {
        assert.equal(item.event, "token");
      }
    }, /interrupted/);
  } finally {
    globalThis.fetch = original;
  }
});
