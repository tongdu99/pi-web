import { randomUUID } from "crypto";
import { mkdir, readdir, readFile } from "fs/promises";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";

export const LIVE_DOC_FORMAT = "text/markdown";
export const LIVE_DOC_SCHEMA_VERSION = 1;
export const MAX_LIVE_DOC_BYTES = 1_000_000;

export interface LiveDocSection {
  id: string;
  markdown: string;
}

export interface LiveDocRevision {
  id: string;
  previousRevisionId: string | null;
  createdAt: string;
  sections: LiveDocSection[];
  source?: { sessionId?: string; discussionEntryId?: string; requestId?: string };
  summary?: string;
}

export interface LiveDocRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  format: typeof LIVE_DOC_FORMAT;
  createdAt: string;
  updatedAt: string;
  sessionIds: string[];
  headRevisionId: string;
  revisions: LiveDocRevision[];
}

export interface LiveDocSummary {
  id: string;
  title: string;
  format: typeof LIVE_DOC_FORMAT;
  createdAt: string;
  updatedAt: string;
  sessionIds: string[];
  headRevisionId: string;
}

export class LiveDocConflictError extends Error {
  constructor(public readonly currentRevisionId: string) {
    super("The live doc changed since this update started");
    this.name = "LiveDocConflictError";
  }
}

const globalState = globalThis as typeof globalThis & {
  __piWebLiveDocLocks?: Map<string, Promise<void>>;
};
const locks = globalState.__piWebLiveDocLocks ??= new Map<string, Promise<void>>();

function rootDir(root?: string): string {
  return root ?? join(getAgentDir(), "pi-web", "live-docs");
}

function assertId(id: string): void {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error("Invalid live doc id");
}

function docPath(id: string, root?: string): string {
  assertId(id);
  return join(rootDir(root), `${id}.json`);
}

function normalizedTitle(title: string): string {
  const value = title.trim().replace(/[\r\n\0]/g, " ").slice(0, 160);
  if (!value) throw new Error("Live doc name is required");
  return value;
}

function validateContent(content: string): string {
  if (Buffer.byteLength(content, "utf8") > MAX_LIVE_DOC_BYTES) {
    throw new Error("Live doc content is too large");
  }
  return content.replace(/\r\n/g, "\n");
}

function headingKey(markdown: string): string | null {
  const first = markdown.split("\n", 1)[0]?.trim() ?? "";
  const match = first.match(/^#{1,6}\s+(.+)$/);
  return match ? match[1].replace(/\s+#+\s*$/, "").trim().toLocaleLowerCase() : null;
}

export function splitLiveDocSections(markdown: string, previous: LiveDocSection[] = []): LiveDocSection[] {
  const content = validateContent(markdown);
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) && current.some((value) => value.trim())) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((value) => value.trim())) chunks.push(current.join("\n").trim());

  const previousByHeading = new Map<string, LiveDocSection>();
  for (const section of previous) {
    const key = headingKey(section.markdown);
    if (key && !previousByHeading.has(key)) previousByHeading.set(key, section);
  }
  const used = new Set<string>();
  return chunks.map((chunk, index) => {
    const byHeading = headingKey(chunk);
    const candidate = (byHeading ? previousByHeading.get(byHeading) : undefined)
      ?? previous[index];
    const id = candidate && !used.has(candidate.id) ? candidate.id : randomUUID();
    used.add(id);
    return { id, markdown: chunk };
  });
}

export function liveDocContent(doc: LiveDocRecord, revisionId = doc.headRevisionId): string {
  const revision = doc.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error("Live doc revision not found");
  return revision.sections.map((section) => section.markdown).join("\n\n");
}

function summary(doc: LiveDocRecord): LiveDocSummary {
  return {
    id: doc.id,
    title: doc.title,
    format: doc.format,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sessionIds: [...doc.sessionIds],
    headRevisionId: doc.headRevisionId,
  };
}

async function withLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const prior = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = prior.then(() => current);
  locks.set(id, queued);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(id) === queued) locks.delete(id);
  }
}

