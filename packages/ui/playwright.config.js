const { defineConfig, devices } = require('@playwright/test');

// Playwright configuration: serves built Storybook and runs tests against it
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
