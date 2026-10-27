import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./useLiveDocs.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  const effects = [];
  const streams = [];
  const requests = [];
  const exports = {};
  const context = {
    exports,
    require: () => ({
      useCallback: (callback) => callback,
      useEffect: (effect, dependencies) => effects.push({ effect, dependencies }),
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
    }),
    EventSource: class {
      constructor(url) { this.url = url; this.closed = false; streams.push(this); }
      close() { this.closed = true; }
    },
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ docs: [] }) };
    },
    localStorage: { getItem: () => null },
  };
  vm.runInNewContext(compiled, context);
  return {
    streams, requests,
    render(sessionId, inUse) {
      effects.length = 0;
      exports.useLiveDocs(sessionId, inUse);
      return effects[1];
    },
  };
}

test("ordinary session pages do not open a Live Doc stream, including by default", () => {
  const hook = setup();
  hook.render("session", false).effect();
  hook.render("session").effect();
  assert.equal(hook.streams.length, 0);
});

test("using a Live Doc opens a stream and stopping use closes it", () => {
  const hook = setup();
  const subscription = hook.render("session", true);
  const cleanup = subscription.effect();
  assert.equal(hook.streams.length, 1);
  assert.equal(hook.streams[0].url, "/api/live-docs/events?sessionId=session");
  assert.equal(subscription.dependencies[0], true);
  cleanup(); // React runs cleanup when liveDocInUse changes or the hook unmounts.
  hook.render("session", false).effect();
  assert.equal(hook.streams[0].closed, true);
  assert.equal(hook.streams.length, 1);
});

test("no session means no stream even when a Live Doc is in use", () => {
  const hook = setup();
  hook.render(null, true).effect();
  assert.equal(hook.streams.length, 0);
});

test("ready and update events refresh documents, including changes missed while idle", async () => {
  const hook = setup();
  const cleanup = hook.render("session", true).effect();
  for (const type of ["ready", "updated"]) {
    hook.streams[0].onmessage({ data: JSON.stringify({ type }) });
  }
  hook.streams[0].onmessage({ data: "invalid JSON" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hook.requests.length, 2);
  cleanup();
});

test("AppShell enables subscriptions only for a visible document or a document conversation", async () => {
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /const liveDocInUse = liveDocsFeatureEnabled && \(/);
  assert.match(shell, /rightPanelOpen && fileTabs\.some\(\(tab\) => tab\.id === activeFileTabId && tab\.kind === "live-doc"\)/);
  assert.match(shell, /\|\| Boolean\(liveDocTargetState\)/);
  assert.match(shell, /useLiveDocs\([^;]+, liveDocInUse\)/);
});
