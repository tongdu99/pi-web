import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defaults the Live Doc composer to the whole document", async () => {
  const composer = await readFile(new URL("./LiveDocComposer.tsx", import.meta.url), "utf8");

  assert.match(composer, /if \(!composer\.canSend \|\| composer\.busy \|\| wholeTargetRequestedForRef\.current === docId\) return/);
  assert.match(composer, /composer\.onTargetWholeDocument\(docId\)/);
});

test("switches composer ownership by clicking either composer", async () => {
  const chat = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  const liveComposer = await readFile(new URL("./LiveDocComposer.tsx", import.meta.url), "utf8");
  const sessionComposer = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

  assert.match(chat, /composerOwner === "live-doc"/);
  assert.match(chat, /handleReturnFromLiveDoc[\s\S]*?setComposerOwner\("session"\)/);
  assert.match(liveComposer, /onClick=\{activate\}/);
  assert.match(liveComposer, /if \(!composer\.target\)[\s\S]*?composer\.onTargetWholeDocument\(docId\)/);
  assert.match(sessionComposer, /aria-label="Activate session composer"/);
});

test("matches the session composer growth and card treatment", async () => {
  const composer = await readFile(new URL("./LiveDocComposer.tsx", import.meta.url), "utf8");

  assert.match(composer, /textarea\.style\.height = "auto"/);
  assert.match(composer, /Math\.min\(textarea\.scrollHeight, 200\)/);
  assert.match(composer, /borderLeft: "3px solid #a855f7"/);
});

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
  assert.match(source, /!activeThread && !activeLiveDocThread && !backgroundLiveDocRun && liveDocThreads\.length > 0/);
  assert.match(source, /expandedLiveDocConversationDocs\.has\(docId\)/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /\{expanded && threads\.map/);
});

test("runs Live Doc panel requests in the existing session without replacing the main transcript", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /const handleLiveDocPanelSend/);
  assert.match(source, /messages = backgroundLiveDocRun/);
  assert.match(source, /setBackgroundLiveDocRun\(\{ threadEntryId, hostLeafId/);
  assert.match(source, /if \(run\.hostLeafId\) await handleLeafChange\(run\.hostLeafId\)/);
  assert.match(source, /setPendingLiveDocThread\(\{ \.\.\.run\.target, threadEntryId: run\.threadEntryId/);
  assert.match(source, /Updating Live Doc/);
  assert.match(source, /sectionId: "", sectionLabel: "Whole document"/);
  assert.match(source, /showMainLiveProcessPanel = !activeThread && !backgroundLiveDocRun && showLiveProcessPanel/);
});

test("runs Add to Live Doc in a durable document conversation", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /handleStartLiveDocThread\(doc\.id, "", "Whole document", "", "merge-response"\)/);
  assert.match(source, /discussionEntryId: result\.threadEntryId/);
  assert.match(source, /activeLiveDocContext = activeLiveDocThread/);
});
