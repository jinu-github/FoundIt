import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  use: { channel: "chrome", baseURL: "http://127.0.0.1:5173", headless: true },
  webServer: {
    command: "node scripts/pwa-test-server.mjs",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
