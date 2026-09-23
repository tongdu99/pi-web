import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.deepEqual(second.revisions.at(-1).change, {
    changedSectionIds: firstHead.sections.map((section) => section.id),
    addedSectionIds: [],
    removedSectionIds: [],
  });
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
  assert.deepEqual(revised.revisions.at(-1).change, {
    targetSectionId: original.id,
    changedSectionIds: [],
    addedSectionIds: [sections[1].id],
    removedSectionIds: [],
  });
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
  assert.equal(restored.revisions.length, revised.revisions.length);
  assert.deepEqual(restored.mainRevisionIds, [created.headRevisionId, populated.headRevisionId]);
  assert.deepEqual(restored.archivedRevisionIds, [revised.headRevisionId]);

  const edited = await updateLiveDoc(created.id, {
    expectedRevisionId: restored.headRevisionId,
    replacementMarkdown: "# Summary\n\nNew path.",
  }, root);
  assert.deepEqual(edited.mainRevisionIds, [created.headRevisionId, populated.headRevisionId, edited.headRevisionId]);
  assert.deepEqual(edited.archivedRevisionIds, [revised.headRevisionId]);

  const restoredArchive = await restoreLiveDoc(created.id, revised.headRevisionId, edited.headRevisionId, root);
  assert.match(liveDocContent(restoredArchive), /Corrected/);
  assert.deepEqual(restoredArchive.mainRevisionIds, [revised.headRevisionId]);
  assert.deepEqual(restoredArchive.archivedRevisionIds, [created.headRevisionId, populated.headRevisionId, edited.headRevisionId]);
});

test("legacy snapshots backfill history lists and section change metadata", async (t) => {
  const root = await fixture(t);
  const created = await createLiveDoc("session-a", undefined, root);
  const updated = await updateLiveDoc(created.id, {
    expectedRevisionId: created.headRevisionId,
    replacementMarkdown: "# Summary\n\nAdded.",
  }, root);
  const path = join(root, `${created.id}.json`);
  const legacy = JSON.parse(await readFile(path, "utf8"));
  delete legacy.mainRevisionIds;
  delete legacy.archivedRevisionIds;
  for (const revision of legacy.revisions) delete revision.change;
  await writeFile(path, JSON.stringify(legacy));

  const loaded = await getLiveDoc(created.id, root);
  assert.deepEqual(loaded.mainRevisionIds, updated.revisions.map((revision) => revision.id));
  assert.deepEqual(loaded.archivedRevisionIds, []);
  assert.deepEqual(loaded.revisions.at(-1).change.addedSectionIds, [loaded.revisions.at(-1).sections[0].id]);
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
