/**
 * Prime the persistent, signed-in browser profile that the e2e specs (and ad-hoc agent
 * debugging) reuse.
 *
 * The header of playwright.config.ts tells you to run `npx playwright-cli open --headed
 * --profile ...`. There is no such package -- npm answers "could not determine executable
 * to run". This script does the same job with the Playwright this repo actually depends on.
 *
 *   node e2e/prime-auth-profile.mjs
 *
 * It opens a REAL Chrome window against MJExplorer using a persistent profile directory.
 * Sign in normally, then close the window. Chrome flushes its cookies and MSAL token cache
 * into that directory on close, so later runs -- headless included -- start signed in.
 *
 * Drives system Chrome (`channel: 'chrome'`) deliberately: it needs no Playwright-managed
 * browser download, and it sidesteps the chrome-headless-s hell / truncated-install traps
 * documented in .mjdev-docs/TEST-PROTOCOL.md.
 *
 * The profile lives in .playwright-cli/profile, which is gitignored. Tokens last ~30 days.
 */
import { chromium } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.PW_USER_DATA_DIR ?? resolve(HERE, '..', '.playwright-cli', 'profile');
const BASE_URL = process.env.PW_BASE_URL ?? 'http://localhost:4201';

console.log(`Profile : ${PROFILE}`);
console.log(`Explorer: ${BASE_URL}\n`);

const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--start-maximized'],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│  Sign in to MJExplorer in the window that just opened.     │');
console.log('│  When you are looking at the app, CLOSE THE WINDOW.        │');
console.log('│  This script exits on its own once you do.                 │');
console.log('└────────────────────────────────────────────────────────────┘');

// Resolve when the user closes the browser -- that is the flush point.
await new Promise((done) => context.on('close', done));
console.log('\nProfile saved. Re-run any time to refresh an expired sign-in.');
process.exit(0);
