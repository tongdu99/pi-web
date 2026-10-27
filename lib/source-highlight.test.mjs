import assert from "node:assert/strict";
import test from "node:test";
import { highlightLogLine, highlightSourceLines } from "./source-highlight.ts";

test("log lines color levels, timestamps, exceptions and values while escaping HTML", () => {
  const html = highlightLogLine('2026-05-01T12:00:01.123Z ERROR [io] java.io.IOException: <boom> id=42 url=https://x.test/a?b=1');
  assert.match(html, /<span class=date>2026-05-01T12:00:01\.123Z<\/span>/);
  assert.match(html, /<span class="level error">ERROR<\/span>/);
  assert.match(html, /<span class=exception>java\.io\.IOException<\/span>/);
  assert.match(html, /<span class=property>id<\/span>=<span class=number>42<\/span>/);
  assert.match(html, /<span class=url>https:\/\/x\.test\/a\?b=1<\/span>/);
  assert.match(html, /&lt;boom&gt;/);
  assert.doesNotMatch(html, /<boom>/);
});

test("plain log text without tokens is only escaped", () => {
  assert.equal(highlightLogLine("a & b"), "a &amp; b");
});

test("code is split into one fragment per line, including tokens that span lines", () => {
  const lines = highlightSourceLines("/* a\nb */\nconst x = 1;", "javascript", 20, 1024);
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "<span class=comment>/* a</span>");
  assert.equal(lines[1], "<span class=comment>b */</span>");
  assert.match(lines[2], /<span class=keyword>const<\/span>/);
});

test("grammar highlighting is skipped above the size cap, but logs are always colored", () => {
  assert.equal(highlightSourceLines("const x = 1;", "javascript", 2048, 1024), null);
  assert.equal(highlightSourceLines("hello", "text", 5, 1024), null);
  assert.equal(highlightSourceLines("x", "not-a-language", 1, 1024), null);
  assert.match(highlightSourceLines("WARN x", "log", 1e9, 1024)[0], /class="level warning"/);
});
