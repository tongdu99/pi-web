import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createHash } from "crypto";
import { mkdirSync } from "fs";
import { open, readdir, readFile, stat, type FileHandle } from "fs/promises";
import { dirname, join } from "path";
import { writePrivateFileAtomicSync } from "./atomic-file";

/**
 * Session-list scanner backed by a persisted, append-aware index.
 *
 * Session `.jsonl` files are append-only in normal use, so each file is parsed
 * once and afterwards only the bytes appended since the previous scan are read.
 * An unchanged file costs one stat(). The index survives restarts in
 * `<agentDir>/pi-web/session-list-index.json`, so a restarted server does not
 * re-read every transcript either.
 *
 * Every field matches what pi's `SessionManager.listAll()` derives (latest
 * session name, first user message, message count, last activity), so a long
 * session renamed mid-file keeps its name.
 *
 * Rewrites are detected and trigger a full re-parse of that file only: inode
 * change (atomic replace), shrink (truncation), header bytes change (pi-web's
 * delete-reparent rewrite), or the bytes just before the resume offset changing.
 */

const INDEX_VERSION = 1;
const READ_CHUNK_BYTES = 1024 * 1024;
const BOUNDARY_BYTES = 64;
const MAX_CONCURRENT_SCANS = 10;

export interface ScannedSession {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

interface IndexedHeader {
  id: string;
  cwd: string;
  timestamp: string;
  parentSession?: string;
}

/** Persisted per-file scan state. Exported for tests only. */
export interface IndexedSessionFile {
  size: number;
  mtimeMs: number;
  ino: number;
  /** Byte offset just past the last line that has been parsed. */
  scannedOffset: number;
  /** Base64 of up to BOUNDARY_BYTES bytes immediately before scannedOffset. */
  boundary: string;
  headerLength: number;
  headerHash: string;
  header: IndexedHeader;
  name?: string;
  firstMessage: string;
  messageCount: number;
  lastActivity?: number;
}

export interface ScanOptions {
  sessionsDir?: string;
  indexPath?: string;
  /** Test hook: accumulates the number of session-file bytes read. */
  stats?: { bytesRead: number };
}

interface IndexStore {
  indexPath: string;
  files: Map<string, IndexedSessionFile>;
}

declare global {
  var __piSessionListIndex: IndexStore | undefined;
}

function defaultIndexPath(): string {
  return join(getAgentDir(), "pi-web", "session-list-index.json");
}

async function loadIndex(indexPath: string): Promise<Map<string, IndexedSessionFile>> {
  const cached = globalThis.__piSessionListIndex;
  if (cached?.indexPath === indexPath) return cached.files;
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as {
      version?: number;
      files?: Record<string, IndexedSessionFile>;
    };
    if (parsed.version === INDEX_VERSION && parsed.files && typeof parsed.files === "object") {
      return new Map(Object.entries(parsed.files));
    }
  } catch {
    // Missing or corrupt index: rebuild from the session files.
  }
  return new Map();
}

function saveIndex(indexPath: string, files: Map<string, IndexedSessionFile>): void {
  mkdirSync(dirname(indexPath), { recursive: true });
  writePrivateFileAtomicSync(indexPath, JSON.stringify({
    version: INDEX_VERSION,
    files: Object.fromEntries(files),
  }));
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("base64");
}

async function readExact(
  handle: FileHandle,
  position: number,
  length: number,
  stats?: ScanOptions["stats"],
): Promise<Buffer | null> {
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (stats) stats.bytesRead += bytesRead;
  return bytesRead === length ? buffer : null;
}

/** True when the file still starts with the indexed header and still contains the
 * indexed bytes right before the resume offset, i.e. it has only been appended to. */
async function isAppendOnlyContinuation(
  handle: FileHandle,
  previous: IndexedSessionFile,
  stats?: ScanOptions["stats"],
): Promise<boolean> {
  const header = await readExact(handle, 0, previous.headerLength, stats);
  if (!header || hashBytes(header) !== previous.headerHash) return false;
  const boundary = Buffer.from(previous.boundary, "base64");
  const before = await readExact(handle, previous.scannedOffset - boundary.length, boundary.length, stats);
  return before !== null && before.equals(boundary);
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => (
      typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string"
    ))
    .map((block) => block.text)
    .join(" ");
}

