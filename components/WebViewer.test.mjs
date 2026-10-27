import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getWebUrlLabel, normalizeWebUrl } from "../lib/web-url.ts";

const source = await readFile(new URL("./WebViewer.tsx", import.meta.url), "utf8");

test("web viewer validates and normalizes user-entered addresses before framing them", () => {
  assert.match(source, /normalizeWebUrl\(input\)/);
  assert.match(source, /onNavigate\(nextUrl, getWebUrlLabel\(nextUrl\)\)/);
  assert.match(source, /inputMode="url"/);
  assert.match(source, /type="text"/);
});

test("native web panel updates titles after loads, navigation, and dynamic title changes", () => {
  // Run the actual event-subscription effect against a guest webview double.
  const effect = source.match(/useEffect\(\(\) => \{\n    const webview = webviewRef.current;\n    if \(!webview\) return;([\s\S]*?)\n  \}, \[onNavigate, webviewRef\]\);/);
  assert.ok(effect);
  const listeners = new Map();
  const updates = [];
  let url = "https://example.com/";
  let title = "Example Home";
  const expectedUrlRef = { current: url };
  const cleanup = runInNewContext(`(() => { ${effect[1]} })()`, {
    webview: {
      getURL: () => url,
      getTitle: () => title,
      addEventListener: (event, listener) => listeners.set(event, listener),
      removeEventListener: (event, listener) => {
        assert.equal(listeners.get(event), listener);
        listeners.delete(event);
      },
    },
    expectedUrlRef,
    normalizeWebUrl,
    getWebUrlLabel,
    onNavigate: (nextUrl, label) => updates.push([nextUrl, label]),
  });

  listeners.get("dom-ready")();
  assert.deepEqual(updates.at(-1), [url, "Example Home"]);

  url = "https://example.com/about";
  listeners.get("did-navigate")();
  assert.deepEqual(updates.at(-1), [url, "example.com"]);
  assert.equal(expectedUrlRef.current, url);
  title = "  About Example  ";
  listeners.get("page-title-updated")();
  assert.deepEqual(updates.at(-1), [url, "About Example"]);

  title = "Updated About";
  listeners.get("page-title-updated")();
  assert.deepEqual(updates.at(-1), [url, title]);

  url += "#details";
  listeners.get("did-navigate-in-page")();
  assert.deepEqual(updates.at(-1), [url, title]);
  title = "";
  listeners.get("did-finish-load")();
  assert.deepEqual(updates.at(-1), [url, "example.com"]);

  url = "about:blank";
  const count = updates.length;
  listeners.get("page-title-updated")();
  assert.equal(updates.length, count);
  cleanup();
  assert.equal(listeners.size, 0);
});

test("web viewer uses a native Electron webview when available and preserves the iframe fallback", () => {
  assert.match(source, /createElement\("webview"/);
  assert.match(source, /partition: "persist:pi-web-web"/);
  assert.match(source, /expectedUrlRef\.current = currentUrl/);
  assert.match(source, /if \(currentUrl !== url\) webview\.src = url/);
  assert.match(source, /desktop \? \(/);
  assert.match(source, /<iframe/);
  assert.match(source, /sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-storage-access-by-user-activation"/);
  assert.match(source, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
});
