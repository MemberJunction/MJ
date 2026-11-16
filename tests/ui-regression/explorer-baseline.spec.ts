import { test, expect } from '@playwright/test';

const EXPLORER_URL = process.env.EXPLORER_URL;

/**
 * Explorer baseline screenshot suite (Step 4 -> Step 7 gate).
 * Run with EXPLORER_URL=http://localhost:4200 before moving _common.scss into @layer reset,
 * then re-run after Step 7 to confirm zero unexpected visual shifts.
 */
test.describe('Explorer baseline regression', () => {
  test.skip(!EXPLORER_URL, 'Set EXPLORER_URL (e.g. http://localhost:4200) to run Explorer baseline screenshots.');

  const routes = [
    { name: 'home', path: '/' },
    { name: 'theme-studio', path: '/app/admin/theme-studio' },
  ];

  for (const route of routes) {
    test(`captures ${route.name}`, async ({ page }, testInfo) => {
      await page.goto(`${EXPLORER_URL}${route.path}`, { waitUntil: 'networkidle' });
      await expect(page).toHaveScreenshot(`explorer-${route.name}-${testInfo.project.name}.png`, {
        fullPage: false,
      });
    });
  }
});
