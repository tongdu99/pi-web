import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every rendered Live Doc section has a hover-only lower-right update action", async () => {
  const source = await readFile(new URL("./LiveDocViewer.tsx", import.meta.url), "utf8");

  assert.match(source, /head\.sections\.map\(\(section\) =>/);
  assert.match(source, /onMouseEnter=\{\(\) => setHoveredSectionId\(section\.id\)\}/);
  assert.match(source, /border: `1px solid \$\{sectionHovered/);
  assert.match(source, /position: "absolute", bottom: 5, right: 7/);
  assert.match(source, /opacity: sectionHovered \? 1 : 0/);
  assert.match(source, /pointerEvents: sectionHovered \? "auto" : "none"/);
});
