import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  outputDir: './_local/r43-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] } } },
    { name: 'firefox', use: {
      ...devices['Desktop Firefox'],
      // Linux CI requires a software-friendly context; never disable asset integrity.
      firefoxUserPrefs: {
        'webgl.disabled': false,
        'webgl.force-enabled': true,
        'webgl.enable-webgl2': true,
        'webgl.disable-fail-if-major-performance-caveat': true,
        'gfx.webrender.software': true
      }
    } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'npm run preview:viewer:dev --workspace @autolearnpro/catalog',
    url: 'http://127.0.0.1:4178/viewer-demo.html',
    reuseExistingServer: false,
    timeout: 45_000
  }
});
