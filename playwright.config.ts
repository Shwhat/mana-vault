import { defineConfig } from "@playwright/test";

// Browser tests run against the built server with a fresh sample database (tests/e2e/serve.mjs).
// Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's Chromium.
const port = Number(process.env.E2E_PORT ?? 4317);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1440, height: 860 },
    acceptDownloads: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    env: { NODE_ENV: "test", E2E_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
