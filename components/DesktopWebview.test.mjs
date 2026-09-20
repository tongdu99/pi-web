import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8");

test("desktop webviews reject accidental trackpad zoom", () => {
  assert.match(source, /contents\.setZoomFactor\(1\)/);
  assert.match(source, /contents\.setVisualZoomLevelLimits\(1, 1\)/);
  assert.match(source, /contents\.on\("zoom-changed", \(event\) => \{/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /contents\.on\("did-navigate", \(\) => contents\.setZoomFactor\(1\)\)/);
});
