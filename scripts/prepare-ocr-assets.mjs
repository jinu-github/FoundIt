import { createRequire } from "node:module";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const output = join(root, "public", "ocr");
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const language = dirname(
  require.resolve("@tesseract.js-data/eng/package.json"),
);
await mkdir(join(output, "core"), { recursive: true });
await mkdir(join(output, "lang"), { recursive: true });
await copyFile(
  join(tesseract, "dist", "worker.min.js"),
  join(output, "worker.min.js"),
);
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name) || name === "LICENSE")
    await copyFile(join(core, name), join(output, "core", name));
}
await copyFile(
  join(language, "4.0.0", "eng.traineddata.gz"),
  join(output, "lang", "eng.traineddata.gz"),
);
await copyFile(
  join(tesseract, "dist", "worker.min.js.LICENSE.txt"),
  join(output, "worker.LICENSE.txt"),
);
console.log(
  "Prepared local OCR worker, core variants, and English language data from installed packages.",
);
