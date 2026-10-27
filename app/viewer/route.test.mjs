import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("the standalone viewer can be embedded by any page", () => {
  // The viewer is read-only and never messages its parent, so framing it
  // (Pagebox, dashboards, other tools) exposes nothing to the embedder.
  assert.doesNotMatch(source, /frame-ancestors/);
  assert.doesNotMatch(source, /X-Frame-Options/);
});

test("the viewer still blocks script other than its own nonce script", () => {
  assert.match(source, /default-src 'none'; script-src 'nonce-\$\{nonce\}'/);
});
