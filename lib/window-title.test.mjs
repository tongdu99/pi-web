import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getWindowTitle } = await jiti.import("./window-title.ts");

test("window title shows only the current folder name on POSIX and Windows", () => {
  assert.equal(getWindowTitle("/work/project"), "project - Pi Web");
  assert.equal(getWindowTitle("/other/project/"), "project - Pi Web");
  assert.equal(getWindowTitle("/work/project-worktrees/feature"), "feature - Pi Web");
  assert.equal(getWindowTitle("C:\\work\\project"), "project - Pi Web");
  assert.equal(getWindowTitle("C:\\work\\project\\"), "project - Pi Web");
  assert.equal(getWindowTitle(""), "Pi Web");
  assert.equal(getWindowTitle("/"), "/ - Pi Web");
  assert.equal(getWindowTitle(null), "Pi Web");
});

test("shell prefers actual session cwd and keeps path context before sidebar initialization", async () => {
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /selectedSession\?\.cwd \|\| newSessionCwd \|\| activeCwd \|\| initialNavigation\.requestedCwd \|\| serverCwd/);
  assert.match(shell, /new MutationObserver\(syncWindowTitle\)/);
  assert.match(shell, /observer\.observe\(document\.head, \{ childList: true, subtree: true, characterData: true \}\)/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<AppShell serverCwd=\{process\.cwd\(\)\} \/>/);
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /title: getWindowTitle\(process\.cwd\(\)\)/);
});
