import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { FileAccessLinks } = await jiti.import("./FileAccessLinks.tsx");

test("offers a browser viewer and a direct local file link without a popup", () => {
  const html = renderToStaticMarkup(React.createElement(FileAccessLinks, {
    filePath: "/work/a #.zip",
    lineRange: { startLine: 8, endLine: 12 },
    sessionId: "session-1",
  }));
  assert.match(html, /href="\/viewer\?path=%2Fwork%2Fa\+%23.zip&amp;sessionId=session-1#L8-L12"/);
  assert.match(html, /<a href="file:\/\/\/work\/a%20%23.zip"[^>]*draggable="true"[^>]*>Open<\/a>/);
  assert.doesNotMatch(html, /<details|<summary|<input|<button|Copy file URL/);
});

test("standalone viewer shows only the direct local link", () => {
  const html = renderToStaticMarkup(React.createElement(FileAccessLinks, {
    filePath: "/work/a.zip", showViewerLink: false,
  }));
  assert.doesNotMatch(html, /href="\/viewer/);
  assert.match(html, /href="file:\/\/\/work\/a.zip"/);
});
