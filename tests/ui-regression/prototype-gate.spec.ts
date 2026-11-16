import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Project Lego Wave 0 Prototype Gate', () => {
  test('renders 3 genuinely distinct looks, enforces WCAG 4.1.2 row semantics, and survives hostile host + strict CSP', async ({
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

    // Closed <mj-layer> elements must have zero rendered box
    const closedLayerBox = await page.locator('#proto-dialog').boundingBox();
    expect(closedLayerBox).toBeNull();

    // WCAG 4.1.2 check: every interactive mj-row exposes an ARIA role and contains zero nested interactive controls
    const rowSemanticAudit = await page.locator('mj-row[interactive="true"]').evaluateAll((rows) =>
      rows.map((r) => ({
        role: r.getAttribute('role'),
        nestedControls: r.querySelectorAll('button, a[href], input, select, textarea').length,
      }))
    );
    for (const entry of rowSemanticAudit) {
      expect(['option', 'button', 'menuitem', 'menuitemradio']).toContain(entry.role);
      expect(entry.nestedControls).toBe(0);
    }

    // Hostile @layer reset rules must not break primitives
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

    // Look 2: Sidecar LXP (Avenir Next, 24px radius, 24px padding, warm oatmeal sunken well, sage selection)
    await page.getByRole('button', { name: 'Look: LXP' }).click();
    await expect(firstSurface).toHaveCSS('border-radius', '24px');
    await expect(firstSurface).toHaveCSS('padding-top', '24px');
    await expect(firstSurface).toHaveCSS('font-family', /Avenir Next/);
    await expect(firstSurface).toHaveCSS('background-color', 'rgb(255, 252, 246)');

    // Sunken well in right card must be warm oatmeal (#efe6d5 -> rgb(239, 230, 213)), not cool MJ slate (#f1f5f9)
    const sunkenSurface = overrideSurface.locator('mj-surface[level="sunken"]');
    await expect(sunkenSurface).toHaveCSS('background-color', 'rgb(239, 230, 213)');

    const selectedRow = page.locator('mj-row[selected="true"]').first();
    const lxpSelectedBg = await selectedRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lxpSelectedBg).not.toBe('rgb(230, 243, 249)');

    await expect(page).toHaveScreenshot(`gate-lxp-light-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    // Look 3: Editorial (dense, flat, square corners, Georgia serif)
    await page.getByRole('button', { name: 'Look: Editorial' }).click();
    await expect(firstSurface).toHaveCSS('border-radius', '0px');
    await expect(firstSurface).toHaveCSS('padding-top', '12px');
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

  test('CDK overlay handles dialog, sheet, keyboard-accessible menu popover (aria-expanded + ArrowDown + Enter), and open-layer axe', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const openDialogBtn = page.getByRole('button', { name: 'Open Dialog' });
    await openDialogBtn.click();

    const dialog = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    await page.waitForTimeout(200);
    const openDialogAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(openDialogAxe.violations, 'axe violations with dialog open').toEqual([]);

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

    // Menu popover: aria-expanded syncs, focus enters checked menuitemradio, ArrowDown + Enter selects LXP and returns focus
    const openPopoverBtn = page.locator('#open-popover');
    await expect(openPopoverBtn).toHaveAttribute('aria-expanded', 'false');
    await openPopoverBtn.click();
    await expect(openPopoverBtn).toHaveAttribute('aria-expanded', 'true');

    const menu = page.locator('.cdk-overlay-container [role="menu"]');
    await expect(menu).toBeVisible();

    const mjItem = menu.locator('[role="menuitemradio"][data-popover-action="mj"]');
    const lxpItem = menu.locator('[role="menuitemradio"][data-popover-action="lxp"]');
    await expect(mjItem).toBeFocused();

    await page.waitForTimeout(150);
    const openMenuAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(openMenuAxe.violations, 'axe violations with menu open').toEqual([]);

    await page.keyboard.press('ArrowDown');
    await expect(lxpItem).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(menu).toBeHidden();
    await expect(openPopoverBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(openPopoverBtn).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-look', 'lxp');
  });

  test('focus-visible ring works across all 3 looks and phone targets meet 44px', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const compactRow = page.locator('mj-row[density="sm"][interactive="true"]').first();

    await page.keyboard.press('Tab');
    for (const lookName of ['Look: MJ Default', 'Look: LXP', 'Look: Editorial']) {
      await page.getByRole('button', { name: lookName }).click();
      await page.keyboard.press('Tab');
      await compactRow.focus();
      const boxShadow = await compactRow.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow, `focus ring missing on ${lookName}`).not.toBe('none');
    }

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
