// Reusable MJExplorer chat-overlay test driver.
//
// Drives the floating "AI Assistant" overlay against a SIGNED-IN persistent profile
// (the same `.playwright-cli/profile` the e2e fixtures use — prime it once with
// `node e2e/overlay/prime-auth.mjs`). Text mode exercises the SAME client-tool
// infrastructure as the voice co-agent, so this validates the agent's app control.
//
// Import the harness:   import { withOverlay } from './driver.mjs'
// Or run the smoke test: node e2e/overlay/driver.mjs smoke
//
// Env:
//   MJ_EXPLORER_URL   base URL (default http://localhost:4201)
//   PW_HEADED=1       run headed (default headless)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));        // e2e/overlay
const ROOT = path.resolve(HERE, '..', '..');                     // repo root
const PROFILE = process.env.PW_PROFILE_DIR ?? path.join(ROOT, '.playwright-cli', 'profile');   // shared with e2e/fixtures.ts
const SHOTS = path.join(ROOT, '.playwright-cli', 'shots');       // gitignored
const BASE_URL = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
const HEADED = process.env.PW_HEADED === '1';
const INPUT = '.mention-editor[contenteditable], .mention-editor';

fs.mkdirSync(SHOTS, { recursive: true });

/**
 * Launch the signed-in overlay and hand a small driver API to `fn`.
 * The driver API: goto(appPath), openOverlay(), send(prompt[, waitMs]), convo(),
 * lastSage(), appText(), curUrl(), shot(name), plus `page` and `logs`.
 */
export async function withOverlay(fn) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: !HEADED,
    viewport: { width: 1440, height: 1000 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(30000);
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/tool|client|agent|navigate|context|invoke|error|fail/i.test(t)) logs.push(`[${m.type()}] ${t}`.slice(0, 260));
  });
  const api = {
    page, logs,
    shot: (n) => page.screenshot({ path: path.join(SHOTS, n) }).catch(() => {}),
    async goto(appPath) { await page.goto(BASE_URL + appPath, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000); },
    async openOverlay() {
      if (await page.locator(INPUT).count() > 0 && await page.locator(INPUT).first().isVisible().catch(() => false)) return true;
      const icon = page.locator('.chat-overlay-bubble-icon, .chat-overlay-bubble').first();
      if (await icon.count() > 0) { await icon.click({ position: { x: 10, y: 10 } }).catch(() => {}); await page.waitForTimeout(2500); }
      return (await page.locator(INPUT).count()) > 0;
    },
    async send(prompt, waitMs = 28000) {
      const input = page.locator(INPUT).first();
      await input.click(); await page.waitForTimeout(200);
      await page.keyboard.type(prompt, { delay: 8 }); await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(waitMs);
    },
    async convo() { return (await page.locator('mj-chat-agents-overlay').first().innerText().catch(() => '')).replace(/\n{2,}/g, '\n'); },
    async lastSage() {
      const t = (await page.locator('mj-chat-agents-overlay').first().innerText().catch(() => ''));
      const parts = t.split(/\bSage\b/g);
      const last = parts[parts.length - 1] || '';
      return last.replace(/\d{1,2}\/\d{1,2}\/\d{2},?\s*\d{1,2}:\d{2}\s*(AM|PM)?|\d:\d\d|Rate response/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 500);
    },
    async appText() { return (await page.locator('mj-tab-container, .tab-content, app-root').first().innerText().catch(() => '')).slice(0, 600).replace(/\n{2,}/g, '\n'); },
    async curUrl() { return page.url(); },
  };
  try { await fn(api); } catch (e) { console.error('DRIVER_ERR', e.message); await api.shot('driver-error.png'); }
  finally { await ctx.close(); }
}

// ---- smoke runner: node e2e/overlay/driver.mjs smoke ----
if (process.argv[2] === 'smoke') {
  await withOverlay(async (d) => {
    await d.goto('/app/home/Home');
    const ok = await d.openOverlay();
    console.log('overlay opened:', ok);
    await d.shot('smoke-overlay.png');
    if (ok) {
      await d.send('What am I looking at right now? Briefly describe this screen and what you can help me do here.');
      await d.shot('smoke-response.png');
      console.log('SAGE:\n' + (await d.lastSage()));
    }
  });
}
