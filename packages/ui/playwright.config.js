const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    baseURL: 'http://127.0.0.1:6006',
  },
  webServer: {
    command: 'npx http-server ./storybook-static -p 6006 -c-1',
    port: 6006,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
// Playwright configuration: serves built Storybook and runs tests against it
const { devices } = require('@playwright/test');

module.exports = {
  testDir: './tests',
  timeout: 30 * 1000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npx http-server ./storybook-static -p 6006',
    port: 6006,
    reuseExistingServer: true,
  },
};
