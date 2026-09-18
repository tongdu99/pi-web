import assert from "node:assert/strict";
import test from "node:test";
import { liveDocsEnabled } from "./live-doc-feature.ts";

test("Live Docs are enabled by default and can be disabled explicitly", () => {
  assert.equal(liveDocsEnabled(undefined), true);
  assert.equal(liveDocsEnabled("1"), true);
  assert.equal(liveDocsEnabled("0"), false);
  assert.equal(liveDocsEnabled("false"), false);
});
