import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { discussionDelta, documentOutcome } = await jiti.import("./LiveDocDiscussionPanel.tsx");

const thread = {
  id: "thread",
  latestLeafId: "answer",
  docId: "doc",
  sectionId: "section",
  sectionLabel: "Finding",
  selectedText: "finding text",
  hostLeafId: "host",
  status: "open",
  version: 1,
  node: {},
};

test("a document discussion card excludes inherited main-conversation context", () => {
  const context = {
    entryIds: ["old-user", "host", "context", "request", "answer"],
    messages: [
      { role: "user", content: "old request" },
      { role: "assistant", content: [{ type: "text", text: "review" }] },
      { role: "custom", customType: "pi-web.live-doc-context", content: "document", display: false },
      { role: "user", content: "Post this as a GitHub comment" },
      { role: "assistant", content: [{ type: "text", text: "Posted the comment." }] },
    ],
  };

  const delta = discussionDelta(context, thread);
  assert.deepEqual(delta.entryIds, ["request", "answer"]);
  assert.equal(delta.messages[0].content, "Post this as a GitHub comment");
});

test("document impact distinguishes external actions from document updates", () => {
  const externalAction = [
    { role: "user", content: "Post this as a GitHub comment" },
    { role: "assistant", content: [{ type: "text", text: "Posted." }] },
  ];
  assert.equal(documentOutcome(externalAction), "unchanged");

  const update = [
    { role: "assistant", content: [{ type: "toolCall", toolCallId: "call-1", toolName: "live_doc_update", input: {} }] },
    { role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "Updated Review.md" }], isError: false },
  ];
  assert.equal(documentOutcome(update), "updated");

  assert.equal(documentOutcome([{ ...update[0] }, { ...update[1], isError: true }]), "failed");
});
