import { test, expect } from '@playwright/test';

test.describe('Workflows Page', () => {
  test('should display workflows list page', async ({ page }) => {
    await page.goto('/workflows');

    // Check heading
    await expect(page.getByRole('heading', { name: /^Workflows$/i })).toBeVisible();
    await expect(page.getByText(/Create and manage your AI agent workflows/i)).toBeVisible();
  });

  test('should show empty state when no workflows exist', async ({ page }) => {
    await page.goto('/workflows');

    // Check empty state
    await expect(page.getByText(/No workflows yet/i)).toBeVisible();
    await expect(page.getByText(/Create your first workflow/i)).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await page.goto('/workflows');

    // Check search box
    const searchInput = page.getByPlaceholder(/Search workflows/i);
    await expect(searchInput).toBeVisible();

    // Should be able to type
    await searchInput.fill('test workflow');
    await expect(searchInput).toHaveValue('test workflow');
  });

  test('should navigate to new workflow editor', async ({ page }) => {
    await page.goto('/workflows');

    // Click "New Workflow" button
    await page.getByRole('link', { name: /New Workflow/i }).first().click();

    // Should navigate to editor
    await expect(page).toHaveURL('/workflows/new');
  });
});
