import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load the landing page successfully', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/AI Agent Builder/);

    // Check hero section
    await expect(page.getByRole('heading', { name: /Welcome to AI Agent Builder/i })).toBeVisible();
    await expect(page.getByText(/Build powerful AI agent workflows/i)).toBeVisible();
  });

  test('should display feature cards', async ({ page }) => {
    await page.goto('/');

    // Check all 4 feature cards
    await expect(page.getByText('Visual Builder')).toBeVisible();
    await expect(page.getByText('Fast Execution')).toBeVisible();
    await expect(page.getByText('Enterprise Security')).toBeVisible();
    await expect(page.getByText('Real-time Monitoring')).toBeVisible();
  });

  test('should have working navigation buttons', async ({ page }) => {
    await page.goto('/');

    // Click "Create Workflow" button
    await page.getByRole('link', { name: /Create Workflow/i }).click();

    // Should navigate to workflow editor
    await expect(page).toHaveURL('/workflows/new');
  });

  test('should display sidebar navigation', async ({ page }) => {
    await page.goto('/');

    // Check sidebar items
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Workflows/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Executions/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Templates/i })).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to workflows
    await page.getByRole('link', { name: /^Workflows$/i }).click();
    await expect(page).toHaveURL('/workflows');

    // Navigate back home
    await page.getByRole('link', { name: /Dashboard/i }).click();
    await expect(page).toHaveURL('/');
  });
});
