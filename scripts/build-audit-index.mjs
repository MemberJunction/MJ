// Generate plans/explorer-page-audit/index.html from manifest.json
// Embedded CSS+JS, no external dependencies. Relative image paths.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const auditDir = join(repoRoot, 'plans', 'explorer-page-audit');
const manifest = JSON.parse(readFileSync(join(auditDir, 'manifest.json'), 'utf8'));

// Group by app
const apps = new Map();
for (const entry of manifest) {
  if (!apps.has(entry.app)) apps.set(entry.app, { name: entry.appName, items: [] });
  apps.get(entry.app).items.push(entry);
}

const appsArr = Array.from(apps.entries()).map(([slug, v]) => ({ slug, ...v }));

const structuralFlags = [
  { key: 'hasMjPageLayout',     short: 'layout',   tip: 'Uses <mj-page-layout> outer shell' },
  { key: 'hasMjPageHeader',     short: 'header',   tip: 'Uses <mj-page-header>' },
  { key: 'hasMjFilterToggle',   short: 'fToggle',  tip: 'Uses <mj-filter-toggle>' },
  { key: 'hasMjResultCount',    short: 'count',    tip: 'Uses <mj-result-count>' },
  { key: 'hasMjFilterPopover',  short: 'popover',  tip: 'Uses <mj-filter-popover>' },
  { key: 'hasAsSplit',          short: 'split',    tip: 'Uses as-split (resizable layout)' },
  { key: 'hasFilterPanelClass', short: 'fPanel',   tip: 'Legacy .filter-panel class present' },
  { key: 'hasFilterToggleBtn',  short: 'fBtn',     tip: 'Legacy .filter-toggle-btn class present' },
  { key: 'hasItemCount',        short: 'iCount',   tip: 'Legacy .item-count class present' },
  { key: 'hasViewToggle',       short: 'vToggle',  tip: 'Has .view-toggle (grid/list switcher)' },
  { key: 'hasTabNav',           short: 'tabs',     tip: 'Has .tab-nav (in-page tabs)' },
  { key: 'hasAgGrid',           short: 'agGrid',   tip: 'Uses AG Grid' },
  { key: 'hasKendoGrid',        short: 'kendo',    tip: 'Uses Kendo Grid' },
];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MJ Explorer · Page Audit</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>
    :root {
      --bg: #0f172a;
      --bg-card: #1e293b;
      --bg-elevated: #334155;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent: #5cc0ed;
      --border: #334155;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
    }
    header.top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 24px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    h1 { font-size: 18px; font-weight: 700; margin: 0; }
    h1 small { font-weight: 400; color: var(--text-muted); margin-left: 12px; }
    .toolbar { display: flex; gap: 8px; align-items: center; }
    .btn {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
    }
    .btn.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
    input.search {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font: inherit;
      width: 200px;
    }
    main { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 53px); }
    nav.sidebar {
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      padding: 16px 0;
      overflow-y: auto;
      max-height: calc(100vh - 53px);
      position: sticky;
      top: 53px;
    }
    .nav-section { padding: 8px 16px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.06em; }
    .nav-app {
      padding: 8px 16px;
      cursor: pointer;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.12s;
    }
    .nav-app:hover { background: var(--bg-elevated); }
    .nav-app.active { background: var(--accent); color: var(--bg); }
    .nav-app .count { font-size: 11px; color: var(--text-muted); }
    .nav-app.active .count { color: var(--bg); opacity: 0.7; }
    .nav-items { padding: 0; }
    .nav-item {
      padding: 6px 16px 6px 32px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-muted);
      transition: background 0.12s;
    }
    .nav-item:hover { background: var(--bg-elevated); color: var(--text); }
    .nav-item.active { background: var(--accent); color: var(--bg); }

    section.content { padding: 24px; overflow-y: auto; }
    .group { margin-bottom: 32px; }
    .group h2 {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin: 0 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .group h2 .group-count { font-size: 12px; color: var(--text-dim); font-weight: 500; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.15s, transform 0.15s;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .card .thumb { position: relative; aspect-ratio: 16/10; background: #000; overflow: hidden; }
    .card .thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; cursor: zoom-in; }
    .card .body { padding: 12px 14px; }
    .card .title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
    .card .subtitle { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
    .card .flags { display: flex; flex-wrap: wrap; gap: 4px; }
    .flag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--text-muted);
      cursor: help;
      border: 1px solid var(--border);
    }
    .flag.on { background: rgba(16, 185, 129, 0.15); color: var(--green); border-color: rgba(16, 185, 129, 0.3); }
    .flag.legacy { background: rgba(245, 158, 11, 0.15); color: var(--amber); border-color: rgba(245, 158, 11, 0.3); }
    .flag.error { background: rgba(239, 68, 68, 0.15); color: var(--red); border-color: rgba(239, 68, 68, 0.3); }

    /* Lightbox */
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.92);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      cursor: zoom-out;
    }
    .lightbox.open { display: flex; }
    .lightbox img { max-width: 95vw; max-height: 95vh; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }

    /* Layout tightening at narrow */
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      nav.sidebar { position: static; max-height: none; }
    }
  </style>