/** Mirrors the SDK's per-entry accounting in SessionManager's buildSessionInfo(). */
function applyEntry(state: IndexedSessionFile, entry: Record<string, unknown>): void {
  if (entry.type === "session_info") {
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    state.name = name || undefined;
  }
  if (entry.type !== "message") return;
  state.messageCount += 1;

  const message = entry.message as Record<string, unknown> | undefined;
  if (!message || typeof message.role !== "string" || !("content" in message)) return;
  if (message.role !== "user" && message.role !== "assistant") return;

  const activity = typeof message.timestamp === "number"
    ? message.timestamp
    : Date.parse(typeof entry.timestamp === "string" ? entry.timestamp : "");
  if (!Number.isNaN(activity)) {
    state.lastActivity = Math.max(state.lastActivity ?? 0, activity);
  }

  if (!state.firstMessage && message.role === "user") {
    const text = messageText(message.content);
    if (text) state.firstMessage = text;
  }
}

function parseLine(line: Buffer): Record<string, unknown> | null {
  if (line.length === 0) return null;
  try {
    const parsed = JSON.parse(line.toString("utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Parse lines in [start, end). Returns the offset after the last consumed line,
 * or null when a fresh scan finds no valid session header.
 */
async function parseRange(
  handle: FileHandle,
  start: number,
  end: number,
  state: IndexedSessionFile | null,
  stats: ScanOptions["stats"],
): Promise<{ state: IndexedSessionFile; offset: number } | null> {
  let current = state;
  let position = start;
  let consumed = start;
  let carry: Buffer[] = [];

  const consume = (line: Buffer, lineEnd: number): boolean => {
    if (!current) {
      // Like the SDK, skip blank or malformed lines before the session header;
      // the first parsed entry must be the header.
      const header = parseLine(line);
      if (!header) {
        consumed = lineEnd;
        return true;
      }
      if (header.type !== "session" || typeof header.id !== "string") return false;
      current = {
        size: 0,
        mtimeMs: 0,
        ino: 0,
        scannedOffset: 0,
        boundary: "",
        // The header region is [0, lineEnd); its hash is filled in by the caller.
        headerLength: lineEnd,
        headerHash: "",
        header: {
          id: header.id,
          cwd: typeof header.cwd === "string" ? header.cwd : "",
          timestamp: typeof header.timestamp === "string" ? header.timestamp : "",
          ...(typeof header.parentSession === "string" ? { parentSession: header.parentSession } : {}),
        },
        firstMessage: "",
        messageCount: 0,
      };
    } else {
      const entry = parseLine(line);
      if (entry) applyEntry(current, entry);
    }
    consumed = lineEnd;
    return true;
  };

  while (position < end) {
    const length = Math.min(READ_CHUNK_BYTES, end - position);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (stats) stats.bytesRead += bytesRead;
    if (bytesRead === 0) break;
    const data = buffer.subarray(0, bytesRead);

    let lineStart = 0;
    for (let newline = data.indexOf(0x0a); newline !== -1; newline = data.indexOf(0x0a, lineStart)) {
      const piece = data.subarray(lineStart, newline);
      const line = carry.length > 0 ? Buffer.concat([...carry, piece]) : piece;
      carry = [];
      if (!consume(line, position + newline + 1)) return null;
      lineStart = newline + 1;
    }
    if (lineStart < data.length) carry.push(data.subarray(lineStart));
    position += bytesRead;
  }

  // An unterminated final line is consumed only if it is complete JSON (a file
  // rewritten without a trailing newline). A half-written append is retried on
  // the next scan. A consumed tail resumes at EOF, where the eventual "\n" just
  // produces an empty line, so the entry is never counted twice.
  if (carry.length > 0 && current) {
    const line = Buffer.concat(carry);
    const entry = parseLine(line);
    if (entry) {
      applyEntry(current, entry);
      consumed = position;
    }
  } else if (carry.length > 0 && !current) {
    if (!consume(Buffer.concat(carry), position)) return null;
  }

  return current ? { state: current, offset: consumed } : null;
}

/** Scan one session file, reusing previous state when the file was only appended to. */
export async function scanSessionFile(
  filePath: string,
  previous: IndexedSessionFile | undefined,
  stats?: ScanOptions["stats"],
): Promise<IndexedSessionFile | null> {
  const fileStat = await stat(filePath);
  if (
    previous &&
    previous.size === fileStat.size &&
    previous.mtimeMs === fileStat.mtimeMs &&
    previous.ino === fileStat.ino
  ) {
    return previous;
  }

  const handle = await open(filePath, "r");
  try {
    const canResume = previous !== undefined &&
      previous.ino === fileStat.ino &&
      fileStat.size >= previous.scannedOffset &&
      await isAppendOnlyContinuation(handle, previous, stats);

    const base = canResume ? { ...previous } : null;
    const result = await parseRange(handle, canResume ? previous.scannedOffset : 0, fileStat.size, base, stats);
    if (!result) return null;

    const { state, offset } = result;
    if (!canResume) {
      const header = await readExact(handle, 0, state.headerLength, stats);
      if (!header) return null;
      state.headerHash = hashBytes(header);
    }
    const boundaryLength = Math.min(BOUNDARY_BYTES, offset);
    const boundary = await readExact(handle, offset - boundaryLength, boundaryLength, stats);
    return {
      ...state,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      ino: fileStat.ino,
      scannedOffset: offset,
      boundary: (boundary ?? Buffer.alloc(0)).toString("base64"),
    };
  } finally {
    await handle.close();
  }
}

async function listSessionFiles(sessionsDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = join(sessionsDir, entry.name);
    try {
      for (const name of await readdir(dir)) {
        if (name.endsWith(".jsonl")) files.push(join(dir, name));
      }
    } catch {
      // Unreadable project directory: skip it, as SessionManager.listAll() does.
    }
  }
  return files;
}

async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function toIsoTimestamp(ms: number): string | undefined {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function toScannedSession(path: string, file: IndexedSessionFile): ScannedSession {
  const headerTime = Date.parse(file.header.timestamp);
  const created = toIsoTimestamp(headerTime) ?? new Date(file.mtimeMs).toISOString();
  const modified = file.lastActivity && file.lastActivity > 0
    ? new Date(file.lastActivity).toISOString()
    : created;
  return {
    path,
    id: file.header.id,
    cwd: file.header.cwd,
    ...(file.name ? { name: file.name } : {}),
    ...(file.header.parentSession ? { parentSessionPath: file.header.parentSession } : {}),
    created,
    modified,
    messageCount: file.messageCount,
    firstMessage: file.firstMessage || "(no messages)",
  };
}

async function scanAllSessions(options: ScanOptions = {}): Promise<ScannedSession[]> {
  const sessionsDir = options.sessionsDir ?? join(getAgentDir(), "sessions");
  const indexPath = options.indexPath ?? defaultIndexPath();
  const previous = await loadIndex(indexPath);
  const files = await listSessionFiles(sessionsDir);

  const next = new Map<string, IndexedSessionFile>();
  let changed = files.length !== previous.size;
  await forEachLimited(files, MAX_CONCURRENT_SCANS, async (filePath) => {
    const prior = previous.get(filePath);
    const state = await scanSessionFile(filePath, prior, options.stats).catch(() => null);
    if (state) next.set(filePath, state);
    if (state !== prior) changed = true;
  });

  globalThis.__piSessionListIndex = { indexPath, files: next };
  if (changed) {
    try {
      saveIndex(indexPath, next);
    } catch {
      // The in-memory index still serves this process; persisting is best effort.
    }
  }

  return [...next.entries()]
    .map(([path, file]) => toScannedSession(path, file))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** Indirection so tests can stub the disk scan. */
export const sessionListScanner = {
  scanAll: scanAllSessions,
};
