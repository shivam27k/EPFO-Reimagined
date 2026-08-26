import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const databasePath = join(tmpdir(), "epf-sahayak-assistant-workspace.db").replaceAll("\\", "/");

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run db:migrate && bun run db:seed && bun run dev -- -p ${port}`,
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath}`,
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
