import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
const nonce = randomBytes(24).toString("base64");
const policy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' ws://127.0.0.1:5173; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";
export default defineConfig({
  html: { cspNonce: nonce },
  plugins: [react()],
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
    headers: {
      "Content-Security-Policy": policy.replace(" ws://127.0.0.1:5173", ""),
    },
  },
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts" },
});
