import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { VitePWA } from "vite-plugin-pwa";
const nonce = randomBytes(24).toString("base64");
const buildId = randomBytes(16).toString("hex");
let outputDir = resolve("dist");
const policy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' ws://127.0.0.1:5173; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";
export default defineConfig({
  html: { cspNonce: nonce },
  define: { __PWA_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: "foundit-output-directory",
      configResolved(config) {
        outputDir = resolve(config.root, config.build.outDir);
      },
    },
    VitePWA({
      strategies: "generateSW",
      injectRegister: null,
      registerType: "prompt",
      devOptions: { enabled: false },
      manifest: {
        id: "/",
        name: "FoundIt",
        short_name: "FoundIt",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#f5f4ee",
        background_color: "#fafaf7",
        description:
          "Your private local library for images, links, text, and notes",
        icons: [192, 512].map((size) => ({
          src: `/icons/foundit-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "any",
        })),
      },
      workbox: {
        cacheId: "foundit-pwa",
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true,
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: [
          "index.html",
          "assets/**/*.{js,css}",
          "icons/*.png",
          "manifest.webmanifest",
          "ocr/**/*.{js,wasm,gz,txt}",
          "ocr/core/LICENSE",
        ],
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/(?:index\.html)?(?:\?.*)?$/],
        runtimeCaching: [],
        manifestTransforms: [
          async (entries) => {
            const inventory = {
              buildId,
              entries: entries.map((entry) => ({
                url: entry.url,
                revision: entry.revision ?? null,
              })),
            };
            await writeFile(
              resolve(outputDir, "offline-assets.json"),
              JSON.stringify(inventory),
            );
            return {
              manifest: [
                ...entries,
                {
                  url: "offline-assets.json",
                  revision: buildId,
                  size: Buffer.byteLength(JSON.stringify(inventory)),
                },
              ],
              warnings: [],
            };
          },
        ],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      "Content-Security-Policy": policy.replace(
        "script-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
      ),
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      "Content-Security-Policy": policy.replace(" ws://127.0.0.1:5173", ""),
      "Cache-Control": "no-cache",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
