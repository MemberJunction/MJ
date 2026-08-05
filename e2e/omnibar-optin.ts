/**
 * Omnibar per-user opt-in helper for E2E specs.
 *
 * The omnibar is OPT-IN per user: the 'Shell.Omnibar.Enabled' Instance Config
 * row only makes it AVAILABLE; each user enables it from My Profile → Command
 * Palette (persisted server-side via UserInfoEngine, key
 * 'mj.shell.omnibar.enabled'). Specs that exercise the palette call this after
 * boot — it's idempotent: a no-op when the test user already opted in (the
 * setting persists across runs), otherwise it opts in through the real UI,
 * which doubles as coverage of the toggle path.
 */
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function ensureOmnibarEnabled(page: Page): Promise<void> {
  // The two opt-in states render DIFFERENT header search affordances on desktop:
  // omnibar ON → the .search-btn bar (a button that opens the palette);
  // omnibar OFF → the .shell-search-bar inline composite (a real input with an
  // attached suggest dropdown). Detect by which one is on screen.
  const omnibarBar = page.locator('.search-btn');
  const legacyComposite = page.locator('.shell-search-bar');
  await expect(omnibarBar.or(legacyComposite).first()).toBeVisible({ timeout: 15_000 });
  if (await omnibarBar.first().isVisible().catch(() => false)) {
    return; // already opted in
  }
  await setOmnibarEnabled(page, true);
  await expect(omnibarBar.first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Drives My Profile → Command Palette to the requested state. Assumes the
 * shell header is on screen. Leaves the profile dialog closed.
 */
export async function setOmnibarEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.locator('.avatar-btn').click();
  await page.locator('.user-menu-item', { hasText: 'My Profile' }).click();
  const toggle = page.locator('[data-testid="omnibar-toggle"]');
  await toggle.waitFor({ timeout: 15_000 });
  const isOn = await toggle.evaluate((el) => el.classList.contains('mj-profile__channel--on'));
  if (isOn !== enabled) {
    await toggle.click();
    // The switch reflects the persisted state only after the server save wins.
    if (enabled) {
      await expect(toggle).toHaveClass(/mj-profile__channel--on/, { timeout: 15_000 });
    } else {
      await expect(toggle).not.toHaveClass(/mj-profile__channel--on/, { timeout: 15_000 });
    }
  }
  await page.locator('.mj-profile__btn--primary', { hasText: 'Done' }).click();
  await expect(page.locator('[data-testid="omnibar-toggle"]')).toBeHidden({ timeout: 10_000 });
}
