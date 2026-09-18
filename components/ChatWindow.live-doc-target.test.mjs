import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the persistent Live Doc section target and allows replacing it", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /onLiveDocTargetStateChange\?\.\(liveDocTargetState\)/);
  assert.match(source, /liveDocConversationLabel\(/);
  assert.match(source, /if \(activeLiveDocThread && !\(await leaveActiveLiveDocThread\(activeLiveDocThread\)\)\) return/);
  assert.match(source, /sectionLabel: liveDocSectionPreview\(section\.markdown\)/);
  assert.match(source, /pendingLiveDocThread\.sectionLabel/);
});
