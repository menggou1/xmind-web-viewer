import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173/xmind-web-viewer/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel:
          !process.env.CI && process.platform === "win32"
            ? "msedge"
            : undefined,
      },
    },
    {
      name: "android",
      use: {
        ...devices["Pixel 7"],
        defaultBrowserType: "chromium",
        channel:
          !process.env.CI && process.platform === "win32"
            ? "msedge"
            : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/xmind-web-viewer/",
    reuseExistingServer: !process.env.CI,
  },
});
