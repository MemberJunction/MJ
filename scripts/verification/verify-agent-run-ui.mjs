/**
 * Playwright verification of the agent-run surfaces — timeline, visualization, analytics.
 *
 * Captures screenshots of a real run so the shared-run-tree work can be checked visually rather
 * than only through the projections' unit tests.
 *
 * AUTH. Explorer uses Auth0, and this drives a headless browser against the persistent profile
 * under `.playwright-cli/profile`. That profile's token EXPIRES, and an expired one cannot be
 * refreshed without a person: the run stops at "Loading workspace..." and the console shows
 * `JWT_EXPIRED`. Log in once in a headed browser with the same profile and this runs unattended
 * afterwards:
 *
 *     npx playwright-cli open --headed --profile .playwright-cli/profile http://localhost:4201
 *
 * USAGE
 *     node scripts/verification/verify-agent-run-ui.mjs <agentRunID>
 *     PW_HEADED=1 PW_WAIT=45000 node scripts/verification/verify-agent-run-ui.mjs <agentRunID>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.PW_OUT ?? 'pw-shots';
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(process.env.PW_PROFILE ?? '.playwright-cli/profile', {
    headless: process.env.PW_HEADED !== '1',
    viewport: { width: 1600, height: 1000 },
    args: ['--no-first-run', '--no-default-browser-check'],
});

const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const runID = process.argv[2];
const url = `http://localhost:4201/resource/record/${encodeURIComponent("MJ: AI Agent Runs")}/${runID}`;
console.log('navigating:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

// The shell shows a loading animation until the first resource reports in.
await page.waitForTimeout(Number(process.env.PW_WAIT ?? 20000));
await page.screenshot({ path: `${OUT}/01-run-form.png`, fullPage: false });
console.log('title:', await page.title());
console.log('body has timeline text:', (await page.content()).includes('Task Graph'));

// Expand the task-graph step so the workflow's own steps render as rows.
const tgStep = page.locator('text=Task Graph').first();
if (await tgStep.count()) {
    await tgStep.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/02-timeline-expanded.png` });
    console.log('expanded the task-graph step');
}

for (const tab of ['Visualization', 'Analytics']) {
    const t = page.locator(`button:has-text("${tab}"), .tab:has-text("${tab}")`).first();
    if (await t.count()) {
        await t.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(8000);
        await page.screenshot({ path: `${OUT}/${tab.toLowerCase()}.png` });
        console.log('captured', tab);
    } else {
        console.log('tab not found:', tab);
    }
}

console.log('console errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  ', e.slice(0, 200));
await ctx.close();
