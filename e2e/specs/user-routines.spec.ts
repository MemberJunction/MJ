/**
 * ════════════════════════════════════════════════════════════════════════════
 *  User Routines — conversations surface — Playwright UI tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (the demoable end-to-end story of PR #3035):
 *   • The Routines section renders pinned at the very bottom of the Chat app's
 *     left sidebar (permission-gated inside the section component).
 *   • The "+" affordance opens the User Routines slide-in straight on the New
 *     Routine editor; the full creation flow works end-to-end: name, agent
 *     selection via the categorical tree picker (Sage), per-run message,
 *     Advanced (cron) frequency with a raw `* * * * *` expression.
 *   • THE LIVE PART: the every-minute routine is then executed by the REAL
 *     User Routine Dispatcher (the 1-minute scheduled-job sweep running inside
 *     MJAPI — nothing is mocked or invoked directly). The spec polls the
 *     command-center list until the routine's Last-Run chip reports Success,
 *     then opens Run History and asserts the run row, its in-app-notification
 *     bell, and the linked Agent-run record.
 *   • Cleanup is guaranteed (try/finally): the routine is deleted through the
 *     UI (confirm dialog included) so no every-minute fixture is left running.
 *     NOTE: the routine's dedicated conversation intentionally SURVIVES deletion
 *     (content outlives the schedule); it is hidden (Application-scoped) and
 *     name-tagged "safe to delete" — prune periodically if e2e runs accumulate.
 *
 * SELECTORS:
 *   Stable class hooks that ship with the components:
 *     .crs-section/.crs-header/.crs-add/.crs-row-name        (sidebar section)
 *     .routine-editor, #routine-name/#routine-message/#routine-cron,
 *     .editor-segment, mj-tree-dropdown [role=combobox] + .tree-node-label (editor + picker)
 *     .routine-card + [title="..."] action buttons            (list)
 *     .history-row/.history-notified                          (history)
 *
 * PREREQUISITES (NOT started by these tests):
 *   • MJAPI running (default :4001) — WITH the User Routine Dispatcher
 *     scheduled job active (metadata-seeded, 1-minute cron) and an AI setup
 *     that lets the 'Sage' agent answer a trivial prompt.
 *   • MJExplorer running (default http://localhost:4201 — override PW_BASE_URL).
 *   • The User Routines metadata bundle synced (dispatcher job, default
 *     notification template, entity permissions).
 *   • A primed, signed-in persistent auth profile at .playwright-cli/profile
 *     (override PW_USER_DATA_DIR). Prime it once:
 *       npx playwright-cli open --headed --profile .playwright-cli/profile http://localhost:4201
 *
 * NO SECRETS IN CODE: credentials come from the primed profile only.
 *
 * RUN:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/user-routines.spec.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Locator, Page } from '@playwright/test';

/** The Chat application (metadata/applications/.chat-application.json). */
const APP_NAME = 'Chat';

/** The agent the live routine targets — present in every MJ dev environment. */
const AGENT_NAME = 'Sage';

/** Self-describing fixture name; unique-ish suffix keeps reruns disjoint. */
const ROUTINE_NAME = `Sage says hi (e2e — safe to delete) ${Date.now().toString(36)}`;

/** How long we give the live dispatcher to produce the first successful run.
 *  Worst case: up to 1 min until NextRunAt + up to 1 min sweep alignment +
 *  agent latency; 6 minutes is generous without being flaky. */
const FIRST_RUN_TIMEOUT_MS = 6 * 60_000;

async function gotoChat(page: Page): Promise<void> {
  await page.goto(`/app/${encodeURIComponent(APP_NAME)}`, { waitUntil: 'domcontentloaded' });
  // The shell loading screen clears once the resource signals NotifyLoadComplete.
  await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 60_000 });
}

/**
 * The conversations sidebar starts collapsed for new/unpinned users (a
 * server-persisted user setting), which hides the bottom-pinned routines
 * section. Expand it via the chat header's toggle when needed.
 */
async function ensureSidebarOpen(page: Page): Promise<void> {
  // The chat header renders .sidebar-toggle-btn ONLY while the sidebar is
  // collapsed — its presence is the authoritative "collapsed" signal. (Do NOT
  // gate on .crs-section visibility: elements inside the zero-width,
  // overflow-hidden sidebar keep a nonzero bounding box, so Playwright deems
  // them "visible" even though they're clipped from paint.)
  const toggle = page.locator('.sidebar-toggle-btn').first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  await expect(page.locator('.conversation-sidebar:not(.collapsed)')).toBeVisible({ timeout: 30_000 });
  const section = page.locator('.crs-section');
  await expect(section).toBeVisible({ timeout: 60_000 });
  await expect(section).toBeInViewport();
}

/** The routine's card in the command-center list (scoped by name). */
function routineCard(page: Page): Locator {
  return page.locator('.routine-card', { hasText: ROUTINE_NAME });
}

/**
 * Makes sure the routines slide-in is open on the LIST view (its refresh button
 * is the signature). Resilient to the Vite dev server hot-reloading the whole
 * SPA mid-test — if the panel is gone, reopen it from the sidebar section.
 */
