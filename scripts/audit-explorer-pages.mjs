// MJ Explorer page-audit driver
//
// Walks every nav-item route in the metadata applications, takes:
//   - landing screenshot
//   - first-row drill-down screenshot (if a grid/list/card is present)
//   - filters-open screenshot (if a "Show Filters" toggle is present)
// Plus captures per-page structural.json with header class, button styles, filter pattern.
//
// Run from repo root: node scripts/audit-explorer-pages.mjs

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const storageStatePath = '/tmp/mj-audit-storage-state.json';
const outDir = join(repoRoot, 'plans', 'explorer-page-audit');

const ROUTES = [
  // app-slug, app-name, nav-label (URL path), nav-icon (just for the manifest)
  { app: 'home', appName: 'Home', items: [
    { label: 'Home', icon: 'fa-home' },
  ]},
  { app: 'chat', appName: 'Chat', items: [
    { label: 'Conversations', icon: 'fa-comments' },
    { label: 'Collections',   icon: 'fa-folder-open' },
    { label: 'Tasks',         icon: 'fa-tasks' },
  ]},
  { app: 'data-explorer', appName: 'Data Explorer', items: [
    { label: 'Data',       icon: 'fa-table-cells' },
    { label: 'Queries',    icon: 'fa-database' },
    { label: 'Dashboards', icon: 'fa-gauge-high' },
  ]},
  { app: 'lists', appName: 'Lists', items: [
    { label: 'Lists',      icon: 'fa-list-check' },
    { label: 'Operations', icon: 'fa-diagram-project' },
    { label: 'Categories', icon: 'fa-tags' },
  ]},
  { app: 'admin', appName: 'Admin', items: [
    { label: 'Identity & Access', icon: 'fa-shield-halved' },
    { label: 'Data & Schema',     icon: 'fa-database' },
    { label: 'Monitoring',        icon: 'fa-stethoscope' },
    { label: 'Developer Tools',   icon: 'fa-screwdriver-wrench' },
  ]},
  { app: 'actions', appName: 'Actions', items: [
    { label: 'Overview', icon: 'fa-bolt' },
    { label: 'Explorer', icon: 'fa-folder-tree' },
    { label: 'Monitor',  icon: 'fa-chart-line' },
  ]},
  { app: 'ai', appName: 'AI', items: [
    { label: 'Overview',       icon: 'fa-grid-2' },
    { label: 'Agents',         icon: 'fa-robot' },
    { label: 'Agent Requests', icon: 'fa-inbox' },
    { label: 'Prompts',        icon: 'fa-comment-dots' },
    { label: 'Models',         icon: 'fa-microchip' },
    { label: 'MCP',            icon: 'fa-plug-circle-bolt' },
    { label: 'Analytics',      icon: 'fa-chart-line' },
    { label: 'Configuration',  icon: 'fa-cogs' },
  ]},
  { app: 'scheduling', appName: 'Scheduling', items: [
    { label: 'Dashboard', icon: 'fa-gauge-high' },
    { label: 'Jobs',      icon: 'fa-calendar-check' },
    { label: 'Activity',  icon: 'fa-clock-rotate-left' },
  ]},
  { app: 'communication', appName: 'Communication', items: [
    { label: 'Monitor',   icon: 'fa-chart-line' },
    { label: 'Logs',      icon: 'fa-list-ul' },
    { label: 'Providers', icon: 'fa-server' },
    { label: 'Templates', icon: 'fa-file-lines' },
    { label: 'Runs',      icon: 'fa-play-circle' },
  ]},
  { app: 'testing', appName: 'Testing', items: [
    { label: 'Overview',  icon: 'fa-gauge-high' },
    { label: 'Explorer',  icon: 'fa-compass' },
    { label: 'Runs',      icon: 'fa-play-circle' },
    { label: 'Analytics', icon: 'fa-chart-bar' },
    { label: 'Review',    icon: 'fa-clipboard-check' },
  ]},
  { app: 'credentials', appName: 'Credentials', items: [
    { label: 'Overview',    icon: 'fa-chart-pie' },
    { label: 'Credentials', icon: 'fa-key' },
    { label: 'Types',       icon: 'fa-shapes' },
    { label: 'Categories',  icon: 'fa-folder-tree' },
    { label: 'Audit Log',   icon: 'fa-clipboard-list' },
  ]},
  { app: 'integrations', appName: 'Integrations', items: [
    { label: 'Overview',     icon: 'fa-gauge-high' },
    { label: 'Integrations', icon: 'fa-plug' },
    { label: 'Activity',     icon: 'fa-clock-rotate-left' },
    { label: 'Schedules',    icon: 'fa-calendar-check' },
  ]},
  { app: 'file-browser', appName: 'File Browser', items: [
    { label: 'Browse Files', icon: 'fa-folder-open' },
  ]},
  { app: 'knowledge-hub', appName: 'Knowledge Hub', items: [
    { label: 'Classify',       icon: 'fa-tags' },
    { label: 'Tags',           icon: 'fa-sitemap' },
    { label: 'Clusters',       icon: 'fa-circle-nodes' },
    { label: 'Duplicates',     icon: 'fa-clone' },
    { label: 'Analytics',      icon: 'fa-chart-line' },
    { label: 'Vectors',        icon: 'fa-cubes' },
    { label: 'Configuration',  icon: 'fa-cogs' },
  ]},
  { app: 'version-history', appName: 'Version History', items: [
    { label: 'Labels',           icon: 'fa-tags' },
    { label: 'Diff Viewer',      icon: 'fa-code-compare' },
    { label: 'Restore History',  icon: 'fa-clock-rotate-left' },
    { label: 'Dependency Graph', icon: 'fa-diagram-project' },
  ]},
  { app: 'archiving', appName: 'Archiving', items: [
    { label: 'Configuration', icon: 'fa-sliders' },
    { label: 'Run History',   icon: 'fa-clock-rotate-left' },
  ]},
  { app: 'permissions', appName: 'Permissions', items: [
    { label: 'User Access',     icon: 'fa-user' },
    { label: 'Resource Access', icon: 'fa-cube' },
    { label: 'Audit Log',       icon: 'fa-clock-rotate-left' },
  ]},
  { app: 'component-studio', appName: 'Component Studio', items: [
    { label: '_root', icon: 'fa-puzzle-piece' }, // no nav items — load app root
  ]},
];

