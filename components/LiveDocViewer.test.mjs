import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every rendered Live Doc section has a hover-only lower-right update action", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /displayedSections\.map\(\(section\) =>/);
  assert.match(source, /onMouseEnter=\{\(\) => setHoveredSectionId\(section\.id\)\}/);
  assert.match(source, /const sectionFocused = !previewRevision && focusedSectionId === section\.id/);
  assert.match(source, /outline: sectionChangedInPreview/);
  assert.match(source, /data-live-doc-revision-change=\{sectionChangedInPreview \|\| undefined\}/);
  assert.match(source, /background: sectionChangedInPreview/);
  assert.match(source, /position: "relative", margin: 0, padding: 0/);
  assert.match(source, /position: "absolute", bottom: 0, right: 0, transform: "translateY\(50%\)"/);
  assert.match(source, /opacity: sectionHovered \? 1 : 0/);
  assert.match(source, /pointerEvents: sectionHovered \? "auto" : "none"/);
  assert.match(source, /scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
});

test("history separates archived snapshots and previews a revision on hover", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /revisionGroup\("History", mainRevisionIds\)/);
  assert.match(source, /revisionGroup\("Archived", archivedRevisionIds\)/);
  assert.match(source, /onMouseEnter=\{\(\) => setPreviewRevisionId\(revision\.id\)\}/);
  assert.match(source, /const previewed = revisionId === previewRevisionId/);
  assert.match(source, /data-live-doc-preview-revision=\{previewed \|\| undefined\}/);
  assert.match(source, /background: previewed \?/);
  assert.match(source, /findAdjacentNewerRevision\(doc\.revisions, previewRevisionIds, previewRevision\.id\) \?\? head/);
  assert.match(source, /buildLiveDocRevisionPreview\(previewComparisonRevision, previewRevision\)/);
  assert.match(source, /const previewChangedIds = preview\.changedSectionIds/);
  assert.match(source, /querySelectorAll<HTMLElement>\("\[data-live-doc-revision-change\]"\)/);
  assert.match(source, /sectionOutsideViewport \?\? changedSections\[0\]/);
  assert.match(source, /scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
});

test("Live Doc links use the same right-panel file and web handlers as conversation links", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");
  const appShell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

  assert.match(source, /<MarkdownBody cwd=\{cwd\} onOpenFile=\{onOpenFile\} onOpenUrl=\{onOpenUrl\}>/);
  assert.match(appShell, /<LiveDocViewer[\s\S]*?cwd=\{activeCwd \?\? undefined\}[\s\S]*?onOpenFile=\{handleOpenLinkedFile\}[\s\S]*?onOpenUrl=\{handleOpenWebUrl\}/);
});

test("a first plain click sets document context without hijacking selections or controls", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(previewRevisionId \|\| section\.id === focusedSectionId \|\| !onStartDiscussion\) return/);
  assert.doesNotMatch(source, /previewRevisionId \|\| !focusedSectionId/);
  assert.match(source, /target\?\.closest\("a, button, input, textarea, select, summary"\)/);
  assert.match(source, /if \(selection && !selection\.isCollapsed\) return/);
  assert.match(source, /onClick=\{\(event\) => switchDiscussionTarget\(section, event\)\}/);
  assert.match(source, /Click to set the document context/);
  assert.match(source, /title="Start a document conversation about this section"/);
  assert.match(source, /↳ Discuss & update selection/);
});

test("each Live Doc exposes its own conversations and revision provenance", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");
  const appShell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

  assert.match(source, /Conversations \(\{conversations\.length\}\)/);
  assert.match(source, /No conversations for this document yet/);
  assert.match(source, /onOpenDiscussion\?\.\(conversation\.id\)/);
  assert.match(source, /revision\.source\?\.discussionEntryId/);
  assert.match(appShell, /liveDocConversations\.filter\(\(conversation\) => conversation\.docId === activeFileTab\.liveDocId\)/);
});
