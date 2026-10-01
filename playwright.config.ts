import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);

/**
 * End-to-end checks drive the production build in the installed Chrome, because WebGL
 * needs a real GPU path and the bundled headless shell renders it through software only.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
