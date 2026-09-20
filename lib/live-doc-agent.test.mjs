import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jiti = createJiti(import.meta.url);
const {
  buildLiveDocContext,
  clearActiveLiveDocBinding,
  createLiveDocUpdateTool,
  getActiveLiveDocBinding,
  setActiveLiveDocBinding,
} = await jiti.import("./live-doc-agent.ts");
const { createLiveDoc, getLiveDoc, liveDocContent, updateLiveDoc } = await jiti.import("./live-docs.ts");

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

test("section Live Doc context modes avoid unnecessary full-document copies", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-live-context-"));
  const previousRoot = process.env.PI_WEB_LIVE_DOCS_DIR;
  process.env.PI_WEB_LIVE_DOCS_DIR = root;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.PI_WEB_LIVE_DOCS_DIR;
    else process.env.PI_WEB_LIVE_DOCS_DIR = previousRoot;
    await rm(root, { recursive: true, force: true });
  });
  let doc = await createLiveDoc("session-context");
  doc = await updateLiveDoc(doc.id, {
    expectedRevisionId: doc.headRevisionId,
    replacementMarkdown: "# First\n\nAlpha\n\n## Target\n\nBeta\n\n## Last\n\nGamma",
  });
  const target = doc.revisions.find((revision) => revision.id === doc.headRevisionId).sections[1];
  const binding = {
    requestId: "request-context",
    sessionId: "session-context",
    docId: doc.id,
    expectedRevisionId: doc.headRevisionId,
    sectionId: target.id,
    purpose: "discussion",
  };

  const sectionContext = await buildLiveDocContext({ ...binding, contextMode: "section" });
  assert.match(sectionContext, /Current bound section:[\s\S]*Beta/);
  assert.doesNotMatch(sectionContext, /Alpha|Gamma|Current complete Live Doc/);

  const relevantContext = await buildLiveDocContext({ ...binding, contextMode: "relevant" });
  assert.match(relevantContext, /Document outline:[\s\S]*# First[\s\S]*## Target[\s\S]*## Last/);
  assert.match(relevantContext, /Previous section:[\s\S]*Alpha/);
  assert.match(relevantContext, /Next section:[\s\S]*Gamma/);
  assert.doesNotMatch(relevantContext, /Current complete Live Doc/);

  const fullContext = await buildLiveDocContext({ ...binding, contextMode: "full" });
  assert.match(fullContext, /Current complete Live Doc:[\s\S]*Alpha[\s\S]*Beta[\s\S]*Gamma/);
  assert.doesNotMatch(fullContext, /Current bound section:/);
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
  assert.match(tool.promptSnippet, /bound to the current Pi Web request/);
  assert.match(tool.promptGuidelines[0], /Use live_doc_update/);
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
