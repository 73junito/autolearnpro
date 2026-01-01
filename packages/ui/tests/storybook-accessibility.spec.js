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

  test('should have accessible main navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that main navigation elements are present
    // This is a basic check - can be expanded with axe-core if needed
    const nav = page.locator('[role="navigation"]');
    await expect(nav).toBeVisible({ timeout: 10000 });
  });
});
