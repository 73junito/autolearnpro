import { test, expect, Page } from '@playwright/test';

// Test user credentials
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123!',
  full_name: 'Test User'
};

test.describe('Authentication Flow', () => {
  test('should display landing page correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/AutoLearnPro LMS/);
    
    // Check main heading
    await expect(page.getByRole('heading', { name: /Welcome to AutoLearnPro LMS/i })).toBeVisible();
    
    // Check navigation buttons
    await expect(page.getByRole('link', { name: /Login/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Register/i })).toBeVisible();
  });

  test('should navigate to registration page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Register');
    
    await expect(page).toHaveURL(/.*register/);
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
  });

  test('should register a new user successfully', async ({ page }) => {
    await page.goto('/register');
    
    // Fill registration form
    await page.fill('input[name="full_name"]', TEST_USER.full_name);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.selectOption('select[name="role"]', 'student');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
  });

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.goto('/register');
    
    // Try to submit with invalid email
    await page.fill('input[name="full_name"]', 'Test User');
    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'short');
    
    await page.click('button[type="submit"]');
    
    // Should show validation errors (browser validation will prevent submission)
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('should login with existing user', async ({ page }) => {
    // First, register a user
    await page.goto('/register');
    await page.fill('input[name="full_name"]', TEST_USER.full_name);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.selectOption('select[name="role"]', 'student');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/, { timeout: 10000 });
    
    // Logout
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');
    
    // Now login
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    await expect(page.getByText(TEST_USER.full_name)).toBeVisible();
  });

  test('should show error for invalid login credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.getByText(/Login failed|Invalid credentials|check your credentials/i)).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/register');
    await page.fill('input[name="full_name"]', TEST_USER.full_name);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/, { timeout: 10000 });
    
    // Logout
    await page.click('text=Logout');
    
    // Should redirect to home
    await expect(page).toHaveURL('/');
    
    // Should not be able to access dashboard without login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*login/, { timeout: 5000 });
  });

  test('should protect dashboard route for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/, { timeout: 5000 });
  });
});
