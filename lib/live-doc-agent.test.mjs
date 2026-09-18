import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jiti = createJiti(import.meta.url);
const {
  clearActiveLiveDocBinding,
  createLiveDocUpdateTool,
  getActiveLiveDocBinding,
  setActiveLiveDocBinding,
} = await jiti.import("./live-doc-agent.ts");
const { createLiveDoc, getLiveDoc, liveDocContent } = await jiti.import("./live-docs.ts");

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

test("the host-bound tool commits only the bound Live Doc", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-live-tool-"));
  const previousRoot = process.env.PI_WEB_LIVE_DOCS_DIR;
  process.env.PI_WEB_LIVE_DOCS_DIR = root;
  t.after(async () => {
    clearActiveLiveDocBinding("session-tool", "request-tool");
    if (previousRoot === undefined) delete process.env.PI_WEB_LIVE_DOCS_DIR;
    else process.env.PI_WEB_LIVE_DOCS_DIR = previousRoot;
    await rm(root, { recursive: true, force: true });
  });
  const doc = await createLiveDoc("session-tool");
  setActiveLiveDocBinding({
    requestId: "request-tool",
    sessionId: "session-tool",
    docId: doc.id,
    expectedRevisionId: doc.headRevisionId,
    purpose: "merge-response",
  });
  const tool = createLiveDocUpdateTool();
  const result = await tool.execute(
    "call-1",
    { replacementMarkdown: "# Review\n\nNo findings.", summary: "Added review" },
    new AbortController().signal,
    undefined,
    { sessionManager: { getSessionId: () => "session-tool" } },
  );
  const updated = await getLiveDoc(doc.id);
  assert.equal(liveDocContent(updated), "# Review\n\nNo findings.");
  assert.match(result.content[0].text, /Updated Untitled\.md/);

  await assert.rejects(
    tool.execute(
      "call-2",
      { replacementMarkdown: "wrong" },
      new AbortController().signal,
      undefined,
      { sessionManager: { getSessionId: () => "other-session" } },
    ),
    /No active Live Doc update/,
  );
});
