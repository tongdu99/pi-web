import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { renderFileViewerHtml, getViewerFileApiUrl } = await jiti.import("../lib/file-viewer-html.ts");
const render = (options = {}) => renderFileViewerHtml({ filePath: "/work/a.ts", nonce: "test-nonce", content: "one\ntwo\nthree", ...options });

test("standalone document includes file contents immediately with a draggable local hyperlink", () => {
  const html = render();
  assert.match(html, /<div class="line" id="L2">.*two/);
  assert.match(html, /<a href="file:\/\/\/work\/a.ts" draggable="true">Open<\/a>/);
  assert.doesNotMatch(html, /<script[^>]*src=|_next\/|Loading|<details|Can’t preview/);
});

test("source and path HTML are escaped, and inline script uses a nonce", () => {
  const html = render({ filePath: '/work/<img onerror="bad">.ts', content: '<script>alert("test")</script>' });
  assert.doesNotMatch(html, /<img|<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<script nonce="test-nonce">/);
});

test("line fragment script highlights ranges and reveals the start line", () => {
  const selected = new Set();
  let revealed;
  const lines = [1, 2, 3].map((number) => ({
    classList: { add() { selected.add(number); }, remove() { selected.delete(number); } },
    scrollIntoView() { revealed = number; },
  }));
  const script = /<script nonce="test-nonce">([\s\S]*?)<\/script>/.exec(render())[1];
  const context = {
    location: { hash: "#L2-L3" },
    document: { querySelectorAll: (selector) => selector === ".line" ? lines : lines.filter((_, index) => selected.has(index + 1)) },
    addEventListener() {},
  };
  vm.runInNewContext(script, context);
  assert.deepEqual([...selected], [2, 3]);
  assert.equal(revealed, 2);
  context.location.hash = "#L1";
  vm.runInNewContext("reveal()", context);
  assert.deepEqual([...selected], [1]);
});

test("media and previews reuse existing API routes, retaining session authorization context", () => {
  assert.equal(getViewerFileApiUrl("/work/a #.ts", "read", "session-1"), "/api/files/work/a%20%23.ts?type=read&sessionId=session-1");
  assert.match(render({ filePath: "/work/a.pdf" }), /<iframe[^>]*type=read/);
  assert.match(render({ filePath: "/work/a.docx" }), /<iframe[^>]*type=preview/);
  assert.match(render({ filePath: "/work/a.png" }), /<img[^>]*type=read/);
  assert.match(render({ filePath: "/work/a.md" }), /href="\/viewer\/preview\?path=%2Fwork%2Fa.md"/);
});

test("read errors keep file access links without rendering media or source", () => {
  const html = render({ filePath: "/work/a.pdf", error: "Access denied" });
  assert.match(html, /role="alert">Access denied/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, />Open<\/a>/);
});

test("markdown opens the rendered preview unless a line fragment or source view is requested", () => {
  const html = render({ filePath: "/work/a.md", content: "# Title" });
  const script = /<head>.*?<script nonce="test-nonce">([\s\S]*?)<\/script>/s.exec(html)[1];
  const run = (hash) => {
    let replaced = null;
    vm.runInNewContext(script, { location: { hash, replace(url) { replaced = url; } } });
    return replaced;
  };
  assert.equal(run(""), "/viewer/preview?path=%2Fwork%2Fa.md");
  assert.equal(run("#L12"), null);
  assert.doesNotMatch(render({ filePath: "/work/a.md", forceSource: true }), /location\.replace/);
  assert.doesNotMatch(render(), /location\.replace/);
});

test("source is syntax highlighted and grouped into skippable chunks", () => {
  const html = render({ content: "const a = 1;", language: "typescript" });
  assert.match(html, /<span class=keyword>const<\/span>/);
  assert.match(html, /<div class="chunk" style="contain-intrinsic-block-size:auto 20\.8px">/);
  const logHtml = render({ filePath: "/work/app.log", content: "INFO ready", language: "log", size: 50 * 1024 * 1024 });
  assert.match(logHtml, /<span class="level info">INFO<\/span>/);
  const big = render({ content: "const a = 1;", language: "typescript", size: 10 * 1024 * 1024 });
  assert.doesNotMatch(big, /class=keyword/);
});

test("embedded viewer drops its header and can force the app theme", () => {
  const html = render({ embedded: true, theme: "dark" });
  assert.doesNotMatch(html, /<header>/);
  assert.match(html, /:root\{color-scheme:dark;--bg:#181818/);
  assert.doesNotMatch(html, /prefers-color-scheme/);
  assert.match(render(), /prefers-color-scheme:dark/);
});
