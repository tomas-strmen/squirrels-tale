import { expect, test } from '@playwright/test';

/**
 * M0.3 smoke test (GDD 22, M0): the production build loads in a real browser
 * and the Phaser canvas renders without errors.
 *
 * Phaser draws everything (title, buttons, bars) onto a <canvas>, not into
 * normal HTML, so Playwright cannot read that text - it can only check that
 * the canvas exists, has content and the page raised no errors. Game logic
 * itself is covered by the src/core Vitest tests.
 */
test('game loads and renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle("Squirrel's Tale");

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);

  // Give Phaser a moment to draw the first frame before the screenshot.
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/loaded.png' });

  expect(errors).toEqual([]);
});
