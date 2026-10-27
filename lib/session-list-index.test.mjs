import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { sessionListScanner } = await jiti.import("./session-list-index.ts");
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");

const line = (entry) => `${JSON.stringify(entry)}\n`;
const header = (id, extra = {}) => line({ type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/work/project", ...extra });
const message = (id, role, content, timestamp) => line({
  type: "message", id, parentId: null, timestamp,
  message: role === "assistant"
    ? { role, content: [{ type: "text", text: content }], provider: "p", model: "m" }
    : role === "toolResult"
      ? { role, toolCallId: "t1", content: [{ type: "text", text: content }] }
      : { role, content },
});
const sessionInfo = (id, name) => line({ type: "session_info", id, parentId: null, timestamp: "2026-01-01T00:00:00.000Z", name });

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "pi-web-session-index-"));
  const sessionsDir = join(root, "sessions");
  const projectDir = join(sessionsDir, "--work-project--");
  mkdirSync(projectDir, { recursive: true });
  const indexPath = join(root, "pi-web", "session-list-index.json");
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    globalThis.__piSessionListIndex = undefined;
  });
  globalThis.__piSessionListIndex = undefined;
  const scan = async () => {
    const stats = { bytesRead: 0 };
    const sessions = await sessionListScanner.scanAll({ sessionsDir, indexPath, stats });
    return { sessions, bytesRead: stats.bytesRead };
  };
  return { projectDir, indexPath, scan };
}

test("matches SessionManager.listAll for names, first message, count, and activity", async (t) => {
  const { projectDir, scan } = setup(t);
  writeFileSync(join(projectDir, "a.jsonl"),
    "\n" // the SDK skips blank lines before the header
    + header("session-a", { parentSession: "/sessions/parent.jsonl" })
    + message("m1", "user", "first question", "2026-01-01T00:00:01.000Z")
    + message("m2", "assistant", "answer", "2026-01-01T00:00:05.000Z")
    + message("m3", "toolResult", "tool output", "2026-01-01T00:09:00.000Z")
    + sessionInfo("i1", "Renamed once")
    + message("m4", "user", "second question", "2026-01-01T00:00:07.000Z")
    + sessionInfo("i2", "  Final name  "));
  writeFileSync(join(projectDir, "b.jsonl"),
    header("session-b")
    + sessionInfo("i1", "cleared later")
    + sessionInfo("i2", "   "));
  writeFileSync(join(projectDir, "not-a-session.jsonl"), line({ type: "message", id: "x" }));

  const expected = (await SessionManager.listAll(projectDir)).map((session) => ({
    path: session.path,
    id: session.id,
    cwd: session.cwd,
    name: session.name,
    parentSessionPath: session.parentSessionPath,
    created: session.created.toISOString(),
    modified: session.modified.toISOString(),
    messageCount: session.messageCount,
    firstMessage: session.firstMessage,
  }));
  const { sessions } = await scan();
  const actual = sessions.map((session) => ({ name: undefined, parentSessionPath: undefined, ...session }));

  assert.deepEqual(actual.sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(actual.find((s) => s.id === "session-a").name, "Final name");
  assert.equal(actual.find((s) => s.id === "session-b").name, undefined);
});

test("unchanged files are not read again, even after a restart", async (t) => {
  const { projectDir, scan } = setup(t);
  writeFileSync(join(projectDir, "a.jsonl"), header("session-a") + message("m1", "user", "hello", "2026-01-01T00:00:01.000Z"));

  const first = await scan();
  assert.ok(first.bytesRead > 0);
  assert.equal((await scan()).bytesRead, 0);

  globalThis.__piSessionListIndex = undefined; // simulate a server restart
  const restarted = await scan();
  assert.equal(restarted.bytesRead, 0);
  assert.equal(restarted.sessions[0].firstMessage, "hello");
});

test("appended entries are parsed by reading only the appended bytes", async (t) => {
  const { projectDir, scan } = setup(t);
  const file = join(projectDir, "a.jsonl");
  const bulk = Array.from({ length: 200 }, (_, i) => message(`t${i}`, "toolResult", "x".repeat(2000), "2026-01-01T00:00:02.000Z")).join("");
  writeFileSync(file, header("session-a") + sessionInfo("i0", "Named in the middle") + bulk);
  await scan();

  const appended = message("m9", "user", "late question", "2026-01-02T00:00:00.000Z");
  appendFileSync(file, appended);
  const { sessions, bytesRead } = await scan();

  const headerBytes = Buffer.byteLength(header("session-a"));
  assert.ok(bytesRead <= headerBytes + 64 + Buffer.byteLength(appended) + 64, `read ${bytesRead} bytes`);
  assert.ok(statSync(file).size > 400_000);
  assert.equal(sessions[0].name, "Named in the middle");
  assert.equal(sessions[0].messageCount, 201);
  assert.equal(sessions[0].modified, "2026-01-02T00:00:00.000Z");
});

test("an in-place header rewrite triggers a full re-parse", async (t) => {
  const { projectDir, scan } = setup(t);
  const file = join(projectDir, "child.jsonl");
  writeFileSync(file, header("child", { parentSession: "/old/parent.jsonl" }) + message("m1", "user", "hi", "2026-01-01T00:00:01.000Z"));
  await scan();

  // Same rewrite shape as session delete's cascade-reparent.
  const lines = readFileSync(file, "utf8").split("\n");
  lines[0] = JSON.stringify({ ...JSON.parse(lines[0]), parentSession: "/new/grandparent-path/parent.jsonl" });
  writeFileSync(file, lines.join("\n"));
  const { sessions } = await scan();

  assert.equal(sessions[0].parentSessionPath, "/new/grandparent-path/parent.jsonl");
  assert.equal(sessions[0].messageCount, 1);
});

test("a truncated or replaced file is re-parsed from the start", async (t) => {
  const { projectDir, scan } = setup(t);
  const file = join(projectDir, "a.jsonl");
  writeFileSync(file, header("session-a") + message("m1", "user", "one", "2026-01-01T00:00:01.000Z") + message("m2", "user", "two", "2026-01-01T00:00:02.000Z"));
  await scan();

  writeFileSync(file, header("session-a") + message("m1", "user", "replaced", "2026-01-01T00:00:01.000Z"));
  const { sessions } = await scan();
  assert.equal(sessions[0].firstMessage, "replaced");
  assert.equal(sessions[0].messageCount, 1);
});

test("an unterminated final line is counted once and a half-written append is retried", async (t) => {
  const { projectDir, scan } = setup(t);
  const file = join(projectDir, "a.jsonl");
  writeFileSync(file, header("session-a") + message("m1", "user", "one", "2026-01-01T00:00:01.000Z").trimEnd());
  assert.equal((await scan()).sessions[0].messageCount, 1);

  const next = message("m2", "user", "two", "2026-01-01T00:00:02.000Z");
  appendFileSync(file, `\n${next.slice(0, 20)}`); // newline for m1, then half of m2
  assert.equal((await scan()).sessions[0].messageCount, 1);

  appendFileSync(file, next.slice(20));
  assert.equal((await scan()).sessions[0].messageCount, 2);
});

test("deleted session files are dropped from the persisted index", async (t) => {
  const { projectDir, indexPath, scan } = setup(t);
  writeFileSync(join(projectDir, "a.jsonl"), header("session-a"));
  writeFileSync(join(projectDir, "b.jsonl"), header("session-b"));
  await scan();
  rmSync(join(projectDir, "b.jsonl"));

  const { sessions } = await scan();
  assert.deepEqual(sessions.map((s) => s.id), ["session-a"]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(indexPath, "utf8")).files).length, 1);
});
