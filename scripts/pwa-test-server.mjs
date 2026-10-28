// Test-only static server; never used by the application or installation workflow.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".wasm": "application/wasm",
};
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1:5173").pathname;
    const path = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!path.startsWith(root + "\\")) throw new Error("path");
    const mode = JSON.parse(
      await readFile(".pwa-test-mode.json", "utf8").catch(() => "{}"),
    );
    if (mode.fail && pathname === "/ocr/lang/eng.traineddata.gz")
      throw new Error("simulated unavailable asset");
    let data = await readFile(path);
    if (pathname === "/sw.js")
      data = Buffer.concat([
        data,
        Buffer.from(`\n// test version ${mode.version || "A"}\n`),
      ]);
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'",
    });
    response.end(data);
  } catch {
    response.writeHead(503);
    response.end("Unavailable");
  }
}).listen(5173, "127.0.0.1");
