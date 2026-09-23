import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { LiveDocsMenu } = await jiti.import("./LiveDocsMenu.tsx");

const doc = {
  id: "doc-12345678",
  title: "PR Review.md",
  format: "text/markdown",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sessionIds: ["session-a"],
  headRevisionId: "revision-1",
};

test("shows the default Live Doc in the session toolbar", () => {
  const html = renderToStaticMarkup(React.createElement(LiveDocsMenu, {
    docs: [doc],
    defaultDocId: doc.id,
    onCreate() {},
    onOpen() {},
  }));
  assert.match(html, /Live Docs: PR Review\.md/);
  assert.match(html, /PR Review\.md/);
});

test("disables Live Docs before a persisted session exists", () => {
  const html = renderToStaticMarkup(React.createElement(LiveDocsMenu, {
    docs: [],
    defaultDocId: null,
    disabled: true,
    onCreate() {},
    onOpen() {},
  }));
  assert.match(html, /disabled=""/);
});
