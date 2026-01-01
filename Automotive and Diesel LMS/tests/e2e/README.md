# End-to-End Testing with Playwright

## Overview

This directory contains end-to-end (E2E) tests for AutoLearnPro LMS using [Playwright](https://playwright.dev/). These tests verify critical user workflows across multiple browsers.

## Test Coverage

### Authentication (`auth.spec.ts`)
- ✅ Landing page display
- ✅ User registration flow
- ✅ Login with valid credentials
- ✅ Login error handling
- ✅ Logout functionality
- ✅ Route protection for unauthenticated users
- ✅ Form validation

### Courses (`courses.spec.ts`)
- ✅ Course listing page
- ✅ Course detail view
- ✅ Enrollment from course list
- ✅ Enrollment from course details
- ✅ Navigation between pages
- ✅ Empty state handling
- ✅ Protected routes

### Dashboard (`dashboard.spec.ts`)
- ✅ Dashboard display after login
- ✅ Statistics cards (enrollments, progress, badges)
- ✅ Navigation bar with user info
- ✅ Course enrollment display
- ✅ Session persistence
- ✅ Loading state handling

## Prerequisites

### Local Development
```bash
# Install Node.js 18+ from https://nodejs.org/

# Install dependencies
cd tests/e2e
npm install

# Install Playwright browsers
npx playwright install
```

### Environment Setup

Create `.env` file (optional):
```bash
BASE_URL=http://localhost:3000
API_URL=http://localhost:4000/api
```

## Running Tests

### All Tests
```bash
npm test
```

### Run with UI (Interactive Mode)
```bash
npm run test:ui
```

### Run in Headed Mode (See Browser)
```bash
npm run test:headed
```

### Run Specific Test File
```bash
npx playwright test auth.spec.ts
npx playwright test courses.spec.ts
npx playwright test dashboard.spec.ts
```

### Run Tests on Specific Browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug Mode
```bash
npm run test:debug
```

### View Test Report
```bash
npm run test:report
```

## Test Configuration

### Browser Matrix
Tests run on:
- ✅ Chrome (Desktop)
- ✅ Firefox (Desktop)
- ✅ Safari/WebKit (Desktop)
- ✅ Mobile Chrome (Pixel 5)
- ✅ Mobile Safari (iPhone 12)

### Timeouts
- Default action timeout: 30s
- Navigation timeout: 30s
- Test timeout: 60s

### Retry Configuration
- CI: 2 retries
- Local: 0 retries

## Writing New Tests

### Test Structure
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.getByRole('heading')).toBeVisible();
  });
});
```

### Best Practices

1. **Use User-Facing Locators**
   ```typescript
   // Good
   page.getByRole('button', { name: /Login/i })
   page.getByText('Welcome')
   
   // Avoid
   page.locator('#login-button')
   page.locator('.btn-primary')
   ```

2. **Wait for Navigation**
   ```typescript
   await page.click('button:has-text("Submit")');
   await page.waitForURL(/.*dashboard/);
   ```

3. **Handle Async Operations**
   ```typescript
   await expect(page.getByText('Loading')).not.toBeVisible();
   await expect(page.getByText('Content')).toBeVisible();
   ```

4. **Use Test Helpers**
   ```typescript
   async function loginAsStudent(page) {
     // Reusable login logic
   }
   ```

5. **Clean Test Data**
   ```typescript
   const TEST_USER = {
     email: `test-${Date.now()}@example.com`,
     // Unique email prevents conflicts
   };
   ```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        working-directory: tests/e2e
        run: npm ci
      
      - name: Install Playwright Browsers
        working-directory: tests/e2e
        run: npx playwright install --with-deps
      
      - name: Run tests
        working-directory: tests/e2e
        run: npm test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/
```

## Troubleshooting

### Tests Failing Due to Timeouts
```bash
# Increase timeout in playwright.config.ts
use: {
  actionTimeout: 60000,
  navigationTimeout: 60000,
}
```

### Browser Installation Issues
```bash
# Reinstall browsers with system dependencies
npx playwright install --with-deps
```

### API Connection Errors
```bash
# Ensure backend is running
cd backend/lms_api
mix phx.server

# Or update BASE_URL in .env
echo "BASE_URL=https://your-api.com" > .env
```

### Failed Test Screenshots
Check `test-results/` directory for:
- Screenshots of failures
- Videos of test runs
- Trace files for debugging

### View Trace Files
```bash
npx playwright show-trace test-results/traces/trace.zip
```

## Code Generation

### Generate Test Code
```bash
npm run test:codegen
```

This opens a browser where you can:
1. Interact with your app
2. Playwright generates test code automatically
3. Copy and refine the generated code

## Performance Testing

### Measure Page Load Times
```typescript
test('should load dashboard quickly', async ({ page }) => {
  const start = Date.now();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(3000); // 3 seconds
});
```

### Check API Response Times
```typescript
test('should load courses quickly', async ({ page }) => {
  await page.goto('/courses');
  
  const response = await page.waitForResponse(
    (res) => res.url().includes('/api/courses')
  );
  
  expect(response.status()).toBe(200);
});
```

## Continuous Testing

### Watch Mode (Auto-rerun on Changes)
```bash
npx playwright test --ui
```

### Run Tests on File Save
Use `nodemon` or similar:
```bash
npm install -g nodemon
nodemon --exec "npm test" --watch tests --ext ts
```

## Test Maintenance

### Update Snapshots
```bash
npx playwright test --update-snapshots
```

### Clean Test Artifacts
```bash
rm -rf test-results/
rm -rf playwright-report/
```

### Lint Test Files
```bash
npx eslint tests/**/*.ts
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
- [Debugging Tests](https://playwright.dev/docs/debug)

## Support

For issues or questions:
- Check existing test files for examples
- Review Playwright documentation
- Open GitHub issue with `[E2E]` prefix
