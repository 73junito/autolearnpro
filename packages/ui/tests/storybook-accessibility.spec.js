const { test, expect } = require('@playwright/test');

test.describe('Storybook Accessibility', () => {
  test('should load Storybook successfully', async ({ page }) => {
    // Navigate to the Storybook homepage
    await page.goto('/');
    
    // Wait for Storybook to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page loaded successfully
    const title = await page.title();
    expect(title).toBeTruthy();
    
    // Check that the Storybook iframe is present
    const iframe = page.frameLocator('iframe#storybook-preview-iframe');
    await expect(iframe.locator('body')).toBeVisible({ timeout: 10000 });
  });

  test('should render Storybook UI elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that Storybook UI is present (sidebar or main content)
    // This is a basic smoke test - can be expanded with axe-core for detailed accessibility checks
    const main = page.locator('body');
    await expect(main).toBeVisible({ timeout: 10000 });
    
    // Verify the page has meaningful content (not blank)
    const content = await page.textContent('body');
    expect(content.length).toBeGreaterThan(0);
  });
});