async function openRoutinesList(page: Page): Promise<void> {
  const refresh = page.locator('mj-refresh-button button').first();
  if (await refresh.isVisible().catch(() => false)) {
    return;
  }
  await expect(page.locator('.chat-conversations-container')).toBeVisible({ timeout: 60_000 });
  await ensureSidebarOpen(page);
  await page.locator('.crs-header').click();
  await expect(refresh).toBeVisible({ timeout: 30_000 });
}

/** Deletes the fixture routine through the UI if it exists. Idempotent. */
async function deleteRoutineIfPresent(page: Page): Promise<void> {
  try {
    await openRoutinesList(page);
  } catch {
    return; // app not in a state where the list can open — nothing more we can do here
  }
  const card = routineCard(page);
  if ((await card.count()) === 0) {
    return;
  }
  await card.locator('[title="Delete routine"]').click();
  const confirmDelete = page.getByRole('button', { name: 'Delete', exact: true });
  await confirmDelete.click();
  await expect(card).toHaveCount(0, { timeout: 30_000 });
}

test.describe.serial('User Routines — conversations surface', () => {
  test('routines section renders at the bottom of the Chat sidebar', async ({ page }) => {
    await gotoChat(page);
    await ensureSidebarOpen(page);
    const section = page.locator('.crs-section');
    await expect(section).toBeVisible();
    await expect(section.locator('.crs-title')).toHaveText('Routines');
    await expect(section.locator('.crs-mark')).toHaveClass(/fa-business-time/);
    await expect(section.locator('.crs-add')).toBeVisible();
  });

  test('create every-minute Sage routine → live dispatcher runs it → history + notification → delete', async ({ page }) => {
    test.setTimeout(FIRST_RUN_TIMEOUT_MS + 4 * 60_000);

    await gotoChat(page);
    await ensureSidebarOpen(page);

    // ── Create via the "+" affordance → slide-in opens straight on the editor ──
    await page.locator('.crs-add').click();
    const editor = page.locator('.routine-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });

    await editor.locator('#routine-name').fill(ROUTINE_NAME);

    // Agent picker: tree DROPDOWN (compact trigger) — open it, search, pick the leaf.
    // Search (rather than scrolling the expanded catalog) mirrors real usage and keeps
    // the target in the panel's viewport regardless of catalog size.
    const trigger = editor.locator('mj-tree-dropdown [role="combobox"]').first();
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await trigger.click();
    await page.locator('.tree-dropdown-search__input').fill(AGENT_NAME);
    const sageLeaf = page.locator('.tree-node-label', { hasText: AGENT_NAME }).first();
    await expect(sageLeaf).toBeVisible({ timeout: 60_000 });
    await sageLeaf.click();
    // The trigger displays the selection once picked.
    await expect(trigger).toContainText(AGENT_NAME, { timeout: 15_000 });

    await editor
      .locator('#routine-message')
      .fill('Say hi in one short sentence. This is an automated e2e heartbeat — keep it brief.');

    // Advanced (cron) frequency → raw every-minute expression.
    await editor.locator('.editor-segment', { hasText: 'Advanced (cron)' }).click();
    await editor.locator('#routine-cron').fill('* * * * *');
    await expect(editor.locator('.editor-schedule-preview')).toContainText(/minute/i);

    await editor.getByRole('button', { name: 'Create Routine' }).click();

    // Back on the command-center list with our card present.
    const card = routineCard(page);
    await expect(card).toBeVisible({ timeout: 30_000 });

    try {
      // The compact sidebar section reflects the new routine reactively (same
      // engine instance → BaseEntity save event → ObserveProperty emission).
      // The unpinned sidebar may have auto-collapsed behind the slide-in; the
      // section (and its rows) still render inside it once expanded again, so
      // assert against the DOM without requiring visibility here.
      await expect(page.locator('.crs-row-name', { hasText: 'Sage says hi' }).first()).toBeAttached({
        timeout: 30_000,
      });

      // ── Live dispatcher: poll (via the list's force-refresh) until the card's
      //    Last-Run chip reports Success. Nothing is stubbed — the real MJAPI
      //    scheduled-job sweep claims the routine and runs the Sage agent. ──
      await expect
        .poll(
          async () => {
            await openRoutinesList(page); // survives a dev-server SPA reload mid-poll
            await page.locator('mj-refresh-button button').first().click();
            await page.waitForTimeout(2_000); // allow the force-refresh round trip
            return card.getByText('Success', { exact: true }).count();
          },
          {
            timeout: FIRST_RUN_TIMEOUT_MS,
            intervals: [15_000],
            message: 'dispatcher never reported a successful run for the e2e routine',
          },
        )
        .toBeGreaterThan(0);

      // ── Run History: at least one run row, notified in-app, linked agent run ──
      await card.locator('[title="View run history"]').click();
      const historyRow = page.locator('.history-row').first();
      await expect(historyRow).toBeVisible({ timeout: 30_000 });
      await expect(historyRow.locator('.history-notified')).toBeVisible();
      await expect(historyRow.getByText('Agent run')).toBeVisible();

      // Back to the list for cleanup.
      await page.getByRole('button', { name: 'Back to list' }).click();
      await expect(card).toBeVisible({ timeout: 30_000 });
    } finally {
      // Guaranteed cleanup — never leave an every-minute routine behind.
      await deleteRoutineIfPresent(page);
    }
  });
});
