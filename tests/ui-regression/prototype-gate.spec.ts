import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Project Lego Wave 0 Prototype Gate', () => {
  test('renders 3 radically different looks with 0 console/CSP errors and host wins', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    // Unlayered host rule wins without !important
    const overrideSurface = page.locator('.host-override-surface');
    await expect(overrideSurface).toHaveCSS('border-top-style', 'dashed');
    await expect(overrideSurface).toHaveCSS('border-top-width', '2px');

    // Open-axis custom tone (plum) applies
    const plumRow = page.locator('mj-row[tone="plum"]');
    await expect(plumRow).toHaveCSS('color', 'rgb(112, 26, 117)');

    // Look 1: MJ Default (light)
    await expect(page).toHaveScreenshot(`gate-mj-light-${testInfo.project.name}.png`, {
      fullPage: true,
    });

    // Look 2: LXP (light)
    await page.getByRole('button', { name: 'Look: LXP' }).click();
    await expect(page.locator('mj-surface').first()).toHaveCSS('border-radius', '16px');
    await expect(page).toHaveScreenshot(`gate-lxp-light-${testInfo.project.name}.png`, {
      fullPage: true,
    });

    // Look 3: Editorial (dense, flat, square corners, serif)
    await page.getByRole('button', { name: 'Look: Editorial' }).click();
    const firstSurface = page.locator('mj-surface').first();
    await expect(firstSurface).toHaveCSS('border-radius', '0px');
    await expect(firstSurface).toHaveCSS('font-family', /Georgia/);
    await expect(page).toHaveScreenshot(`gate-editorial-light-${testInfo.project.name}.png`, {
      fullPage: true,
    });

    // Dark mode check on MJ Default
    await page.getByRole('button', { name: 'Look: MJ Default' }).click();
    await page.getByRole('button', { name: 'Toggle Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`gate-mj-dark-${testInfo.project.name}.png`, {
      fullPage: true,
    });

    expect(errors).toEqual([]);
  });

  test('layer service handles dialog, sheet, Escape, scroll lock, and focus return', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const openDialogBtn = page.getByRole('button', { name: 'Open Dialog' });
    await openDialogBtn.click();

    const dialog = page.locator('#proto-dialog [role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    // Escape closes dialog, releases scroll lock, and returns focus
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await expect(openDialogBtn).toBeFocused();

    // Sheet opens on the same MJLayerService base
    const openSheetBtn = page.getByRole('button', { name: 'Open Sheet' });
    await openSheetBtn.click();
    const sheet = page.locator('#proto-sheet [role="dialog"][aria-modal="true"]');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('passes axe WCAG 2.1 AA across all 3 looks and dark mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    for (const lookName of ['Look: MJ Default', 'Look: LXP', 'Look: Editorial']) {
      await page.getByRole('button', { name: lookName }).click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations, `axe violations on ${lookName}`).toEqual([]);
    }

    await page.getByRole('button', { name: 'Look: MJ Default' }).click();
    await page.getByRole('button', { name: 'Toggle Dark' }).click();
    await page.waitForTimeout(250);
    const darkResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(darkResults.violations, 'axe violations on dark mode').toEqual([]);
  });
});
