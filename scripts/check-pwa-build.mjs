import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
const root = resolve(process.argv[2] || "dist");
const json = async (path) =>
  JSON.parse(await readFile(`${root}/${path}`, "utf8"));
const inventory = await json("offline-assets.json");
const manifest = await json("manifest.webmanifest");
assert.equal(manifest.id, "/");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.name, "FoundIt");
const urls = new Set(inventory.entries.map((entry) => entry.url));
for (const path of [
  "ocr/worker.min.js",
  "ocr/lang/eng.traineddata.gz",
  "ocr/core/tesseract-core-lstm.wasm.js",
  "ocr/core/tesseract-core-simd-lstm.wasm.js",
  "ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js",
])
  assert(urls.has(path), `Required OCR asset missing: ${path}`);
async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(`${root}/${directory}`, {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    paths.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return paths;
}
const expected = [
  "index.html",
  "manifest.webmanifest",
  ...(await walk("assets")),
  ...(await walk("ocr")),
  ...(await walk("icons")),
];
for (const path of expected.filter((path) => !path.endsWith(".svg")))
  assert(urls.has(path), `Missing precache asset: ${path}`);
let bytes = 0;
for (const entry of inventory.entries) {
  assert(expected.includes(entry.url), `Unexpected cache URL: ${entry.url}`);
  const size = (await stat(`${root}/${entry.url}`)).size;
  assert(size <= 16 * 1024 * 1024, `Oversized asset: ${entry.url}`);
  bytes += size;
}
for (const size of [192, 512]) {
  const icon = manifest.icons.find((icon) => icon.sizes === `${size}x${size}`);
  assert(icon && icon.type === "image/png");
  const data = await readFile(`${root}${icon.src}`);
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(data.readUInt32BE(16), size);
  assert.equal(data.readUInt32BE(20), size);
}
const sw = await readFile(`${root}/sw.js`, "utf8");
for (const entry of inventory.entries)
  assert(sw.includes(entry.url), `SW omitted ${entry.url}`);
assert(sw.includes(inventory.buildId));
assert(
  (await readFile(`${root}/index.html`, "utf8")).includes(
    "manifest.webmanifest",
  ),
);
console.log(
  `PWA audit passed: ${urls.size} required assets, ${(bytes / 1024 / 1024).toFixed(2)} MiB; icons and manifest valid.`,
);
