import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every rendered Live Doc section has a hover-only lower-right update action", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /head\.sections\.map\(\(section\) =>/);
  assert.match(source, /onMouseEnter=\{\(\) => setHoveredSectionId\(section\.id\)\}/);
  assert.match(source, /const sectionFocused = focusedSectionId === section\.id/);
  assert.match(source, /outline: sectionFocused/);
  assert.match(source, /position: "relative", margin: 0, padding: 0/);
  assert.match(source, /position: "absolute", bottom: 0, right: 0, transform: "translateY\(50%\)"/);
  assert.match(source, /opacity: sectionHovered \? 1 : 0/);
  assert.match(source, /pointerEvents: sectionHovered \? "auto" : "none"/);
  assert.match(source, /scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
});

test("a plain click switches an existing Live Update target without hijacking selections or controls", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(!focusedSectionId \|\| section\.id === focusedSectionId \|\| !onStartDiscussion\) return/);
  assert.match(source, /target\?\.closest\("a, button, input, textarea, select, summary"\)/);
  assert.match(source, /if \(selection && !selection\.isCollapsed\) return/);
  assert.match(source, /onClick=\{\(event\) => switchDiscussionTarget\(section, event\)\}/);
  assert.match(source, /Click to switch the Live Update target/);
});
