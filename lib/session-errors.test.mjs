import assert from "node:assert/strict";
import test from "node:test";
import { appendSessionError, readSessionErrors, saveSessionErrors } from "./session-errors.ts";

function withStorage(run) {
  const data = new Map();
  const old = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  try { run(data); } finally { globalThis.localStorage = old; }
}

test("errors survive reload per session and can be cleared without touching another session", () => withStorage(() => {
  const error = { id: "e1", message: "gh pr view failed:\nrepository.pullRequest", timestamp: 123, request: "/pr 6095" };
  saveSessionErrors("source", appendSessionError([], error));
  assert.deepEqual(readSessionErrors("source"), [error]);
  assert.deepEqual(readSessionErrors("other"), []);
  saveSessionErrors("other", [{ id: "legacy", message: "old error", timestamp: 100 }]);
  assert.equal(readSessionErrors("other")[0].request, undefined);
  assert.equal(appendSessionError(readSessionErrors("source"), error).length, 1);
  saveSessionErrors("source", []);
  assert.deepEqual(readSessionErrors("source"), []);
}));

test("errors are bounded and corrupt storage does not break rendering", () => withStorage((data) => {
  const errors = Array.from({ length: 24 }, (_, index) => ({ id: String(index), message: `Error ${index}`, timestamp: index }));
  saveSessionErrors("source", errors);
  assert.deepEqual(readSessionErrors("source").map((e) => e.id), errors.slice(-20).map((e) => e.id));
  data.set("pi-web-session-errors:source", "invalid JSON");
  assert.deepEqual(readSessionErrors("source"), []);
}));
