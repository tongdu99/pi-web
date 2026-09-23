import assert from "node:assert/strict";
import test from "node:test";
import { liveDocConversationLabel, liveDocSectionPreview } from "./live-doc-target.ts";

test("derives a compact section label from Markdown", () => {
  assert.equal(liveDocSectionPreview("## Verification\n\n- Full test suite passed."), "Verification Full test suite passed.");
  assert.equal(liveDocConversationLabel("Phase 1.md", "### Renaming a Live Doc\nDetails"), "Phase 1.md › Renaming a Live Doc Details");
});

test("bounds long section labels and handles empty selections", () => {
  assert.equal(liveDocSectionPreview("  "), "Selected section");
  assert.equal(liveDocSectionPreview("A very long section title", 10), "A very lon…");
});
