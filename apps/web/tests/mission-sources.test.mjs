import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceMessage, sourceUrl } from "../src/missionSourceData.ts";

test("source links allow web URLs but never script, credentials or malformed URLs", () => {
  assert.equal(sourceUrl("https://docs.python.org/3/tutorial/"), "https://docs.python.org/3/tutorial/");
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "file:///private", "//example.org", "https://secret@evil.example", "https://[bad", "https://bad\\@example.org", "https://bad\n.example.org"])
    assert.equal(sourceUrl(url), null, url);
});

test("source messages distinguish no key, failed search, empty results and real related reading", () => {
  assert.match(sourceMessage(undefined, false), /isn't configured/);
  assert.match(sourceMessage("not_configured"), /without web sources/);
  assert.match(sourceMessage("unavailable", true), /try again/);
  assert.match(sourceMessage("empty", true), /no usable links/);
  assert.match(sourceMessage(undefined, true), /No web search has been run/);
  assert.match(sourceMessage("ready", true), /did not generate your mission/);
});
