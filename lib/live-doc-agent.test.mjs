import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  clearActiveLiveDocBinding,
  getActiveLiveDocBinding,
  setActiveLiveDocBinding,
} = await jiti.import("./live-doc-agent.ts");

test("active Live Doc bindings are session-scoped and request-safe", () => {
  const binding = {
    requestId: "request-a",
    sessionId: "session-a",
    docId: "doc-12345678",
    expectedRevisionId: "revision-a",
    purpose: "merge-response",
  };
  setActiveLiveDocBinding(binding);
  assert.equal(getActiveLiveDocBinding("session-a")?.docId, binding.docId);
  assert.equal(getActiveLiveDocBinding("session-b"), null);

  clearActiveLiveDocBinding("session-a", "older-request");
  assert.equal(getActiveLiveDocBinding("session-a")?.requestId, "request-a");
  clearActiveLiveDocBinding("session-a", "request-a");
  assert.equal(getActiveLiveDocBinding("session-a"), null);
});
