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
  assert.match(source, /buildLiveDocRevisionPreview\(head, previewRevision\)/);
  assert.match(source, /const previewChangedIds = preview\.changedSectionIds/);
});

test("Live Doc links use the same right-panel file and web handlers as conversation links", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");
  const appShell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

  assert.match(source, /<MarkdownBody cwd=\{cwd\} onOpenFile=\{onOpenFile\} onOpenUrl=\{onOpenUrl\}>/);
  assert.match(appShell, /<LiveDocViewer[\s\S]*?cwd=\{activeCwd \?\? undefined\}[\s\S]*?onOpenFile=\{handleOpenLinkedFile\}[\s\S]*?onOpenUrl=\{handleOpenWebUrl\}/);
});

test("a plain click switches existing document context without hijacking selections or controls", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(previewRevisionId \|\| !focusedSectionId \|\| section\.id === focusedSectionId \|\| !onStartDiscussion\) return/);
  assert.match(source, /target\?\.closest\("a, button, input, textarea, select, summary"\)/);
  assert.match(source, /if \(selection && !selection\.isCollapsed\) return/);
  assert.match(source, /onClick=\{\(event\) => switchDiscussionTarget\(section, event\)\}/);
  assert.match(source, /Click to switch the document context/);
  assert.match(source, /title="Discuss this section"/);
  assert.match(source, /↳ Discuss selection/);
});
