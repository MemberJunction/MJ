// Diagnostic: dump the client-tool manifest the AI agent ACTUALLY receives on a given
// surface, vs. the tools the surface registered. A mismatch (registered but not in the
// manifest) means the agent can't call them — exactly the bug this caught:
//   AppContextSnapshot.Capabilities.Tools was rebuilt with globals-only, dropping the
//   dashboard's SetAgentClientTools registrations.
//
// Usage:  node e2e/overlay/probe-agent-tools.mjs [appPath]
//   appPath defaults to /app/data-explorer/Data
//   requires a primed profile (e2e/overlay/prime-auth.mjs) + MJExplorer running.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PROFILE = path.join(ROOT, '.playwright-cli', 'profile');
const BASE_URL = process.env.MJ_EXPLORER_URL ?? 'http://localhost:4201';
const appPath = process.argv[2] ?? '/app/data-explorer/Data';

const GLOBALS = ['NavigateToRecord', 'NavigateToApp', 'Sleep', 'CopyToClipboard', 'ShowNotification', 'OpenBrowserTab', 'SetTheme'];

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 1000 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(30000);
try {
  await page.goto(BASE_URL + appPath, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  // Read explorer-app's AppContextSnapshot via Angular dev-mode debug API (window.ng).
  const probe = await page.evaluate(() => {
    const ng = window.ng;
    if (!ng || !ng.getComponent) return { err: 'window.ng.getComponent unavailable (prod build?)' };
    const stack = [document.body]; let found = null, scanned = 0;
    while (stack.length && scanned < 4000) {
      const n = stack.shift(); scanned++;
      try { const c = ng.getComponent(n); if (c && ('AppContextSnapshot' in c)) { found = c; break; } } catch { /* not a component */ }
      for (const ch of n.children) stack.push(ch);
    }
    if (!found) return { err: 'no component exposing AppContextSnapshot found' };
    const snap = found.AppContextSnapshot;
    return {
      app: snap?.App?.Name ?? null,
      manifest: snap?.Capabilities?.Tools?.map(t => t.Name) ?? [],
      registered: found.activeDashboardToolNames ?? [],
    };
  });
  if (probe.err) { console.log('PROBE ERROR:', probe.err); }
  else {
    const surfaceInManifest = probe.manifest.filter(n => !GLOBALS.includes(n));
    const missing = probe.registered.filter(n => !probe.manifest.includes(n));
    console.log(`app:        ${probe.app}`);
    console.log(`manifest (sent to agent): ${JSON.stringify(probe.manifest)}`);
    console.log(`surface registered:       ${JSON.stringify(probe.registered)}`);
    console.log(`surface tools in manifest: ${JSON.stringify(surfaceInManifest)}`);
    console.log(missing.length === 0
      ? 'OK — every registered surface tool reaches the agent.'
      : `BUG — registered but NOT delivered to the agent: ${JSON.stringify(missing)}`);
  }
} finally {
  await ctx.close();
}
