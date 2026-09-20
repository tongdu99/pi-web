import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { buildLiveDocRevisionPreview } = await jiti.import("./live-doc-preview.ts");

function revision(id, sections) {
  return { id, previousRevisionId: null, createdAt: "2026-01-01T00:00:00Z", sections };
}

test("hovering the current snapshot reports no changed sections", () => {
  const head = revision("current", [{ id: "summary", markdown: "# Summary\nCurrent" }]);
  const preview = buildLiveDocRevisionPreview(head, head);

  assert.deepEqual([...preview.changedSectionIds], []);
  assert.deepEqual(preview.sections, head.sections);
});

test("hover comparison is between the current document and the hovered snapshot", () => {
  const head = revision("current", [
    { id: "summary", markdown: "# Summary\nCurrent" },
    { id: "unchanged", markdown: "## Stable\nSame" },
    { id: "new", markdown: "## New\nAdded later" },
  ]);
  const hovered = revision("old", [
    { id: "summary", markdown: "# Summary\nOld" },
    { id: "removed", markdown: "## Removed\nOld content" },
    { id: "unchanged", markdown: "## Stable\nSame" },
  ]);

  const preview = buildLiveDocRevisionPreview(head, hovered);
  assert.deepEqual([...preview.changedSectionIds], ["summary", "new", "removed"]);
  assert.deepEqual(preview.sections.map((section) => section.id), ["summary", "removed", "unchanged", "new"]);
  assert.equal(preview.sections[0].markdown, "# Summary\nOld");
  assert.equal(preview.sections.at(-1).markdown, "## New\nAdded later");
});
