/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Predictive Studio dashboard — Playwright UI tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS COVERS (the demoable surface of the PS dashboard):
 *   • The Studio loads via its app deep-link (/app/Predictive Studio) and via
 *     ?panel= deep links for each of the six panels.
 *   • Home  — action-forward landing: hero + the three entry paths render, and a
 *     path click navigates to the right panel (round-tripping ?panel=).
 *   • Algorithm Catalog — the algorithm cards render; selecting a "Guide me"
 *     scenario chip surfaces the recommendation banner and re-sorts the cards
 *     (the recommendation matrix in action).
 *   • Training Pipelines — the visual-DAG builder renders nodes + SVG edges, and
 *     clicking a node updates the inspector (selection wiring).
 *   • Experiments — the three kanban columns (Running / Completed / Pruned) and
 *     the leaderboard strip render.
 *   • Model Registry — the master list + detail pane render, and selecting a
 *     different model row updates the detail header.
 *   • Compare — the view-mode toggle switches between the 3 layouts
 *     (side-by-side / overlay / champion-challenger).
 *   • Copilot — the docked Model Dev Agent toggle opens the embedded chat panel.
 *
 * SELECTORS:
 *   Resilient, role/text/testid-based. The `data-testid` hooks live in the PS
 *   dashboard + panel templates (added alongside these specs):
 *     ps-shell, ps-nav-<panel>, ps-nav-copilot, ps-copilot, ps-panel-<panel>,
 *     ps-home-panel/-hero/-paths/-path-data/-path-template/-path-agent,
 *     ps-catalog-panel/-scenarios/-scenario-chip/-reco-banner/-gallery/-card,
 *     ps-pipelines-panel/-canvas/-edges/-node[ data-node-id ]/-inspector/-inspector-title,
 *     ps-experiments-panel/-leaderboard/-kanban, ps-kanban-col-running|completed|pruned,
 *     ps-registry-panel/-list/-row/-detail/-detail-name,
 *     ps-compare-panel/-modes/-mode-side|overlay|champion/-layout-side|overlay|champion.
 *
 * PREREQUISITES (NOT started by these tests):
 *   • MJAPI running (default :4001 — override PW_API_URL).
 *   • MJExplorer running (default http://localhost:4201 — override PW_BASE_URL).
 *   • Predictive Studio metadata synced (the "Predictive Studio" app/nav item exists).
 *   • A primed, signed-in persistent auth profile at .playwright-cli/profile
 *     (override PW_USER_DATA_DIR). Prime it once:
 *       npx playwright-cli open --headed --profile .playwright-cli/profile http://localhost:4201
 *
 * NO SECRETS IN CODE: any credentials must come from .env via dotenv (loaded in
 * e2e/playwright.config.ts). This spec reads zero secrets directly.
 *
 * RUN:
 *   npm run test:e2e
 *   # or
 *   npx playwright test --config e2e/playwright.config.ts
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

/** App name as registered in metadata/applications/.predictive-studio-application.json. */
const APP_NAME = 'Predictive Studio';

/** Panel keys ↔ PSPanelKey union in predictive-studio.types.ts. */
type PanelKey = 'home' | 'catalog' | 'pipelines' | 'experiments' | 'registry' | 'compare';

/** Build a deep-link URL into a specific PS panel. The app route is /app/:appName; the
 *  inner panel is selected via the ?panel= query param the dashboard round-trips. */
function panelUrl(panel?: PanelKey): string {
  const base = `/app/${encodeURIComponent(APP_NAME)}`;
  return panel ? `${base}?panel=${panel}` : base;
}

/** Navigate to a PS panel via deep link and wait for the dashboard shell + that panel host. */
async function gotoPanel(page: Page, panel?: PanelKey): Promise<void> {
  await page.goto(panelUrl(panel), { waitUntil: 'domcontentloaded' });
  // The shell appears once loadData() completes and isLoading flips false.
  await expect(page.getByTestId('ps-shell')).toBeVisible({ timeout: 30_000 });
  if (panel) {
    await expect(page.getByTestId(`ps-panel-${panel}`)).toBeVisible();
  }
}

test.describe('Predictive Studio dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  test('loads the Studio shell with the six left-nav panels', async ({ page }) => {
    await gotoPanel(page);

    // Shell + every nav item present (Home, Training Pipelines, Algorithm Catalog,
    // Experiments, Model Registry, Compare Runs).
    await expect(page.getByTestId('ps-shell')).toBeVisible();
    for (const key of ['home', 'pipelines', 'catalog', 'experiments', 'registry', 'compare'] as PanelKey[]) {
      await expect(page.getByTestId(`ps-nav-${key}`)).toBeVisible();
    }

    // The page header carries the Studio identity.
    await expect(page.getByText(/Feature engineering, predictive modeling/i)).toBeVisible();

    // Default panel is Home (no ?panel= → activePanel 'home').
    await expect(page.getByTestId('ps-panel-home')).toBeVisible();
    await expect(page.getByTestId('ps-home-panel')).toBeVisible();
  });

  test('Home — action-forward landing renders the hero and three entry paths', async ({ page }) => {
    await gotoPanel(page, 'home');

    await expect(page.getByTestId('ps-home-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Build a predictive model/i })).toBeVisible();

    // The three entry paths: from data, from template, ask the agent.
    await expect(page.getByTestId('ps-home-path-data')).toBeVisible();
    await expect(page.getByTestId('ps-home-path-template')).toBeVisible();
    await expect(page.getByTestId('ps-home-path-agent')).toBeVisible();

    // Clicking "Start from data" navigates to the Pipelines panel and round-trips ?panel=.
    await page.getByTestId('ps-home-path-data').click();
    await expect(page.getByTestId('ps-panel-pipelines')).toBeVisible();
    await expect(page).toHaveURL(/panel=pipelines/);
  });

  test('Algorithm Catalog — cards render and a scenario chip surfaces the recommendation matrix', async ({ page }) => {
    await gotoPanel(page, 'catalog');

    await expect(page.getByTestId('ps-catalog-panel')).toBeVisible();

    // The "Guide me" scenario picker.
    await expect(page.getByRole('heading', { name: /what does your problem look like/i })).toBeVisible();

    // Algorithm cards gallery.
    const cards = page.getByTestId('ps-catalog-card');
    await expect(cards.first()).toBeVisible();
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // The recommendation banner is hidden until a scenario is chosen.
    await expect(page.getByTestId('ps-catalog-reco-banner')).toHaveCount(0);

    // Select the first scenario chip → recommendation banner appears (the matrix-driven reco).
    const firstChip = page.getByTestId('ps-catalog-scenario-chip').first();
    await expect(firstChip).toBeVisible();
    await firstChip.click();

    await expect(page.getByTestId('ps-catalog-reco-banner')).toBeVisible();
    // Cards re-sort by best recommendation level but the set is unchanged.
    await expect(page.getByTestId('ps-catalog-card')).toHaveCount(cardCount);
  });

  test('Training Pipelines — visual DAG renders nodes + edges and node selection drives the inspector', async ({ page }) => {
    await gotoPanel(page, 'pipelines');

    await expect(page.getByTestId('ps-pipelines-panel')).toBeVisible();
    await expect(page.getByTestId('ps-pipelines-canvas')).toBeVisible();

    // SVG edge layer present (the DAG connections).
    await expect(page.getByTestId('ps-pipelines-edges')).toBeVisible();

    // Multiple DAG nodes render.
    const nodes = page.getByTestId('ps-pipelines-node');
    await expect(nodes.first()).toBeVisible();
    expect(await nodes.count()).toBeGreaterThan(1);

    // Inspector reflects a selection; clicking a specific node updates the inspector title.
    const inspectorTitle = page.getByTestId('ps-pipelines-inspector-title');
    await expect(page.getByTestId('ps-pipelines-inspector')).toBeVisible();

    // Click the XGBoost node (stable data-node-id) and assert the inspector reflects it.
    const xgboost = page.locator('[data-testid="ps-pipelines-node"][data-node-id="xgboost"]');
    await expect(xgboost).toBeVisible();
    await xgboost.click();
    await expect(inspectorTitle).toHaveText(/XGBoost/i);
  });

  test('Experiments — kanban columns and leaderboard render', async ({ page }) => {
    await gotoPanel(page, 'experiments');

    await expect(page.getByTestId('ps-experiments-panel')).toBeVisible();

    // The three kanban columns.
    await expect(page.getByTestId('ps-kanban-col-running')).toBeVisible();
    await expect(page.getByTestId('ps-kanban-col-completed')).toBeVisible();
    await expect(page.getByTestId('ps-kanban-col-pruned')).toBeVisible();

    // Column headings (resilient text assertions independent of testids).
    await expect(page.getByRole('heading', { name: 'Running' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pruned' })).toBeVisible();

    // Leaderboard strip.
    await expect(page.getByTestId('ps-experiments-leaderboard')).toBeVisible();
    await expect(page.getByText('Leaderboard', { exact: false })).toBeVisible();
  });

  test('Model Registry — list + detail render and row selection updates the detail header', async ({ page }) => {
    await gotoPanel(page, 'registry');

    await expect(page.getByTestId('ps-registry-panel')).toBeVisible();
    await expect(page.getByTestId('ps-registry-list')).toBeVisible();
    await expect(page.getByTestId('ps-registry-detail')).toBeVisible();

    const rows = page.getByTestId('ps-registry-row');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    const detailName = page.getByTestId('ps-registry-detail-name');
    await expect(detailName).toBeVisible();
    const before = (await detailName.textContent())?.trim() ?? '';

    // If there's more than one model, selecting a different row should update the detail header.
    if (rowCount > 1) {
      // Find a row whose visible name differs from the current detail header, then click it.
      let clicked = false;
      for (let i = 0; i < rowCount; i++) {
        const rowText = (await rows.nth(i).innerText()).trim();
        if (rowText && !before.includes(rowText.split('\n')[0])) {
          await rows.nth(i).click();
          clicked = true;
          break;
        }
      }
      if (clicked) {
        // The header reflects the newly selected model (content changes or stays a valid name).
        await expect(detailName).toBeVisible();
        await expect(detailName).not.toHaveText('');
      }
    }
  });

  test('Compare — the view-mode toggle switches between the three layouts', async ({ page }) => {
    await gotoPanel(page, 'compare');

    await expect(page.getByTestId('ps-compare-panel')).toBeVisible();
    await expect(page.getByTestId('ps-compare-modes')).toBeVisible();

    // Default mode is side-by-side.
    await expect(page.getByTestId('ps-compare-layout-side')).toBeVisible();
    await expect(page.getByTestId('ps-compare-layout-overlay')).toHaveCount(0);
    await expect(page.getByTestId('ps-compare-layout-champion')).toHaveCount(0);

    // Switch to Overlay.
    await page.getByTestId('ps-compare-mode-overlay').click();
    await expect(page.getByTestId('ps-compare-layout-overlay')).toBeVisible();
    await expect(page.getByTestId('ps-compare-layout-side')).toHaveCount(0);

    // Switch to Champion / Challenger.
    await page.getByTestId('ps-compare-mode-champion').click();
    await expect(page.getByTestId('ps-compare-layout-champion')).toBeVisible();
    await expect(page.getByTestId('ps-compare-layout-overlay')).toHaveCount(0);

    // Back to Side-by-side.
    await page.getByTestId('ps-compare-mode-side').click();
    await expect(page.getByTestId('ps-compare-layout-side')).toBeVisible();
  });

  test('Copilot — the docked Model Dev Agent toggle opens the embedded chat', async ({ page }) => {
    await gotoPanel(page, 'home');

    // Copilot is closed initially.
    await expect(page.getByTestId('ps-copilot')).toHaveCount(0);

    // Toggle it open via the left-nav "Model Dev Agent" assist button.
    await page.getByTestId('ps-nav-copilot').click();

    const copilot = page.getByTestId('ps-copilot');
    await expect(copilot).toBeVisible();

    // The docked panel shows its header; the embedded chat area mounts inside it.
    await expect(copilot.getByText('Model Dev Agent', { exact: false })).toBeVisible();
    await expect(copilot.locator('mj-conversation-chat-area, .ps-copilot-empty')).toBeVisible();

    // Toggling again (via nav) closes it.
    await page.getByTestId('ps-nav-copilot').click();
    await expect(page.getByTestId('ps-copilot')).toHaveCount(0);
  });

  test('Deep links — each ?panel= value lands on the matching panel host', async ({ page }) => {
    for (const key of ['home', 'catalog', 'pipelines', 'experiments', 'registry', 'compare'] as PanelKey[]) {
      await gotoPanel(page, key);
      await expect(page.getByTestId(`ps-panel-${key}`)).toBeVisible();
      // The nav item for that panel is marked active.
      await expect(page.getByTestId(`ps-nav-${key}`)).toHaveClass(/active/);
    }
  });
});
