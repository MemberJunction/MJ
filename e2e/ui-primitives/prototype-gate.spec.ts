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

    // Element entry dynamically injected <style id="mj-wave0-prototype-styles" nonce="..."> under strict CSP
    // (Browsers clear getAttribute('nonce') on insertion per HTML nonce-hiding; IDL .nonce and parsed cssRules prove acceptance)
    const injectedStyleCheck = await page
      .locator('style#mj-wave0-prototype-styles')
      .evaluate((el) => ({
        nonce: (el as HTMLStyleElement).nonce,
        ruleCount: (el as HTMLStyleElement).sheet?.cssRules.length ?? 0,
      }));
    expect(injectedStyleCheck.nonce).toBeTruthy();
    expect(injectedStyleCheck.ruleCount).toBeGreaterThan(0);

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

    // Listbox roving tabindex + ArrowDown keyboard navigation (one Tab stop for all 3 options)
    const listboxOptions = page.locator('[role="listbox"] > mj-row[role="option"]');
    await expect(listboxOptions.nth(0)).toHaveAttribute('tabindex', '0');
    await expect(listboxOptions.nth(1)).toHaveAttribute('tabindex', '-1');
    await expect(listboxOptions.nth(2)).toHaveAttribute('tabindex', '-1');

    await listboxOptions.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(listboxOptions.nth(1)).toBeFocused();
    await expect(listboxOptions.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(listboxOptions.nth(1)).toHaveClass(/\bis-selected\b/);
    await expect(listboxOptions.nth(1)).toHaveAttribute('tabindex', '0');
    await expect(listboxOptions.nth(0)).toHaveAttribute('tabindex', '-1');

    // Restore option 0 before baseline screenshot so selection stays on lesson 01
    await page.keyboard.press('ArrowUp');
    await expect(listboxOptions.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Hostile @layer reset rules must not break primitives, and [Elevation="sm"] renders a real shadow on base surface
    const firstSurface = page.locator('mj-surface').first();
    await expect(firstSurface).toHaveCSS('box-sizing', 'border-box');
    await expect(firstSurface).toHaveCSS('border-radius', '12px');
    const baseSmShadow = await firstSurface.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(baseSmShadow).not.toBe('none');
    expect(baseSmShadow).not.toContain('rgba(0, 0, 0, 0) 0px 0px');

    // Custom Element removeAttribute reactivity + .is-selected state class (no data-* visual state)
    const thirdOption = listboxOptions.nth(2);
    await thirdOption.evaluate((el) => el.setAttribute('selected', ''));
    await expect(thirdOption).toHaveClass(/\bis-selected\b/);
    await thirdOption.evaluate((el) => el.removeAttribute('selected'));
    await expect(thirdOption).not.toHaveClass(/\bis-selected\b/);

    // Unlayered host rule wins without !important
    const overrideSurface = page.locator('.host-override-surface');
    await expect(overrideSurface).toHaveCSS('border-top-style', 'dashed');
    await expect(overrideSurface).toHaveCSS('border-top-width', '2px');

    // Tier 3 --mj-surface-{bg,padding,radius} overrides on an outer surface must not bleed into a nested <mj-surface>
    const sunkenSurface = overrideSurface.locator('mj-surface[level="sunken"]');
    const defaultSunkenBg = await sunkenSurface.evaluate((el) => getComputedStyle(el).backgroundColor);
    const defaultSunkenPadding = await sunkenSurface.evaluate((el) => getComputedStyle(el).paddingTop);
    const defaultSunkenRadius = await sunkenSurface.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    await overrideSurface.evaluate((el) => {
      el.style.setProperty('--mj-surface-bg', 'rgb(254, 242, 242)');
      el.style.setProperty('--mj-surface-padding', '40px');
      el.style.setProperty('--mj-surface-radius', '32px');
    });
    await expect(overrideSurface).toHaveCSS('background-color', 'rgb(254, 242, 242)');
    await expect(overrideSurface).toHaveCSS('padding-top', '40px');
    await expect(overrideSurface).toHaveCSS('border-top-left-radius', '32px');
    await expect(sunkenSurface).toHaveCSS('background-color', defaultSunkenBg);
    await expect(sunkenSurface).toHaveCSS('padding-top', defaultSunkenPadding);
    await expect(sunkenSurface).toHaveCSS('border-top-left-radius', defaultSunkenRadius);
    await overrideSurface.evaluate((el) => {
      el.style.removeProperty('--mj-surface-bg');
      el.style.removeProperty('--mj-surface-padding');
      el.style.removeProperty('--mj-surface-radius');
    });

    // Elevated surface secondary text must resolve --mj-surface-elevated-text-secondary (never collapse via var() cycle to primary text)
    const elevatedPrimaryColor = await overrideSurface.locator('.gate-row-title').first().evaluate((el) => getComputedStyle(el).color);
    const elevatedSecondaryColor = await overrideSurface.locator('.gate-row-meta').first().evaluate((el) => getComputedStyle(el).color);
    expect(elevatedSecondaryColor).not.toBe(elevatedPrimaryColor);

    // Part reorder: declarative [mj-surface-footer] rendered before [mj-surface-body] in second surface
    const reorderedChildren = await overrideSurface.locator('> div').evaluateAll((els) =>
      els.map((el) =>
        el.hasAttribute('mj-surface-footer')
          ? 'mj-surface-footer'
          : el.hasAttribute('mj-surface-body')
            ? 'mj-surface-body'
            : el.className
      )
    );
    expect(reorderedChildren).toEqual(['mj-surface-footer', 'mj-surface-body']);

    // Open-axis custom tone (plum) & visual-role (nav-item) from :root tokens only
    const plumRow = page.locator('mj-row[tone="plum"]');
    await expect(plumRow).toHaveCSS('color', 'rgb(112, 26, 117)');
    await expect(plumRow).toHaveCSS('padding-left', '16px');

    // Look 1: MJ Default (light)
    await expect(page).toHaveScreenshot(`gate-mj-light-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    // Look 2: Sidecar LXP (Avenir Next, 24px radius, 24px padding, warm oatmeal sunken well, terracotta custom tone)
    await page.getByRole('button', { name: 'Look: LXP' }).click();
    await expect(firstSurface).toHaveCSS('border-radius', '24px');
    await expect(firstSurface).toHaveCSS('padding-top', '24px');
    await expect(firstSurface).toHaveCSS('font-family', /Avenir Next/);
    await expect(firstSurface).toHaveCSS('background-color', 'rgb(255, 252, 246)');
    await expect(plumRow).toHaveCSS('color', 'rgb(140, 59, 31)');

    // Sunken well in right card must be warm oatmeal (#efe6d5 -> rgb(239, 230, 213)), not cool MJ slate (#f1f5f9)
    await expect(sunkenSurface).toHaveCSS('background-color', 'rgb(239, 230, 213)');

    const selectedRow = page.locator('mj-row[selected="true"]').first();
    const lxpSelectedBg = await selectedRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lxpSelectedBg).not.toBe('rgb(235, 244, 250)');

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
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(`gate-mj-dark-${testInfo.project.name}.png`, {
      fullPage: false,
    });

    expect(errors).toEqual([]);
  });

  test('CDK overlay handles dialog, Tab trap, phone bottom-sheet collapse, ref-counted scroll lock, sheet, menu popover, and open-layer axe', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const openDialogBtn = page.getByRole('button', { name: 'Open Dialog' });
    await openDialogBtn.click();

    const dialog = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    // Dialog auto-wires aria-labelledby to [mj-layer-title] / .mj-layer-title without requiring a duplicate label attribute
    const titleId = await dialog
      .locator('.mj-layer-title, [mj-layer-title]')
      .getAttribute('id');
    expect(titleId).toBeTruthy();
    await expect(dialog).toHaveAttribute('aria-labelledby', titleId!);

    // Phone viewport collapses Kind="dialog" to a full-width bottom sheet (wait for slide-up animation to settle)
    if (testInfo.project.name === 'phone-chromium') {
      await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(Math.round(dialogBox!.width)).toBe(390);
      expect(Math.abs(dialogBox!.y + dialogBox!.height - 844)).toBeLessThanOrEqual(1);
    }

    // Focus starts on [data-autofocus] (Confirm) and Tab / Shift+Tab stays trapped inside the modal
    const confirmBtn = dialog.getByRole('button', { name: 'Confirm' });
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    const closeIconBtn = dialog.getByRole('button', { name: 'Close dialog' });
    await expect(confirmBtn).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancelBtn).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeIconBtn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancelBtn).toBeFocused();

    await page.waitForTimeout(200);
    const openDialogAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(openDialogAxe.violations, 'axe violations with dialog open').toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
    await expect(openDialogBtn).toBeFocused();

    // Stacked modals + out-of-order close: closing underlying sheet keeps scroll lock until top dialog closes
    const openSheetBtn = page.getByRole('button', { name: 'Open Sheet' });
    await openSheetBtn.click();
    const overlays = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(overlays).toHaveCount(1);
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    // Upright phone: the side sheet fills the screen, with no strip of page beside it
    if (testInfo.project.name === 'phone-chromium') {
      const sideSheet = overlays.first();
      await sideSheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const sheetBox = await sideSheet.boundingBox();
      expect(sheetBox).not.toBeNull();
      expect(Math.round(sheetBox!.x)).toBe(0);
      expect(Math.round(sheetBox!.width)).toBe(390);
      expect(Math.round(sheetBox!.height)).toBe(844);
    }

    await page.evaluate(() => document.getElementById('proto-dialog')?.setAttribute('open', 'true'));
    await expect(overlays).toHaveCount(2);
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    await page.evaluate(() => document.getElementById('proto-sheet')?.removeAttribute('open'));
    await expect(overlays).toHaveCount(1);
    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);

    await page.evaluate(() => document.getElementById('proto-dialog')?.removeAttribute('open'));
    await expect(overlays).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);

    // Menu popover: aria-expanded syncs, focus enters checked menuitemradio, ArrowDown + Enter selects LXP and returns focus.
    // Desktop: anchored and non-modal. Phone: a modal bottom sheet that keeps role="menu" (WAVE_0_SPEC.md 6.2.1).
    const isPhone = testInfo.project.name === 'phone-chromium';
    const openPopoverBtn = page.locator('#open-popover');
    await expect(openPopoverBtn).toHaveAttribute('aria-expanded', 'false');
    await openPopoverBtn.click();
    await expect(openPopoverBtn).toHaveAttribute('aria-expanded', 'true');

    const menu = page.locator('.cdk-overlay-container [role="menu"]');
    await expect(menu).toBeVisible();
    const menuPane = page.locator('.cdk-overlay-pane', { has: page.locator('[role="menu"]') });
    if (isPhone) {
      await expect(menuPane).toHaveClass(/mj-layer-pane-phone-sheet/);
      await expect(menuPane).toHaveAttribute('role', 'dialog');
      await expect(menuPane).toHaveAttribute('aria-modal', 'true');
      await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);
      await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();
      expect(Math.round(menuBox!.width)).toBe(390);
      expect(Math.abs(menuBox!.y + menuBox!.height - 844)).toBeLessThanOrEqual(1);

      // Phones have no Escape key and a screen reader cannot reach the backdrop, so the sheet
      // generates a Close control. In a menu it is a menuitem the arrow keys reach.
      const sheetClose = menu.getByRole('menuitem', { name: 'Close' });
      await expect(sheetClose).toBeVisible();
      expect((await sheetClose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await sheetClose.click();
      await expect(menu).toBeHidden();
      await expect(openPopoverBtn).toBeFocused();
      await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
      await openPopoverBtn.click();
      await expect(menu).toBeVisible();
    } else {
      await expect(menu.locator('.mj-layer-sheet-close')).toHaveCount(0);
      await expect(menuPane).not.toHaveClass(/mj-layer-pane-phone-sheet/);
      await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
    }

    // aria-controls points at the portaled panel while open, not at the empty <mj-layer> host
    const controlsId = await openPopoverBtn.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    await expect(menu).toHaveAttribute('id', controlsId!);

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
    await expect(openPopoverBtn).not.toHaveAttribute('aria-controls', /.+/);
    await expect(openPopoverBtn).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-look', 'lxp');
    await expect(page.getByRole('button', { name: 'Look: LXP' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
  });

  test('a layer set to PhonePresentation="anchored" stays anchored at phone width', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone-chromium', 'Phone presentation only differs at phone width');
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    // Stand-in for a combobox suggestion list: content tied to a field being typed into stays next to it.
    await page.evaluate(() => {
      const layer = document.createElement('mj-layer');
      layer.id = 'proto-anchored';
      layer.setAttribute('kind', 'popover');
      layer.setAttribute('phone-presentation', 'anchored');
      layer.setAttribute('anchor', '#open-popover');
      layer.setAttribute('label', 'Suggestions');
      layer.innerHTML = '<div mj-layer-body><button type="button">First suggestion</button></div>';
      document.querySelector('main')?.appendChild(layer);
    });
    await page.waitForFunction(() => document.querySelector('#proto-anchored .mj-layer-staging') !== null);
    await page.evaluate(() => document.getElementById('proto-anchored')?.setAttribute('open', 'true'));

    const panel = page.locator('.cdk-overlay-container [role="dialog"][aria-label="Suggestions"]');
    await expect(panel).toBeVisible();
    const pane = page.locator('.cdk-overlay-pane', { has: page.locator('[aria-label="Suggestions"]') });
    await expect(pane).not.toHaveClass(/mj-layer-pane-phone-sheet/);
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.cdk-overlay-backdrop')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(390);
    expect(box!.y + box!.height).toBeLessThan(843);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('a phone held sideways opens sheets capped at 640px and centered; a short desktop window stays desktop', async ({
    page,
  }, testInfo) => {
    const isPhone = testInfo.project.name === 'phone-chromium';
    await page.setViewportSize(isPhone ? { width: 844, height: 390 } : { width: 1280, height: 450 });
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    await page.locator('#open-popover').click();
    const menu = page.locator('.cdk-overlay-container [role="menu"]');
    await expect(menu).toBeVisible();
    const pane = page.locator('.cdk-overlay-pane', { has: page.locator('[role="menu"]') });

    if (isPhone) {
      await expect(pane).toHaveClass(/mj-layer-pane-phone-sheet/);
      await expect(pane).toHaveClass(/mj-layer-pane-phone-short/);
      await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const box = await menu.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.width)).toBe(640);
      expect(Math.abs(box!.x - (844 - 640) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.y + box!.height - 390)).toBeLessThanOrEqual(1);
    } else {
      // A mouse pointer keeps a short desktop window out of phone mode.
      await expect(pane).not.toHaveClass(/mj-layer-pane-phone-sheet/);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Sideways, a side sheet keeps its side panel: it fits beside the page
    if (isPhone) {
      await page.getByRole('button', { name: 'Open Sheet' }).click();
      const sideSheet = page.locator('.cdk-overlay-container .mj-layer-kind-sheet');
      await expect(sideSheet).toBeVisible();
      await sideSheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const sheetBox = await sideSheet.boundingBox();
      expect(sheetBox).not.toBeNull();
      expect(Math.round(sheetBox!.width)).toBe(420);
      expect(Math.round(sheetBox!.x + sheetBox!.width)).toBe(844);
      await page.keyboard.press('Escape');
      await expect(sideSheet).toBeHidden();
    }
  });

  test('removing an attribute restores the default instead of throwing', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    // Every axis and option attribute on the page, removed at once; each input must fall back to its default
    const removed = await page.evaluate(async () => {
      const attrs = ['level', 'tone', 'visual-role', 'elevation', 'padding', 'radius', 'density', 'item-role', 'kind', 'placement', 'size'];
      let count = 0;
      for (const attr of attrs) {
        for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
          el.removeAttribute(attr);
          count++;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      return count;
    });
    expect(removed).toBeGreaterThan(10);
    expect(errors).toEqual([]);
    await expect(page.locator('mj-surface').first()).toHaveClass(/mj-surface-base/);

    // Closeable defaults to true, so removing closeable="false" makes the layer closeable again
    await page.evaluate(() => {
      const dialog = document.getElementById('proto-dialog');
      dialog?.setAttribute('closeable', 'false');
      dialog?.removeAttribute('closeable');
      dialog?.setAttribute('open', 'true');
    });
    const dialog = page.locator('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('focus-visible ring works across all 3 looks and phone targets meet 44px', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.waitForSelector('mj-surface.mj-surface');

    const compactRow = page.locator('mj-row[density="sm"][interactive="true"]').first();
    const elevatedSurface = page.locator('mj-surface[level="elevated"]').first();
    await elevatedSurface.evaluate((el) => el.setAttribute('tabindex', '0'));

    await page.keyboard.press('Tab');
    for (const lookName of ['Look: MJ Default', 'Look: LXP', 'Look: Editorial']) {
      await page.getByRole('button', { name: lookName }).click();
      await page.keyboard.press('Tab');
      await compactRow.focus();
      const boxShadow = await compactRow.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow, `focus ring missing on ${lookName}`).not.toBe('none');

      await elevatedSurface.focus();
      const surfaceFocusShadow = await elevatedSurface.evaluate(
        (el) => getComputedStyle(el).boxShadow
      );
      expect(surfaceFocusShadow, `surface focus ring missing on ${lookName}`).not.toBe('none');
      if (lookName !== 'Look: Editorial') {
        // Resting --mj-shadow-md (2 layers) + 2-layer --mj-focus-ring = 4 shadow layers (never drops flat)
        expect(surfaceFocusShadow.split(/px,\s*/).length).toBeGreaterThanOrEqual(3);
      }
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
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await page.waitForTimeout(250);
    const darkResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(darkResults.violations, 'axe violations on dark mode').toEqual([]);
  });
});
