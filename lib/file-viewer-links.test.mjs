import assert from "node:assert/strict";
import test from "node:test";
import { getFileViewerUrl, getLocalFileUrl } from "./file-viewer-links.ts";

test("viewer links encode paths and retain line ranges and session context", () => {
  assert.equal(getFileViewerUrl("/work/a #?.tsx", { startLine: 65, endLine: 89 }, "session-1"),
    "/viewer?path=%2Fwork%2Fa+%23%3F.tsx&sessionId=session-1#L65-L89");
  assert.equal(getFileViewerUrl("/work/a.ts", { startLine: 8, endLine: 8 }),
    "/viewer?path=%2Fwork%2Fa.ts#L8");
  assert.equal(getFileViewerUrl("/work/a.ts"), "/viewer?path=%2Fwork%2Fa.ts");
});

test("local file URLs encode special characters without interpreting them as lines", () => {
  assert.equal(getLocalFileUrl("/work/a #?%:5.ts"), "file:///work/a%20%23%3F%25%3A5.ts");
  assert.equal(getLocalFileUrl("/work/你好.ts"), "file:///work/%E4%BD%A0%E5%A5%BD.ts");
});

test("local file URLs support Windows drive and UNC paths", () => {
  assert.equal(getLocalFileUrl("C:\\work\\a b.ts"), "file:///C:/work/a%20b.ts");
  assert.equal(getLocalFileUrl("C:/work/a.ts"), "file:///C:/work/a.ts");
  assert.equal(getLocalFileUrl("\\\\server\\share\\a b.ts"), "file://server/share/a%20b.ts");
});
