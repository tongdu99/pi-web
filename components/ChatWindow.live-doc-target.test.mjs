import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the persistent Live Doc section target and allows replacing it", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /onLiveDocTargetStateChange\?\.\(liveDocTargetState\)/);
  assert.match(source, /liveDocConversationLabel\(/);
  assert.match(source, /if \(activeLiveDocThread && !\(await leaveActiveLiveDocThread\(activeLiveDocThread\)\)\) return/);
  assert.match(source, /sectionLabel: liveDocSectionPreview\(section\.markdown\)/);
  assert.match(source, /pendingLiveDocThread\.sectionLabel/);
});

test("keeps completed document discussions discoverable from the main conversation", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /t\("chat\.documentConversations", \{ count: liveDocThreads\.length \}\)/);
  assert.match(source, /liveDocThreadsByDoc\.entries\(\)/);
  assert.match(source, /<LiveDocDiscussionPanel/);
  assert.match(source, /handleContinueLiveDocThread\(thread\)/);
  assert.match(source, /!activeThread && !activeLiveDocThread && liveDocThreads\.length > 0/);
});

test("runs Add to Live Doc in a durable document conversation", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /handleStartLiveDocThread\(doc\.id, "", "Whole document", "", "merge-response"\)/);
  assert.match(source, /discussionEntryId: result\.threadEntryId/);
  assert.match(source, /activeLiveDocContext = activeLiveDocThread/);
});