async function writeRecord(doc: LiveDocRecord, root?: string): Promise<void> {
  await mkdir(rootDir(root), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(docPath(doc.id, root), `${JSON.stringify(doc, null, 2)}\n`);
}

export async function getLiveDoc(id: string, root?: string): Promise<LiveDocRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(docPath(id, root), "utf8")) as LiveDocRecord;
    if (parsed.schemaVersion !== LIVE_DOC_SCHEMA_VERSION || parsed.id !== id || !Array.isArray(parsed.revisions)) {
      throw new Error("Unsupported live doc data");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listLiveDocs(sessionId: string, root?: string): Promise<LiveDocSummary[]> {
  let names: string[];
  try {
    names = await readdir(rootDir(root));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const docs = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try { return await getLiveDoc(name.slice(0, -5), root); } catch { return null; }
  }));
  return docs
    .filter((doc): doc is LiveDocRecord => Boolean(doc?.sessionIds.includes(sessionId)))
    .map(summary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createLiveDoc(sessionId: string, title?: string, root?: string): Promise<LiveDocRecord> {
  if (!sessionId) throw new Error("Session id is required");
  return withLock(`session-${sessionId}`, async () => {
    let resolvedTitle = title;
    if (!resolvedTitle) {
      const existing = new Set((await listLiveDocs(sessionId, root)).map((doc) => doc.title.toLocaleLowerCase()));
      let index = 1;
      resolvedTitle = "Untitled.md";
      while (existing.has(resolvedTitle.toLocaleLowerCase())) {
        index += 1;
        resolvedTitle = `Untitled ${index}.md`;
      }
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const revision: LiveDocRevision = {
      id: randomUUID(),
      previousRevisionId: null,
      createdAt: now,
      sections: [],
      source: { sessionId },
      summary: "Created live doc",
    };
    const doc: LiveDocRecord = {
      schemaVersion: LIVE_DOC_SCHEMA_VERSION,
      id,
      title: normalizedTitle(resolvedTitle),
      format: LIVE_DOC_FORMAT,
      createdAt: now,
      updatedAt: now,
      sessionIds: [sessionId],
      headRevisionId: revision.id,
      revisions: [revision],
    };
    await writeRecord(doc, root);
    publishLiveDocEvent({ type: "created", docId: id, revisionId: revision.id, sessionIds: doc.sessionIds });
    return doc;
  });
}

export async function renameLiveDoc(id: string, title: string, root?: string): Promise<LiveDocRecord> {
  return withLock(id, async () => {
    const doc = await getLiveDoc(id, root);
    if (!doc) throw new Error("Live doc not found");
    doc.title = normalizedTitle(title);
    doc.updatedAt = new Date().toISOString();
    await writeRecord(doc, root);
    publishLiveDocEvent({ type: "renamed", docId: id, revisionId: doc.headRevisionId, sessionIds: doc.sessionIds });
    return doc;
  });
}

export interface UpdateLiveDocInput {
  expectedRevisionId: string;
  replacementMarkdown: string;
  sectionId?: string;
  requestId?: string;
  sessionId?: string;
  discussionEntryId?: string;
  summary?: string;
}

export async function updateLiveDoc(id: string, input: UpdateLiveDocInput, root?: string): Promise<LiveDocRecord> {
  return withLock(id, async () => {
    const doc = await getLiveDoc(id, root);
    if (!doc) throw new Error("Live doc not found");
    if (input.requestId) {
      const existing = doc.revisions.find((revision) => revision.source?.requestId === input.requestId);
      if (existing) return doc;
    }
    if (doc.headRevisionId !== input.expectedRevisionId) throw new LiveDocConflictError(doc.headRevisionId);
    const head = doc.revisions.find((revision) => revision.id === doc.headRevisionId)!;
    let sections: LiveDocSection[];
    if (input.sectionId) {
      const index = head.sections.findIndex((section) => section.id === input.sectionId);
      if (index === -1) throw new Error("The selected live doc section no longer exists");
      sections = head.sections.map((section) => ({ ...section }));
      const replacement = validateContent(input.replacementMarkdown).trim();
      if (replacement) sections[index] = { id: input.sectionId, markdown: replacement };
      else sections.splice(index, 1);
    } else {
      sections = splitLiveDocSections(input.replacementMarkdown, head.sections);
    }
    const now = new Date().toISOString();
    const revision: LiveDocRevision = {
      id: randomUUID(),
      previousRevisionId: doc.headRevisionId,
      createdAt: now,
      sections,
      source: {
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.discussionEntryId ? { discussionEntryId: input.discussionEntryId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
      },
      ...(input.summary?.trim() ? { summary: input.summary.trim().slice(0, 300) } : {}),
    };
    doc.revisions.push(revision);
    doc.headRevisionId = revision.id;
    doc.updatedAt = now;
    await writeRecord(doc, root);
    publishLiveDocEvent({ type: "updated", docId: id, revisionId: revision.id, sessionIds: doc.sessionIds });
    return doc;
  });
}

export async function restoreLiveDoc(id: string, revisionId: string, expectedRevisionId: string, root?: string): Promise<LiveDocRecord> {
  const doc = await getLiveDoc(id, root);
  if (!doc) throw new Error("Live doc not found");
  const target = doc.revisions.find((revision) => revision.id === revisionId);
  if (!target) throw new Error("Live doc revision not found");
  return updateLiveDoc(id, {
    expectedRevisionId,
    replacementMarkdown: target.sections.map((section) => section.markdown).join("\n\n"),
    summary: `Restored revision ${revisionId.slice(0, 8)}`,
  }, root);
}

export type LiveDocEvent = {
  type: "created" | "renamed" | "updated";
  docId: string;
  revisionId: string;
  sessionIds: string[];
};
type LiveDocListener = (event: LiveDocEvent) => void;
const eventState = globalThis as typeof globalThis & { __piWebLiveDocListeners?: Set<LiveDocListener> };
const listeners = eventState.__piWebLiveDocListeners ??= new Set<LiveDocListener>();

export function subscribeLiveDocs(listener: LiveDocListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publishLiveDocEvent(event: LiveDocEvent): void {
  for (const listener of listeners) listener(event);
}