</head>
<body>
  <header class="top">
    <h1>MJ Explorer · Page Audit <small>${manifest.length} pages across ${appsArr.length} apps</small></h1>
    <div class="toolbar">
      <input class="search" id="search" placeholder="Filter pages..." />
      <button class="btn active" id="show-all">All apps</button>
    </div>
  </header>

  <main>
    <nav class="sidebar" id="sidebar">
      <div class="nav-section">Apps</div>
      ${appsArr.map(app => `
        <div class="nav-app" data-app="${app.slug}">
          <span>${escapeHtml(app.name)}</span>
          <span class="count">${app.items.length}</span>
        </div>
        <div class="nav-items">
          ${app.items.map(item => `
            <div class="nav-item" data-app="${app.slug}" data-item="${escapeHtml(item.label)}">
              ${escapeHtml(item.label)}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </nav>

    <section class="content" id="content">
      ${appsArr.map(app => `
        <div class="group" data-app="${app.slug}">
          <h2>
            ${escapeHtml(app.name)}
            <span class="group-count">${app.items.length} pages</span>
          </h2>
          <div class="grid">
            ${app.items.map(item => renderCard(item)).join('')}
          </div>
        </div>
      `).join('')}
    </section>
  </main>

  <div class="lightbox" id="lightbox" onclick="this.classList.remove('open')">
    <img id="lightbox-img" alt="" />
  </div>

  <script>
    const FLAGS = ${JSON.stringify(structuralFlags)};

    function renderFlag(key, on, isLegacy) {
      const def = FLAGS.find(f => f.key === key);
      if (!def) return '';
      const cls = on ? (isLegacy ? 'legacy' : 'on') : '';
      return \`<span class="flag \${cls}" title="\${def.tip}">\${def.short}</span>\`;
    }
    // (rendering done server-side)

    // Sidebar filtering
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('content');
    const showAllBtn = document.getElementById('show-all');
    const searchInput = document.getElementById('search');

    function setActiveNav(target) {
      document.querySelectorAll('.nav-app, .nav-item').forEach(n => n.classList.remove('active'));
      if (target) target.classList.add('active');
    }
    function showOnlyApp(appSlug) {
      document.querySelectorAll('#content .group').forEach(g => {
        g.style.display = (!appSlug || g.dataset.app === appSlug) ? '' : 'none';
      });
    }
    function showOnlyItem(appSlug, label) {
      document.querySelectorAll('#content .group').forEach(g => {
        g.style.display = (g.dataset.app === appSlug) ? '' : 'none';
      });
      document.querySelectorAll('.card').forEach(c => {
        const cardApp = c.dataset.app;
        const cardLabel = c.dataset.label;
        c.style.display = (cardApp === appSlug && cardLabel === label) ? '' : 'none';
      });
    }
    function resetVisibility() {
      document.querySelectorAll('#content .group, .card').forEach(el => el.style.display = '');
    }
    showAllBtn.addEventListener('click', () => {
      showAllBtn.classList.add('active');
      setActiveNav(null);
      resetVisibility();
    });
    sidebar.addEventListener('click', (e) => {
      const appEl = e.target.closest('.nav-app');
      const itemEl = e.target.closest('.nav-item');
      showAllBtn.classList.remove('active');
      if (itemEl) {
        setActiveNav(itemEl);
        showOnlyItem(itemEl.dataset.app, itemEl.dataset.item);
      } else if (appEl) {
        setActiveNav(appEl);
        resetVisibility();
        showOnlyApp(appEl.dataset.app);
      }
    });
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) { resetVisibility(); return; }
      document.querySelectorAll('.card').forEach(c => {
        const hay = (c.dataset.label + ' ' + c.dataset.app).toLowerCase();
        c.style.display = hay.includes(q) ? '' : 'none';
      });
      document.querySelectorAll('.group').forEach(g => {
        const visible = g.querySelectorAll('.card:not([style*="display: none"])');
        g.style.display = visible.length > 0 ? '' : 'none';
      });
    });

    // Lightbox
    const lightbox = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    document.querySelectorAll('.thumb img').forEach(img => {
      img.addEventListener('click', () => {
        lbImg.src = img.src;
        lightbox.classList.add('open');
      });
    });
  </script>
</body>
</html>
`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderCard(entry) {
  const s = entry.structural ?? {};
  // Treat these as "modern" (good — using shared components)
  const modern = ['hasMjPageLayout', 'hasMjPageHeader', 'hasMjFilterToggle', 'hasMjResultCount', 'hasMjFilterPopover'];
  // These are "legacy" — should be migrated
  const legacy = ['hasFilterPanelClass', 'hasFilterToggleBtn', 'hasItemCount', 'hasKendoGrid'];
  // Neutral structural facts
  const neutral = ['hasAsSplit', 'hasViewToggle', 'hasTabNav', 'hasAgGrid'];

  const flagsHtml = [...modern, ...neutral, ...legacy].map(key => {
    const on = !!s[key];
    if (!on) return '';
    const isLegacy = legacy.includes(key);
    const def = structuralFlags.find(f => f.key === key);
    if (!def) return '';
    const cls = isLegacy ? 'legacy' : 'on';
    return `<span class="flag ${cls}" title="${escapeHtml(def.tip)}">${escapeHtml(def.short)}</span>`;
  }).filter(Boolean).join('');

  const errorHtml = entry.error ? `<span class="flag error" title="${escapeHtml(entry.error)}">error</span>` : '';

  const imgPath = entry.landing ?? '';
  const thumb = imgPath
    ? `<img src="${escapeHtml(imgPath)}" alt="${escapeHtml(entry.label)} screenshot" loading="lazy" />`
    : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">No screenshot</div>`;

  return `
    <div class="card" data-app="${escapeHtml(entry.app)}" data-label="${escapeHtml(entry.label)}">
      <div class="thumb">${thumb}</div>
      <div class="body">
        <div class="title">${escapeHtml(entry.label)}</div>
        <div class="subtitle">${escapeHtml(entry.appName)} · <code>${escapeHtml(entry.url)}</code></div>
        <div class="flags">${flagsHtml}${errorHtml}</div>
      </div>
    </div>
  `;
}

writeFileSync(join(auditDir, 'index.html'), html);
console.log(`Wrote ${join(auditDir, 'index.html')}`);