const VIEWPORT = { width: 1440, height: 900 };
const NAV_TIMEOUT = 15000;
const SETTLE_MS = 1200;

function safeFilename(s) {
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

function buildUrl(app, label) {
  if (label === '_root') return `http://localhost:4201/app/${app}`;
  return `http://localhost:4201/app/${app}/${encodeURIComponent(label)}`;
}

async function captureStructural(page) {
  return page.evaluate(() => {
    const find = (sel) => document.querySelector(sel);
    const hasClass = (sel) => !!find(sel);
    const header =
      find('mj-page-header') ||
      find('.dashboard-header') ||
      find('.requests-header') ||
      find('.studio-toolbar') ||
      find('.viewer-toolbar') ||
      find('.content-header') ||
      find('header');
    const headerTag = header?.tagName ?? null;
    const headerClass = header?.className ?? null;
    return {
      url: location.pathname,
      title: document.title,
      timestamp: new Date().toISOString(),
      headerTag,
      headerClass,
      hasMjPageHeader: hasClass('mj-page-header'),
      hasMjPageLayout: hasClass('mj-page-layout'),
      hasMjFilterPopover: hasClass('mj-filter-popover'),
      hasMjFilterToggle: hasClass('mj-filter-toggle'),
      hasMjResultCount: hasClass('mj-result-count'),
      hasAsSplit: hasClass('as-split'),
      hasAsSplitArea: hasClass('as-split-area'),
      hasFilterPanelClass: hasClass('.filter-panel'),
      hasFilterToggleBtn: hasClass('.filter-toggle-btn'),
      hasItemCount: hasClass('.item-count'),
      hasViewToggle: hasClass('.view-toggle'),
      hasTabNav: hasClass('.tab-nav'),
      hasAgGrid: hasClass('ag-grid-angular') || hasClass('.ag-root'),
      hasKendoGrid: hasClass('kendo-grid'),
      mjButtonCount: document.querySelectorAll('[mjbutton], button[mjbutton], .mj-btn').length,
      buttonCountTotal: document.querySelectorAll('button').length,
      bodyClass: document.body.className,
    };
  });
}

async function waitForLoad(page, expectedPath) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT });
  } catch {}
  // Wait for the URL to actually land on the expected path — the explorer
  // sometimes redirects deep links through "/" during cold-session bootstrap.
  if (expectedPath) {
    for (let i = 0; i < 30; i++) {
      const pathname = new URL(page.url()).pathname;
      if (pathname === expectedPath || pathname.startsWith(expectedPath)) break;
      await page.waitForTimeout(300);
      // If we bounced to "/", try the deep link again
      if (i === 10 && pathname === '/') {
        try { await page.goto('http://localhost:4201' + expectedPath, { waitUntil: 'domcontentloaded', timeout: 8000 }); } catch {}
      }
    }
  }
  await page.waitForTimeout(SETTLE_MS);
  // Try to also wait for the resource-loading spinner to clear
  try {
    await page.waitForFunction(
      () => !document.querySelector('.app-loading-screen[style*="display: block"]') &&
            !document.querySelector('mj-loading'),
      { timeout: 4000 }
    );
  } catch {}
}

