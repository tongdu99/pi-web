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
