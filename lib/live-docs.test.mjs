import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  LiveDocConflictError,
  createLiveDoc,
  getLiveDoc,
  listLiveDocs,
  liveDocContent,
  renameLiveDoc,
  restoreLiveDoc,
  splitLiveDocSections,
  updateLiveDoc,
} = await jiti.import("./live-docs.ts");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-live-docs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("creates, lists, and renames a session-linked live doc", async (t) => {
  const root = await fixture(t);
  const created = await createLiveDoc("session-a", undefined, root);
  assert.equal(created.title, "Untitled.md");
  assert.equal(liveDocContent(created), "");
  assert.deepEqual((await listLiveDocs("session-a", root)).map((doc) => doc.id), [created.id]);
  assert.deepEqual(await listLiveDocs("session-b", root), []);
  const second = await createLiveDoc("session-a", undefined, root);
  assert.equal(second.title, "Untitled 2.md");

  const renamed = await renameLiveDoc(created.id, "Review.md", root);
  assert.equal(renamed.title, "Review.md");
  assert.equal((await getLiveDoc(created.id, root))?.title, "Review.md");
});

test("whole-doc updates retain heading section ids", async (t) => {
  const root = await fixture(t);
  const created = await createLiveDoc("session-a", undefined, root);
  const first = await updateLiveDoc(created.id, {
    expectedRevisionId: created.headRevisionId,
    replacementMarkdown: "# Summary\n\nInitial.\n\n## Finding\n\nInvalid.",
    requestId: "request-1",
  }, root);
  const firstHead = first.revisions.at(-1);
  assert.equal(firstHead.sections.length, 2);

  const second = await updateLiveDoc(created.id, {
    expectedRevisionId: first.headRevisionId,
    replacementMarkdown: "# Summary\n\nRevised.\n\n## Finding\n\nStill invalid.",
  }, root);
  assert.deepEqual(
    second.revisions.at(-1).sections.map((section) => section.id),
    firstHead.sections.map((section) => section.id),
  );
});

test("a regional update promotes newly introduced headings to addressable sections", async (t) => {
  const root = await fixture(t);
  const created = await createLiveDoc("session-a", undefined, root);
  const populated = await updateLiveDoc(created.id, {
    expectedRevisionId: created.headRevisionId,
    replacementMarkdown: "## Capabilities\n\nInitial.\n\n## Verification\n\nPassed.",
  }, root);
  const original = populated.revisions.at(-1).sections[0];
  const following = populated.revisions.at(-1).sections[1];
  const revised = await updateLiveDoc(created.id, {
    expectedRevisionId: populated.headRevisionId,
    sectionId: original.id,
    replacementMarkdown: "## Capabilities\n\nInitial.\n\n### Renaming\n\nRename details.",
  }, root);
  const sections = revised.revisions.at(-1).sections;

  assert.equal(sections.length, 3);
  assert.equal(sections[0].id, original.id);
  assert.match(sections[1].markdown, /^### Renaming/);
  assert.notEqual(sections[1].id, original.id);
  assert.notEqual(sections[1].id, following.id);
  assert.equal(sections[2].id, following.id);
});

test("section updates, idempotency, conflicts, and restore preserve history", async (t) => {
  const root = await fixture(t);
  const created = await createLiveDoc("session-a", undefined, root);
  const populated = await updateLiveDoc(created.id, {
    expectedRevisionId: created.headRevisionId,
    replacementMarkdown: "# Summary\n\nInitial.\n\n## Finding\n\nInvalid.",
  }, root);
  const finding = populated.revisions.at(-1).sections[1];
  const revised = await updateLiveDoc(created.id, {
    expectedRevisionId: populated.headRevisionId,
    sectionId: finding.id,
    replacementMarkdown: "## Finding\n\nCorrected.",
    requestId: "section-request",
  }, root);
  assert.match(liveDocContent(revised), /Corrected/);

  const duplicate = await updateLiveDoc(created.id, {
    expectedRevisionId: populated.headRevisionId,
    sectionId: finding.id,
    replacementMarkdown: "ignored",
    requestId: "section-request",
  }, root);
  assert.equal(duplicate.headRevisionId, revised.headRevisionId);
  assert.equal(duplicate.revisions.length, revised.revisions.length);

  await assert.rejects(
    updateLiveDoc(created.id, {
      expectedRevisionId: populated.headRevisionId,
      replacementMarkdown: "stale",
    }, root),
    LiveDocConflictError,
  );

  const restored = await restoreLiveDoc(created.id, populated.headRevisionId, revised.headRevisionId, root);
  assert.match(liveDocContent(restored), /Invalid/);
  assert.equal(restored.revisions.length, revised.revisions.length + 1);
});

test("section splitting handles preambles and empty documents", () => {
  assert.deepEqual(splitLiveDocSections(""), []);
  const sections = splitLiveDocSections("Preamble\n\n# One\nText\n\n## Two\nText");
  assert.deepEqual(sections.map((section) => section.markdown), [
    "Preamble",
    "# One\nText",
    "## Two\nText",
  ]);

  const previous = [
    { id: "capabilities", markdown: "## Capabilities\nOld" },
    { id: "verification", markdown: "## Verification\nOld" },
  ];
  const inserted = splitLiveDocSections(
    "## Capabilities\nNew\n\n### Renaming\nDetails\n\n## Verification\nNew",
    previous,
  );
  assert.equal(inserted[0].id, "capabilities");
  assert.notEqual(inserted[1].id, "verification");
  assert.equal(inserted[2].id, "verification");
});
