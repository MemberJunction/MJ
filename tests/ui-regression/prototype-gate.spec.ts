import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Project Lego Wave 0 Prototype Gate', () => {
  test('renders 3 radically different looks, survives hostile host + strict CSP, and fixes closed layer + LXP selected bugs', async ({
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

    // Bug fix 1: closed <mj-layer> elements must have zero rendered box
    const closedLayerBox = await page.locator('#proto-dialog').boundingBox();
    expect(closedLayerBox).toBeNull();

    // Hostile * { box-sizing: content-box } and div { border-radius: 0 } must not break primitives
    const firstSurface = page.locator('mj-surface').first();
    await expect(firstSurface).toHaveCSS('box-sizing', 'border-box');
    await expect(firstSurface).toHaveCSS('border-radius', '12px');

    // Unlayered host rule wins without !important
    const overrideSurface = page.locator('.host-override-surface');
    await expect(overrideSurface).toHaveCSS('border-top-style', 'dashed');
    await expect(overrideSurface).toHaveCSS('border-top-width', '2px');

    // Part reorder: footer rendered before body in second surface
    const reorderedChildren = await overrideSurface.locator('> div').evaluateAll((els) =>
      els.map((el) => el.className)
    );
    expect(reorderedChildren).toEqual(['mj-surface-footer', 'mj-surface-body']);

    // Open-axis custom tone (plum) & role (nav-item) from :root tokens only
    const plumRow = page.locator('mj-row[tone="plum"]');
    await expect(plumRow).toHaveCSS('color', 'rgb(112, 26, 117)');
    await expect(plumRow).toHaveCSS('padding-left', '16px');

    // Look 1: MJ Default (light)
    await expect(page).toHaveScreenshot(`gate-mj-light-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    // Look 2: LXP (Sidecar Learning Hub: warm cream, sage, 16px surface radius, 20px padding)
    await page.getByRole('button', { name: 'Look: LXP' }).click();
    await expect(firstSurface).toHaveCSS('border-radius', '16px');
    await expect(firstSurface).toHaveCSS('padding-top', '20px');
    await expect(firstSurface).toHaveCSS('background-color', 'rgb(254, 247, 235)');

    // Bug fix 2: LXP selected row must NOT stay MJ blue (#e6f3f9 -> rgb(230, 243, 249))
    const selectedRow = page.locator('mj-row[selected="true"]');
    const lxpSelectedBg = await selectedRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lxpSelectedBg).not.toBe('rgb(230, 243, 249)');

    await expect(page).toHaveScreenshot(`gate-lxp-light-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    // Look 3: Editorial (dense, flat, square corners, serif)
    await page.getByRole('button', { name: 'Look: Editorial' }).click();
    await expect(firstSurface).toHaveCSS('border-radius', '0px');
    await expect(firstSurface).toHaveCSS('padding-top', '8px');
    await expect(firstSurface).toHaveCSS('font-family', /Georgia/);
    await expect(page).toHaveScreenshot(`gate-editorial-light-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    // Dark mode check on MJ Default
    await page.getByRole('button', { name: 'Look: MJ Default' }).click();
    await page.getByRole('button', { name: 'Toggle Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`gate-mj-dark-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    expect(errors).toEqual([]);
  });

  test('CDK overlay layer handles dialog, sheet, Escape, scroll lock, focus return, and open-layer axe', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const openDialogBtn = page.getByRole('button', { name: 'Open Dialog' });
    await openDialogBtn.click();

    // Rendered inside CDK OverlayContainer, not inline inside #proto-dialog
    const dialog = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    // axe scan with dialog OPEN (wait for 160ms entrance animation to settle)
    await page.waitForTimeout(200);
    const openDialogAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(openDialogAxe.violations, 'axe violations with dialog open').toEqual([]);

    // Escape closes dialog, disposes CDK overlay, releases scroll block, and returns focus
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
    await expect(openDialogBtn).toBeFocused();

    // Sheet opens on the same CDK Overlay base
    const openSheetBtn = page.getByRole('button', { name: 'Open Sheet' });
    await openSheetBtn.click();
    const sheet = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(sheet).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    // Non-modal popover opens and Dismiss button closes it
    const openPopoverBtn = page.getByRole('button', { name: 'Open Popover' });
    await openPopoverBtn.click();
    const popover = page.locator('.cdk-overlay-container [role="dialog"][data-kind="popover"]');
    await expect(popover).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(popover).toBeHidden();
  });

  test('focus-visible ring works across all 3 looks and phone targets meet 44px', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const compactRow = page.locator('mj-row[density="sm"]');

    // Focus-visible check across all 3 looks (press Tab first so Chromium enables :focus-visible)
    await page.keyboard.press('Tab');
    for (const lookName of ['Look: MJ Default', 'Look: LXP', 'Look: Editorial']) {
      await page.getByRole('button', { name: lookName }).click();
      await page.keyboard.press('Tab');
      await compactRow.focus();
      const boxShadow = await compactRow.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow, `focus ring missing on ${lookName}`).not.toBe('none');
    }

    // Touch target check on phone project (pointer: coarse -> 44px minimum)
    if (testInfo.project.name === 'phone-chromium') {
      const box = await compactRow.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
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
