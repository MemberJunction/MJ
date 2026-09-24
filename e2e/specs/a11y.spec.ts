/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Accessibility (axe-core) — Playwright UI scans
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS:
 *   • The signed-in Explorer shell (Home) scanned with axe-core against the
 *     WCAG 2.0/2.1 A + AA rule tags.
 *   • The omnibar command palette (opened via Ctrl/Cmd+K, same navigation as
 *     omnibar.spec.ts) scanned scoped to the palette surface.
 *
 * This is the PAGE-level tier of the a11y gate: the jsdom widget tier
 * (`ExpectNoAxeViolations` in @memberjunction/ng-test-utils) cannot honestly
 * evaluate layout-dependent rules (color-contrast) or page-structure rules
 * (region / landmarks / bypass) — those run here, in a real browser, at full
 * strength.
 *
 * DEBT PATTERN: a genuine violation whose fix is product work gets its rule id
 * added to the relevant *_DEBT_RULES list below with an `// A11Y-DEBT:` comment
 * naming the rule and the impacted surface — the rest of the rule set keeps
 * gating. Empty lists mean "no known debt on this surface".
 *
 * PREREQUISITES (NOT started by these tests): MJAPI + MJExplorer running,
 * primed auth profile at .playwright-cli/profile (see user-routines.spec.ts).
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/a11y.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { ensureOmnibarEnabled } from '../omnibar-optin';

/** WCAG conformance target for every scan in this spec. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa'];

/**
 * Known accessibility debt, per scanned surface. Every entry MUST carry an
 * `// A11Y-DEBT:` comment naming the rule and why it is waived. Currently empty —
 * no violations are on record for these surfaces yet (this spec is authored ahead
 * of a live-Explorer run; the first execution may populate these).
 */
const SHELL_DEBT_RULES: string[] = [
  // (none recorded)
];
const OMNIBAR_DEBT_RULES: string[] = [
  // (none recorded)
];

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/**
 * One readable line per violation — rule id, impact, help text, and the CSS
 * targets of the impacted nodes — so a failing scan names exactly what to fix
 * (or what to record as debt) instead of dumping the raw axe JSON.
 */
function summarizeViolations(results: AxeResults): string[] {
  return results.violations.map((violation) => {
    const nodes = violation.nodes.map((node) => node.target.join(' ')).join(', ');
    return `${violation.id} [${violation.impact ?? 'unknown impact'}]: ${violation.help} — nodes: ${nodes}`;
  });
}

// Mirrors omnibar.spec.ts gotoHome exactly — boot the shell, absorb the stale-cache
// recovery card if it appears, wait for a header search affordance, ensure the
// omnibar opt-in so both specs scan the same shell configuration.
async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The persistent profile's IndexedDB metadata cache can go stale after bundle
  // rebuilds — the shell then offers a "Taking longer than expected → Reset" card.
  // Click it once; Reset clears the local cache and reloads clean.
  const reset = page.getByRole('button', { name: /reset/i });
  try {
    await reset.waitFor({ timeout: 20_000 });
    await reset.click();
  } catch {
    // no recovery card — normal boot
  }
  // Shell header present = app booted past the loading screen. Which search
  // affordance renders depends on omnibar opt-in: the bar button (on) or the
  // inline composite (off) — wait for either.
  await expect(
    page.locator('.search-btn').or(page.locator('.shell-search-bar')).first()
  ).toBeVisible({ timeout: 120_000 });
  // The omnibar is per-user OPT-IN — enable it for the test user (idempotent).
  await ensureOmnibarEnabled(page);
}

// Mirrors omnibar.spec.ts openPalette exactly.
async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect(page.locator('.omnibar-palette')).toBeVisible({ timeout: 15_000 });
}

test.describe.serial('Accessibility (axe, WCAG 2.0/2.1 A + AA)', () => {
  test('Explorer shell (Home) has no axe violations', async ({ page }) => {
    await gotoHome(page);
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .disableRules(SHELL_DEBT_RULES)
      .analyze();
    expect(summarizeViolations(results), 'axe violations on the Explorer shell').toEqual([]);
  });

  test('Omnibar command palette has no axe violations', async ({ page }) => {
    await gotoHome(page);
    await openPalette(page);
    // Scope to the palette so this test gates the omnibar surface specifically —
    // shell-level findings belong to (and fail) the shell scan above, not this one.
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .include('.omnibar-palette')
      .disableRules(OMNIBAR_DEBT_RULES)
      .analyze();
    expect(summarizeViolations(results), 'axe violations on the omnibar palette').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.omnibar-palette')).toBeHidden();
  });
});
