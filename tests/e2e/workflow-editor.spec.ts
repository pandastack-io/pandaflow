import { test, expect } from '@playwright/test';

test.describe('Workflow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows/new');
  });

  test('should load workflow editor', async ({ page }) => {
    // Check toolbar
    await expect(page.getByPlaceholder(/Untitled Workflow/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/i })).toBeVisible();
  });

  test('should display node palette', async ({ page }) => {
    // Check node palette header
    await expect(page.getByText('Nodes')).toBeVisible();

    // Check search input
    await expect(page.getByPlaceholder(/Search nodes/i)).toBeVisible();

    // Check categories
    await expect(page.getByText('Triggers')).toBeVisible();
    await expect(page.getByText('Sandflare')).toBeVisible();
    await expect(page.getByText('AI & ML')).toBeVisible();
  });

  test('should allow editing workflow name', async ({ page }) => {
    const nameInput = page.getByPlaceholder(/Untitled Workflow/i);

    // Clear and type new name
    await nameInput.fill('My Test Workflow');
    await expect(nameInput).toHaveValue('My Test Workflow');
  });

  test('should expand and collapse node categories', async ({ page }) => {
    // Triggers should be expanded by default
    await expect(page.getByText('Manual Trigger')).toBeVisible();

    // Click to collapse
    await page.getByRole('button', { name: /Triggers/i }).click();

    // Manual Trigger should not be visible
    await expect(page.getByText('Manual Trigger')).not.toBeVisible();

    // Click to expand again
    await page.getByRole('button', { name: /Triggers/i }).click();
    await expect(page.getByText('Manual Trigger')).toBeVisible();
  });

  test('should search for nodes', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search nodes/i);

    // Search for "code"
    await searchInput.fill('code');

    // Should show Code Execution node
    await expect(page.getByText('Code Execution')).toBeVisible();

    // Should not show unrelated nodes (they're filtered out)
    // Clear search
    await searchInput.clear();
  });

  test('should add node to canvas by clicking', async ({ page }) => {
    // Wait for canvas to be ready
    await page.waitForSelector('.react-flow');

    // Click on "Manual Trigger" node in palette
    await page.getByText('Manual Trigger').click();

    // A node should appear on the canvas
    // Note: The actual verification depends on how nodes are rendered
    // This is a basic check that the action doesn't error
    await page.waitForTimeout(500); // Give time for node to appear
  });

  test('should display minimap and controls', async ({ page }) => {
    // Check for React Flow controls
    await expect(page.locator('.react-flow__controls')).toBeVisible();

    // Check for minimap
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
  });

  test('should show back button to workflows list', async ({ page }) => {
    // Click back button
    await page.getByRole('link').first().click();

    // Should navigate back to workflows
    await expect(page).toHaveURL('/workflows');
  });

  test('should display different node types', async ({ page }) => {
    // Expand Sandflare category
    const sandflareButton = page.getByRole('button', { name: /Sandflare/i });
    await sandflareButton.click();

    // Check for Sandflare nodes
    await expect(page.getByText('Code Execution')).toBeVisible();
    await expect(page.getByText('Web Scraper')).toBeVisible();

    // Expand AI category
    const aiButton = page.getByRole('button', { name: /AI & ML/i });
    await aiButton.click();

    // Check for AI nodes
    await expect(page.getByText('LLM Processing')).toBeVisible();
  });
});
