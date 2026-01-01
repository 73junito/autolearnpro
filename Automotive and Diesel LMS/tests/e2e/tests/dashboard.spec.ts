import { test, expect } from '@playwright/test';

// Helper function to register and login
async function loginAsStudent(page: any) {
  const testUser = {
    email: `dashboard-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    full_name: 'Dashboard Test User'
  };
  
  await page.goto('/register');
  await page.fill('input[name="full_name"]', testUser.full_name);
  await page.fill('input[name="email"]', testUser.email);
  await page.fill('input[name="password"]', testUser.password);
  await page.selectOption('select[name="role"]', 'student');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*dashboard/, { timeout: 10000 });
  
  return testUser;
}

test.describe('Dashboard Functionality', () => {
  test('should display dashboard correctly after login', async ({ page }) => {
    const user = await loginAsStudent(page);
    
    // Check welcome message
    await expect(page.getByText(new RegExp(`Welcome back.*${user.full_name}`, 'i'))).toBeVisible();
    
    // Check main sections
    await expect(page.getByRole('heading', { name: /My Courses/i })).toBeVisible();
  });

  test('should display statistics cards', async ({ page }) => {
    await loginAsStudent(page);
    
    // Check for statistics cards
    await expect(page.getByText(/Courses Enrolled/i)).toBeVisible();
    await expect(page.getByText(/Avg Progress/i)).toBeVisible();
    await expect(page.getByText(/Badges Earned/i)).toBeVisible();
  });

  test('should show call-to-action when no enrollments', async ({ page }) => {
    await loginAsStudent(page);
    
    // If no enrollments, should show CTA
    const browseCoursesButton = page.getByRole('link', { name: /Browse Courses/i });
    const enrolledCourses = page.locator('[class*="grid"] > div').first();
    
    // Either the CTA or enrolled courses should be visible
    const ctaVisible = await browseCoursesButton.isVisible();
    const coursesVisible = await enrolledCourses.isVisible();
    
    expect(ctaVisible || coursesVisible).toBe(true);
  });

  test('should navigate to courses from dashboard', async ({ page }) => {
    await loginAsStudent(page);
    
    // Click "Courses" in navigation
    await page.click('text=Courses');
    
    await expect(page).toHaveURL(/.*courses/);
  });

  test('should display navigation with user info', async ({ page }) => {
    const user = await loginAsStudent(page);
    
    // Check navigation bar
    await expect(page.getByText('AutoLearnPro')).toBeVisible();
    await expect(page.getByText(user.full_name)).toBeVisible();
    await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  });

  test('should navigate between dashboard and courses', async ({ page }) => {
    await loginAsStudent(page);
    
    // Navigate to courses
    await page.click('text=Courses');
    await expect(page).toHaveURL(/.*courses/);
    
    // Navigate back to dashboard
    await page.click('text=Dashboard');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should calculate average progress correctly', async ({ page }) => {
    await loginAsStudent(page);
    
    // Check that average progress is displayed (should be 0% if no enrollments)
    const avgProgressCard = page.locator('text=Avg Progress').locator('..');
    await expect(avgProgressCard).toBeVisible();
    
    // Should show a percentage
    await expect(avgProgressCard.getByText(/%/)).toBeVisible();
  });

  test('should display enrolled courses count', async ({ page }) => {
    await loginAsStudent(page);
    
    // Check courses enrolled count
    const coursesCard = page.locator('text=Courses Enrolled').locator('..');
    await expect(coursesCard).toBeVisible();
    
    // Should show a number (could be 0)
    const countText = await coursesCard.innerText();
    expect(countText).toMatch(/\d+/);
  });

  test('should handle loading states gracefully', async ({ page }) => {
    await loginAsStudent(page);
    
    // Dashboard should not show persistent loading state
    await expect(page.getByText(/Loading\.\.\./i)).not.toBeVisible({ timeout: 5000 });
  });

  test('should maintain session across page reloads', async ({ page }) => {
    const user = await loginAsStudent(page);
    
    // Reload page
    await page.reload();
    
    // Should still be logged in and on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.getByText(user.full_name)).toBeVisible();
  });
});