async function captureLanding(page, appDir, name) {
  const filePath = join(appDir, `${name}--landing.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function tryClickFirstRow(page) {
  // Broad strategy: try AG Grid → cards/tiles → record links → table rows → click handlers
  // Each candidate is a Playwright locator string. We try each, prefer the first visible one.
  const candidates = [
    // AG Grid (used widely across MJ dashboards)
    '.ag-center-cols-container .ag-row[row-index="0"]',
    '.ag-center-cols-container .ag-row:nth-of-type(1)',
    '[role="row"][row-index="0"]',
    // Cards / tiles (any first card-shaped element with click)
    '.cards-grid > *:first-child',
    '.nav-card:first-child',
    '.agent-card:first-of-type',
    '.prompt-card:first-of-type',
    '.model-card:first-of-type',
    '.request-card:first-of-type',
    '.server-card:first-of-type',
    '.config-card:first-of-type',
    '.item-card:first-of-type',
    '.list-card:first-of-type',
    '.dashboard-card:first-of-type',
    '.tile:first-of-type',
    // Record links (universal pattern in MJ)
    'a[href*="/record/"]',
    // Generic table rows
    'table tbody tr:first-child',
    'kendo-grid tr:first-child',
    // Generic list items with click handlers
    '[role="listitem"]:first-of-type',
    '.list-item:first-of-type',
    // Items in nav-style lists (some Knowledge Hub patterns)
    '.classifier-card:first-of-type',
    '.tag-row:first-of-type',
    '.cluster-card:first-of-type',
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() === 0) continue;
      if (!(await loc.isVisible({ timeout: 500 }).catch(() => false))) continue;
      await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await loc.click({ timeout: 2000 });
      return sel;
    } catch {}
  }
  return null;
}

async function tryToggleFilters(page) {
  // Strategy: 1) named components 2) legacy classes 3) text-based fallback
  const namedAndClass = [
    'mj-filter-toggle button',
    'mj-filter-toggle',
    'mj-filter-popover .mj-filter-popover-trigger',
    'mj-filter-popover button',
    '.filter-toggle-btn',
    '.filter-toggle',
    '[aria-label*="filter" i]',
  ];
  for (const sel of namedAndClass) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() === 0) continue;
      if (!(await loc.isVisible({ timeout: 500 }).catch(() => false))) continue;
      await loc.click({ timeout: 2000 });
      return sel;
    } catch {}
  }
  // Text-based: find a button whose text mentions filter
  try {
    const btn = page.getByRole('button', { name: /filter/i }).first();
    if (await btn.count() > 0 && await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ timeout: 2000 });
      return 'getByRole(button,filter)';
    }
  } catch {}
  return null;
}

async function captureRoute(context, app, item) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  const url = buildUrl(app.app, item.label);
  const appDir = join(outDir, app.app);
  if (!existsSync(appDir)) mkdirSync(appDir, { recursive: true });
  const baseName = safeFilename(item.label);

  const summary = {
    app: app.app,
    appName: app.appName,
    label: item.label,
    icon: item.icon,
    url,
    landing: null,
    detail: null,
    filters: null,
    structural: null,
    error: null,
  };

  try {
    const expectedPath = new URL(url).pathname;
    await page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
    await waitForLoad(page, expectedPath);
    // Validate we actually landed on the page (not bounced to "/")
    const actualPath = new URL(page.url()).pathname;
    summary.actualPath = actualPath;
    summary.landing = `${app.app}/${baseName}--landing.png`;
    await captureLanding(page, appDir, baseName);
    summary.structural = await captureStructural(page);

    // Detail drill-down
    const clickedSel = await tryClickFirstRow(page);
    if (clickedSel) {
      await page.waitForTimeout(SETTLE_MS);
      const detailPath = join(appDir, `${baseName}--detail.png`);
      await page.screenshot({ path: detailPath, fullPage: true });
      summary.detail = `${app.app}/${baseName}--detail.png`;
      summary.detailTrigger = clickedSel;
      // Navigate back so filter toggle (next step) finds the original page
      try { await page.goBack({ timeout: 4000 }); await waitForLoad(page, expectedPath); } catch {}
    }

    // Filters open
    const filterSel = await tryToggleFilters(page);
    if (filterSel) {
      await page.waitForTimeout(SETTLE_MS);
      const filtersPath = join(appDir, `${baseName}--filters.png`);
      await page.screenshot({ path: filtersPath, fullPage: true });
      summary.filters = `${app.app}/${baseName}--filters.png`;
      summary.filterTrigger = filterSel;
    }
  } catch (err) {
    summary.error = String(err?.message ?? err);
    console.error(`  ✗ ${url}: ${summary.error}`);
  } finally {
    await page.close();
  }
  return summary;
}

async function main() {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(storageStatePath)) {
    console.error(`Missing storage state file: ${storageStatePath}`);
    console.error('Run: npx playwright-cli open --profile .playwright-cli/profile, log in, then export storage state.');
    process.exit(1);
  }
  console.log(`Storage state: ${storageStatePath}`);
  console.log(`Output: ${outDir}`);
  // Use storage state from a separately authenticated playwright-cli session to avoid
  // profile-lock conflicts. Headless OK here because auth state is fully captured.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: storageStatePath,
  });

  // Warm-up: visit root to let the explorer bootstrap (auth, app initialization).
  // Deep-link routes can bounce to "/" on cold session — warming up first avoids that.
  const warmup = await context.newPage();
  await warmup.setViewportSize(VIEWPORT);
  try {
    await warmup.goto('http://localhost:4201/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await warmup.waitForTimeout(3000);
  } catch {}
  await warmup.close();

  const manifest = [];
  let total = 0;
  for (const app of ROUTES) total += app.items.length;
  let done = 0;

  for (const app of ROUTES) {
    console.log(`\n[${app.appName}]`);
    for (const item of app.items) {
      done += 1;
      process.stdout.write(`  (${done}/${total}) ${item.label} ... `);
      const summary = await captureRoute(context, app, item);
      manifest.push(summary);
      const flags = [
        summary.landing ? 'L' : '·',
        summary.detail  ? 'D' : '·',
        summary.filters ? 'F' : '·',
      ].join('');
      console.log(`[${flags}]${summary.error ? ' ERR' : ''}`);
    }
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Manifest: ${join(outDir, 'manifest.json')}`);
  await context.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
