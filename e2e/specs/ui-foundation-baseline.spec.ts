import { test, expect } from '../fixtures';

/**
 * Explorer baseline screenshot suite (Wave 0 Step 4 -> Step 7 exit check).
 * Reuses e2e/fixtures.ts's persistent signed-in MSAL browser profile.
 *
 * Usage:
 *   # Capture Step 4 baselines before moving explorer-app styles into @layer reset:
 *   PW_VISUAL_BASELINE=1 npx playwright test --config e2e/playwright.config.ts e2e/specs/ui-foundation-baseline.spec.ts --update-snapshots
 *
 *   # Verify Step 7 exit check after @layer reset lands:
 *   PW_VISUAL_BASELINE=1 npx playwright test --config e2e/playwright.config.ts e2e/specs/ui-foundation-baseline.spec.ts
 */
test.describe('Explorer UI foundation baseline regression', () => {
  test.skip(
    process.env.PW_VISUAL_BASELINE !== '1',
    'Set PW_VISUAL_BASELINE=1 to capture or verify Wave 0 Explorer visual baselines.'
  );

  const routes = [
    { name: 'home', path: '/' },
    { name: 'theme-studio', path: '/app/admin/theme-studio' },
  ];

  for (const route of routes) {
    test(`captures ${route.name}`, async ({ page }, testInfo) => {
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await expect(page).toHaveScreenshot(`explorer-${route.name}-${testInfo.project.name}.png`, {
        fullPage: false,
      });
    });
  }
});
