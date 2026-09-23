import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("keeps command errors in a readable, collapsible panel with session context", () => {
  assert.match(source, /<div className="relative flex min-w-0 flex-1 overflow-hidden">\s*<div className="flex min-w-0 flex-1 flex-col">[\s\S]*?<SessionErrorPanel errors=\{sessionErrors\} cwd=\{session\?\.cwd\} onClear=\{clearSessionErrors\}/);
  assert.ok(source.indexOf("<SessionErrorPanel errors={sessionErrors} cwd={session?.cwd}") < source.indexOf("<ChatMinimap"));
  assert.match(source, /whiteSpace: "pre-wrap", overflowWrap: "anywhere"/);
  assert.match(source, /Working directory: \{cwd\}/);
  assert.match(source, /PR numbers are looked up in this session/);
  assert.match(source, /Clear history/);
  assert.match(source, /Request: \{error\.request\.replace\(/);
  assert.match(source, /Copy original request/);
});

test("renders temporary notices once at the top center of the chat column", () => {
  const noticeShelfUsages = source.match(/<NoticeShelf notices=\{notices\}/g) ?? [];

  assert.equal(noticeShelfUsages.length, 1);
  assert.match(
    source,
    /position: "absolute",\s*top: 12,\s*left: 0,\s*right: isMobile \? 0 : CHAT_MINIMAP_WIDTH,[\s\S]*?justifyContent: "center",[\s\S]*?<NoticeShelf notices=\{notices\} floating \/>/,
  );
});
