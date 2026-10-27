import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./[...path]/route.ts", import.meta.url), "utf8");
const start = source.indexOf('if (type === "watch")');
const end = source.indexOf("// type === \"list\"", start);
assert.notEqual(start, -1, "watch route not found");
assert.notEqual(end, -1, "watch route end not found");
const watchBlock = source.slice(start, end);

test("file watching survives same-path replacement", () => {
  assert.match(watchBlock, /watcher = fs\.watch\(watchedDirectory/);
  assert.match(watchBlock, /samePath\(path\.join\(watchedDirectory, changedName\.toString\(\)\), filePath\)/);
  assert.match(watchBlock, /s\.ctimeMs === lastCtimeMs/);
  assert.match(watchBlock, /s\.ino === lastIno/);
  assert.match(watchBlock, /lastExists/);
});

test("a missing target can still be watched", () => {
  // Reads (including watch) have no path allow-list; a not-yet-created file is
  // watched through its parent directory instead of failing with Not found.
  assert.match(source, /if \(type !== "watch"\)[\s\S]*error: "Not found"/);
  assert.match(watchBlock, /lastExists = stat !== undefined/);
});

test("reads have no path allow-list, but uploads are limited to project roots", () => {
  const get = source.slice(source.indexOf("export async function GET"));
  assert.doesNotMatch(get, /getAllowedFileRoots|isFilePathAllowed|Access denied/);
  const upload = source.slice(source.indexOf("async function getUploadDirectory"), source.indexOf("function parseUploadFileNames"));
  assert.match(upload, /isFilePathAllowed\(directory, allowedRoots\)/);
  assert.match(upload, /isFilePathAllowed\(realDirectory, realRoots\)/);
});

test("connected is emitted only after the watcher exists", () => {
  const watcher = watchBlock.indexOf("watcher = fs.watch");
  const connected = watchBlock.indexOf('send("connected"');
  assert.ok(watcher >= 0, "watcher creation missing");
  assert.ok(connected > watcher, "connected emitted before watcher creation");
});
