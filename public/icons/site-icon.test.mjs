import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url));

test("favicon is a real multi-resolution ICO with embedded PNG images", async () => {
  const icon = await read("../../app/favicon.ico");
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 4);
  for (const [index, size] of [16, 32, 48, 64].entries()) {
    const entry = 6 + index * 16;
    assert.equal(icon[entry], size);
    assert.equal(icon[entry + 1], size);
    const offset = icon.readUInt32LE(entry + 12);
    const length = icon.readUInt32LE(entry + 8);
    assert.ok(offset + length <= icon.length);
    assert.equal(icon.subarray(offset + 1, offset + 4).toString(), "PNG");
  }
});

test("installation icons keep the expected PNG dimensions", async () => {
  for (const [name, size] of [["pi-web-32.png", 32], ["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
    const image = await read(`./${name}`);
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
  }
});

test("metadata advertises the scalable Pi Web tab icon", async () => {
  const layout = (await read("../../app/layout.tsx")).toString();
  assert.match(layout, /url: "\/icons\/pi-web\.svg",\s*sizes: "any",\s*type: "image\/svg\+xml"/);
  assert.match(layout, /url: "\/icons\/pi-web-32\.png",\s*sizes: "32x32",\s*type: "image\/png"/);
  assert.match(layout, /shortcut: "\/icons\/pi-web-32\.png"/);
  assert.doesNotMatch(layout, /url: "\/icons\/icon-192\.png"/);
  const svg = (await read("./pi-web.svg")).toString();
  assert.match(svg, /viewBox="0 0 64 64"/);
});
