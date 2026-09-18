import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { collectLiveDocThreads, findActiveLiveDocThread, parseLiveDocThreadMetadata } = await jiti.import("./live-doc-discussions.ts");

const entry = (id, type, parentId, extra = {}) => ({ id, type, parentId, timestamp: "2026-01-01T00:00:00.000Z", ...extra });
const node = (entryValue, children = [], compressedEntryIds) => ({ entry: entryValue, children, compressedEntryIds });

test("parses and locates a Live Update Discussion branch", () => {
  const metadata = {
    version: 1,
    docId: "doc-12345678",
    sectionId: "section-12345678",
    selectedText: "Finding",
    hostLeafId: "assistant",
    status: "open",
  };
  assert.deepEqual(parseLiveDocThreadMetadata(metadata), metadata);
  const thread = node(entry("thread", "custom", "assistant", { customType: "pi-web.live-doc-thread", data: metadata }), [
    node(entry("reply", "message", "thread")),
  ]);
  const threads = collectLiveDocThreads([node(entry("assistant", "message", null), [thread])]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].latestLeafId, "reply");
  assert.equal(findActiveLiveDocThread(threads, "reply")?.docId, "doc-12345678");
  assert.equal(findActiveLiveDocThread(threads, "assistant"), null);
});
