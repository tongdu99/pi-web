import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

function menuBlock(label) {
  const start = source.indexOf(`role="menu" aria-label="${label}"`);
  assert.notEqual(start, -1, `${label} menu not found`);
  const end = source.indexOf("</div>", start);
  assert.notEqual(end, -1, `${label} menu is unterminated`);
  return source.slice(start, end);
}

// The system prompt is per-session runtime state: pi assembles it from the
// session's cwd, tool selection, skills and extensions, and it only exists once
// that session is live. It therefore belongs with the session actions, not with
// the global Models/Skills/Plugins configuration.
test("offers the system prompt from the session menu, not from settings", () => {
  assert.match(menuBlock("Session"), /translate\("system\.prompt"\)/);
  assert.doesNotMatch(menuBlock("Settings"), /translate\("system\.prompt"\)/);
});

test("the session menu entry opens the system prompt and closes that menu", () => {
  assert.match(
    menuBlock("Session"),
    /onClick=\{handleOpenSystemPrompt\}[\s\S]*?translate\("system\.prompt"\)/,
  );

  const handler = source.match(/const handleOpenSystemPrompt = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0];
  assert.ok(handler);
  assert.match(handler, /setSessionMenuOpen\(false\)/);
  assert.doesNotMatch(handler, /setSettingsMenuOpen\(false\)/);
});

// The prompt opens as a file tab, so the toolbar button must track that tab.
// It used to read activeTopPanel === "system", a panel nothing opens anymore,
// which left the button permanently unhighlighted.
test("the toolbar system button reflects the open file tab", () => {
  assert.match(
    source,
    /const systemTabActive = rightPanelOpen && activeFileTab\?\.kind === "system";/,
  );
  assert.doesNotMatch(source, /activeTopPanel === "system"/);
});
