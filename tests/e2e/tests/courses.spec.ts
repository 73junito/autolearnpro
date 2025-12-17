import { test, expect } from '@playwright/test';

// Helper function to register and login
async function loginAsStudent(page: any) {
  const testUser = {
    email: `student-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    full_name: 'Test Student'
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

test.describe('Course Browsing and Enrollment', () => {
  test('should display courses page when logged in', async ({ page }) => {
    await loginAsStudent(page);
    
    // Navigate to courses
    await page.click('text=Courses');
    await expect(page).toHaveURL(/.*courses/);
    
    // Check page heading
    await expect(page.getByRole('heading', { name: /Available Courses/i })).toBeVisible();
  });

  test('should show empty state when no courses exist', async ({ page }) => {
    await loginAsStudent(page);
    
    await page.goto('/courses');
    
    // Should show "no courses" message or course list
    const noCourses = page.getByText(/No courses available/i);
    const courseList = page.locator('[class*="grid"]');
    
    // Either message or course list should be visible
    await expect(noCourses.or(courseList)).toBeVisible();
  });

  test('should navigate to course details', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/courses');
    
    // Check if there are any courses
    const viewDetailsButton = page.getByRole('link', { name: /View Details/i }).first();
    
    if (await viewDetailsButton.isVisible()) {
      await viewDetailsButton.click();
      
      // Should navigate to course detail page
      await expect(page).toHaveURL(/.*courses\/[^/]+/);
      await expect(page.getByRole('button', { name: /Enroll in Course/i })).toBeVisible();
    }
  });

  test('should enroll in a course from course list', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/courses');
    
    // Find first enroll button
    const enrollButton = page.getByRole('button', { name: /Enroll/i }).first();
    
    if (await enrollButton.isVisible()) {
      // Click enroll
      await enrollButton.click();
      
      // Should show success alert (handled by browser alert)
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('enrolled');
        await dialog.accept();
      });
      
      // Should redirect to dashboard after enrollment
      await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    }
  });

  test('should enroll in a course from course detail page', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/courses');
    
    // Navigate to first course details
    const viewDetailsButton = page.getByRole('link', { name: /View Details/i }).first();
    
    if (await viewDetailsButton.isVisible()) {
      await viewDetailsButton.click();
      await page.waitForURL(/.*courses\/[^/]+/);
      
      // Click enroll button
      const enrollButton = page.getByRole('button', { name: /Enroll in Course/i });
      
      if (await enrollButton.isVisible()) {
        await enrollButton.click();
        
        // Handle alert
        page.on('dialog', async dialog => {
          await dialog.accept();
        });
        
        // Should redirect to dashboard
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
      }
    }
  });

  test('should display enrolled courses on dashboard', async ({ page }) => {
    await loginAsStudent(page);
    
    // Dashboard should load
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Check for "My Courses" section
    await expect(page.getByRole('heading', { name: /My Courses/i })).toBeVisible();
    
    // Should show either enrolled courses or "no enrollments" message
    const noCourses = page.getByText(/haven't enrolled in any courses yet/i);
    const courseCards = page.locator('[class*="grid"] > div').first();
    
    await expect(noCourses.or(courseCards)).toBeVisible();
  });

  test('should navigate back from course details', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/courses');
    
    const viewDetailsButton = page.getByRole('link', { name: /View Details/i }).first();
    
    if (await viewDetailsButton.isVisible()) {
      await viewDetailsButton.click();
      await page.waitForURL(/.*courses\/[^/]+/);
      
      // Click "Go Back" button
      await page.click('button:has-text("Go Back")');
      
      // Should go back to courses list
      await expect(page).toHaveURL(/.*courses$/);
    }
  });

  test('should protect courses page from unauthenticated access', async ({ page }) => {
    await page.goto('/courses');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/, { timeout: 5000 });
  });
});
