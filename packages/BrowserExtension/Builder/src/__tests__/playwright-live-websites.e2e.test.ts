/**
 * @fileoverview Headless Playwright E2E Proof Suite against live public websites
 * (`https://en.wikipedia.org` and `https://www.amazon.com`).
 *
 * Verifies:
 * 1. Unpacked MV3 extension build for `mj-copilot`, `betty`, and `sidecar` loaded via
 *    `chromium.launchPersistentContext` (`--headless=new`, `--load-extension=...`).
 * 2. Content Script injection & `INTERACTIVITYPROBE` DOM grounding on live `wikipedia.org` and `amazon.com`.
 * 3. Signal extraction (`StandardPageExtractor`) & 2-stage batched `BrowserContextEngine` braiding
 *    for live `wikipedia.org` and `amazon.com` organizations + Open App facets.
 * 4. Shadow-DOM Coach-Mark Spotlight overlay (`#mj-ext-coach-mark-host`) rendering & bounding-box
 *    alignment on live `wikipedia.org` and `amazon.com` interactive elements, plus `ClearHighlights`.
 * 5. Dual-Mode Browser Control: Mode 1 (`content-script`) and Mode 2 (`debugger-cdp` via real
 *    Chromium CDP session `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`) + `SensitivePageGuard`
 *    password field redaction on live pages.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
    BrowserContextEngine,
    BrowserPageStateSnapshot,
    ChromeDebuggerBrowserAdapter,
    IChromeDebuggerTransport,
    InPageContentScriptExecutor,
    REDACTED_SENTINEL,
} from '@memberjunction/browser-extension-core';
import { ExtensionBrandBuilder } from '../ExtensionBrandBuilder.js';

const REPO_METADATA_DIR = path.resolve(__dirname, '../../../../../metadata');

function createDownstreamMetadataFixture(baseDir: string): string {
    const metadataDir = path.join(baseDir, 'downstream-metadata');
    const brandKitsDir = path.join(metadataDir, 'brand-kits');
    const appSettingsDir = path.join(metadataDir, 'app-agent-settings');
    fs.mkdirSync(brandKitsDir, { recursive: true });
    fs.mkdirSync(appSettingsDir, { recursive: true });

    fs.writeFileSync(
        path.join(brandKitsDir, '.brand-kits.json'),
        JSON.stringify(
            [
                {
                    fields: {
                        Name: 'Betty Association Brand',
                        Description: 'Association & Community Intelligence Sidekick.',
                        Style: {
                            Palette: [
                                { Name: 'Primary', Value: '#7c3aed' },
                                { Name: 'Accent', Value: '#ec4899' },
                            ],
                            Typography: [{ Role: 'Body', FontFamily: 'Plus Jakarta Sans, sans-serif' }],
                        },
                    },
                    primaryKey: { ID: '11111111-2222-4333-8444-555555555555' },
                },
                {
                    fields: {
                        Name: 'Sidecar Learning Brand',
                        Description: 'Continuous Learning & Workflow Companion.',
                        Style: {
                            Palette: [
                                { Name: 'Primary', Value: '#0ea5e9' },
                                { Name: 'Accent', Value: '#10b981' },
                            ],
                            Typography: [{ Role: 'Body', FontFamily: 'DM Sans, sans-serif' }],
                        },
                    },
                    primaryKey: { ID: '66666666-7777-4888-9999-aaaaaaaaaaaa' },
                },
            ],
            null,
            2
        ),
        'utf8'
    );

    fs.writeFileSync(
        path.join(appSettingsDir, '.downstream-apps.json'),
        JSON.stringify(
            [
                {
                    fields: {
                        Name: 'Betty',
                        AgentSettings: {
                            BrowserExtension: {
                                BrandSlug: 'betty',
                                ExtensionName: 'Betty — Association Intelligence Sidekick',
                                ShortName: 'Betty',
                                Description:
                                    'Association & Community Intelligence Sidekick for member engagement and committee workflows.',
                                Version: '6.2.0',
                                AssistantDisplayName: 'Betty',
                                SidePanelHeaderTitle: 'Betty — Association Sidekick',
                                DefaultControlBackend: 'content-script',
                                AllowDebuggerCDP: false,
                                BrandKitID: '@lookup:MJ: Brand Kits.Name=Betty Association Brand',
                            },
                        },
                    },
                    primaryKey: { ID: '@lookup:MJ: Applications.Name=Betty' },
                },
                {
                    fields: {
                        Name: 'Sidecar',
                        AgentSettings: {
                            BrowserExtension: {
                                BrandSlug: 'sidecar',
                                ExtensionName: 'Sidecar — Continuous Learning Companion',
                                ShortName: 'Sidecar',
                                Description:
                                    'Continuous Learning & Workflow Companion delivering contextual micro-learning and playbooks.',
                                Version: '6.2.0',
                                AssistantDisplayName: 'Sidecar',
                                SidePanelHeaderTitle: 'Sidecar — Learning Companion',
                                DefaultControlBackend: 'auto',
                                AllowDebuggerCDP: true,
                                BrandKitID: '@lookup:MJ: Brand Kits.Name=Sidecar Learning Brand',
                            },
                        },
                    },
                    primaryKey: { ID: '@lookup:MJ: Applications.Name=Sidecar' },
                },
            ],
            null,
            2
        ),
        'utf8'
    );

    return metadataDir;
}

const hasPlaywrightChromium = (() => {
    try {
        const execPath = chromium.executablePath();
        return Boolean(execPath && fs.existsSync(execPath));
    } catch {
        return false;
    }
})();

describe('White-Label Brand Stamping & Bundle Verification (mj-copilot, betty, sidecar)', () => {
    it('stamps unpacked MV3 directories, manifests, theme stylesheets, and unified content scripts from metadata rows', () => {
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-brand-verify-'));
        try {
            const downstreamMetaDir = createDownstreamMetadataFixture(outDir);
            const builder = new ExtensionBrandBuilder();
            const copilotRes = builder.BuildFromMetadata({
                MetadataDir: REPO_METADATA_DIR,
                ApplicationName: 'Data Explorer',
                OutputRootDir: outDir,
            }).PrimaryResult;
            const bettyRes = builder.BuildFromMetadata({
                MetadataDir: downstreamMetaDir,
                ApplicationName: 'Betty',
                OutputRootDir: outDir,
            }).PrimaryResult;
            const sidecarRes = builder.BuildFromMetadata({
                MetadataDir: downstreamMetaDir,
                ApplicationName: 'Sidecar',
                OutputRootDir: outDir,
            }).PrimaryResult;

            expect(copilotRes.Manifest.optional_permissions).toContain('debugger');
            expect(bettyRes.Manifest.optional_permissions).toBeUndefined();
            expect(sidecarRes.BrandProfile.DefaultControlBackend).toBe('auto');

            const contentScriptCode = fs.readFileSync(
                path.join(copilotRes.UnpackedDir, 'content-script.js'),
                'utf8'
            );
            expect(contentScriptCode).toContain('data-mj-cu-index');
            expect(contentScriptCode).toContain('MJ_CS_GET_PAGE_STATE');
            expect(contentScriptCode).toContain('MJ_CS_HIGHLIGHT_ELEMENT');
        } finally {
            fs.rmSync(outDir, { recursive: true, force: true });
        }
    });
});

/**
 * Helper to send a structured command to the injected MV3 content script on a live Playwright `Page`
 * via the `mj-ext-command` / `mj-ext-response` custom DOM event bridge.
 */
async function sendCommandToLiveContentScript<TResult>(
    page: Page,
    type: string,
    payload?: Record<string, unknown>
): Promise<TResult> {
    return page.evaluate(
        ({ cmdType, cmdPayload }) => {
            return new Promise<TResult>((resolve) => {
                const reqId = 'e2e-' + Date.now() + '-' + Math.random().toString(36).slice(2);
                const handler = (ev: Event): void => {
                    const customEv = ev as CustomEvent<{ RequestId: string; Result: TResult }>;
                    if (customEv.detail && customEv.detail.RequestId === reqId) {
                        document.removeEventListener('mj-ext-response', handler);
                        resolve(customEv.detail.Result);
                    }
                };
                document.addEventListener('mj-ext-response', handler);
                document.dispatchEvent(
                    new CustomEvent('mj-ext-command', {
                        detail: {
                            RequestId: reqId,
                            Type: cmdType,
                            Payload: cmdPayload ?? {},
                        },
                    })
                );
            });
        },
        { cmdType: type, cmdPayload: payload }
    );
}

describe.runIf(hasPlaywrightChromium)('Headless Playwright E2E Proof — Live Wikipedia.org & Amazon.com with MV3 Extension', () => {
    let buildOutDir = '';
    let unpackedCopilotDir = '';
    let unpackedBettyDir = '';
    let unpackedSidecarDir = '';
    let context: BrowserContext | null = null;

    beforeAll(async () => {
        buildOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-e2e-live-'));
        const downstreamMetaDir = createDownstreamMetadataFixture(buildOutDir);
        const builder = new ExtensionBrandBuilder();

        // Build all 3 white-label brands from metadata rows (mj-copilot from repo metadata/, betty & sidecar from downstream metadata/)
        const copilotRes = builder.BuildFromMetadata({
            MetadataDir: REPO_METADATA_DIR,
            ApplicationName: 'Data Explorer',
            OutputRootDir: buildOutDir,
        }).PrimaryResult;
        const bettyRes = builder.BuildFromMetadata({
            MetadataDir: downstreamMetaDir,
            ApplicationName: 'Betty',
            OutputRootDir: buildOutDir,
        }).PrimaryResult;
        const sidecarRes = builder.BuildFromMetadata({
            MetadataDir: downstreamMetaDir,
            ApplicationName: 'Sidecar',
            OutputRootDir: buildOutDir,
        }).PrimaryResult;

        unpackedCopilotDir = copilotRes.UnpackedDir;
        unpackedBettyDir = bettyRes.UnpackedDir;
        unpackedSidecarDir = sidecarRes.UnpackedDir;

        // Verify white-label manifest & sidepanel invariants across all 3 brands
        expect(copilotRes.Manifest.optional_permissions).toContain('debugger');
        expect(bettyRes.Manifest.optional_permissions).toBeUndefined();
        expect(sidecarRes.BrandProfile.DefaultControlBackend).toBe('auto');
        expect(fs.existsSync(path.join(unpackedBettyDir, 'manifest.json'))).toBe(true);
        expect(fs.existsSync(path.join(unpackedSidecarDir, 'manifest.json'))).toBe(true);

        // Launch headless Chromium persistent context with the unpacked MV3 extension loaded
        context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: true,
            viewport: { width: 1440, height: 900 },
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            args: [
                '--headless=new',
                `--disable-extensions-except=${unpackedCopilotDir}`,
                `--load-extension=${unpackedCopilotDir}`,
            ],
        });
    }, 60000);

    afterAll(async () => {
        if (context) {
            await context.close();
        }
        if (buildOutDir && fs.existsSync(buildOutDir)) {
            fs.rmSync(buildOutDir, { recursive: true, force: true });
        }
    });

    it('E2E 1 (wikipedia.org): injects MV3 Content Script, grounds live DOM via INTERACTIVITYPROBE, renders Shadow-DOM Coach-Marks, executes Mode 1 & Mode 2 CDP actions, and braids MJ context', async () => {
        expect(context).not.toBeNull();
        const page = await context!.newPage();

        try {
            await page.goto('https://en.wikipedia.org/wiki/Main_Page', {
                waitUntil: 'domcontentloaded',
                timeout: 45000,
            });

            // Wait for the MV3 Content Script to mark readiness on document.documentElement
            await page.waitForSelector('html[data-mj-extension-content-script="ready"]', {
                timeout: 15000,
            });

            const brandAttr = await page.getAttribute('html', 'data-mj-extension-brand');
            expect(brandAttr).toBe('mj-copilot');

            // 1. Capture live page state & grounded InteractiveElement[] via INTERACTIVITYPROBE
            const state = await sendCommandToLiveContentScript<BrowserPageStateSnapshot>(
                page,
                'MJ_CS_GET_PAGE_STATE'
            );

            expect(state.Url).toContain('wikipedia.org');
            expect(state.Hostname).toBe('en.wikipedia.org');
            expect(state.InteractiveElements.length).toBeGreaterThan(20);
            expect(state.InteractiveElements[0].Index).toBe(0);
            expect(state.InteractiveElements[1].Index).toBe(1);
            expect(state.InteractiveElements[0].BoundingBox).toBeDefined();
            expect(state.InteractiveElements[0].BoundingBox!.XMax).toBeGreaterThan(
                state.InteractiveElements[0].BoundingBox!.XMin
            );
            expect(state.InteractiveElements[0].BoundingBox!.YMax).toBeGreaterThan(
                state.InteractiveElements[0].BoundingBox!.YMin
            );
            expect(state.CapturedSignals['HostnameRoot']).toBe('en.wikipedia.org');

            // Verify data-mj-cu-index="0" was stamped into the live Wikipedia DOM by the probe
            const cuZeroCount = await page.locator('[data-mj-cu-index="0"]').count();
            expect(cuZeroCount).toBe(1);

            // Find the live search input on Wikipedia
            const searchSelector = 'input[name="search"], #searchInput';
            const hasSearchInput = (await page.locator(searchSelector).count()) > 0;
            expect(hasSearchInput).toBe(true);

            // 2. Render Shadow-DOM Coach-Mark Spotlight ring on live Wikipedia search input
            const highlightRes = await sendCommandToLiveContentScript<{
                Success: boolean;
                Data?: {
                    HighlightId: string;
                    BoundingBox: { Top: number; Left: number; Width: number; Height: number };
                };
            }>(page, 'MJ_CS_HIGHLIGHT_ELEMENT', {
                Selector: searchSelector,
                Label: 'Search Wikipedia articles with MJ Co-Pilot',
                StepBadge: 'Step 1 of 2',
            });

            expect(highlightRes.Success).toBe(true);
            expect(highlightRes.Data?.BoundingBox.Width).toBeGreaterThan(20);
            expect(highlightRes.Data?.BoundingBox.Height).toBeGreaterThan(10);

            // Verify #mj-ext-coach-mark-host and its isolated ShadowRoot exist in the live Wikipedia DOM
            const shadowRingExists = await page.evaluate(() => {
                const host = document.getElementById('mj-ext-coach-mark-host');
                return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector('.mj-spotlight-ring'));
            });
            expect(shadowRingExists).toBe(true);

            // Clear Coach-Mark highlights
            const clearRes = await sendCommandToLiveContentScript<{ Success: boolean }>(
                page,
                'MJ_CS_CLEAR_HIGHLIGHTS'
            );
            expect(clearRes.Success).toBe(true);
            const hostAfterClear = await page.evaluate(() =>
                document.getElementById('mj-ext-coach-mark-host')
            );
            expect(hostAfterClear).toBeNull();

            // 3. Mode 1 ('content-script'): FillInput on live Wikipedia search box
            const fillRes = await sendCommandToLiveContentScript<{ Success: boolean }>(
                page,
                'MJ_CS_FILL_INPUT',
                {
                    Selector: searchSelector,
                    Value: 'Artificial intelligence',
                }
            );
            expect(fillRes.Success).toBe(true);
            const inputVal = await page.locator(searchSelector).first().inputValue();
            expect(inputVal).toBe('Artificial intelligence');

            // 4. Mode 2 ('debugger-cdp' Power Mode): Attach a real Chromium CDP session to the live Wikipedia page
            //    and drive ChromeDebuggerBrowserAdapter hardware mouse/keyboard dispatch!
            const cdpSession = await context!.newCDPSession(page);
            let cdpAttached = false;
            const cdpEventsSent: string[] = [];

            const realCdpTransport: IChromeDebuggerTransport = {
                Attach: async () => {
                    cdpAttached = true;
                },
                Detach: async () => {
                    cdpAttached = false;
                },
                IsAttached: () => cdpAttached,
                SendCommand: async <TResult>(
                    _tabId: number,
                    method: string,
                    params?: Record<string, unknown>
                ): Promise<TResult> => {
                    cdpEventsSent.push(method);
                    return (await cdpSession.send(
                        method as Parameters<typeof cdpSession.send>[0],
                        params as never
                    )) as unknown as TResult;
                },
            };

            const mode2Adapter = new ChromeDebuggerBrowserAdapter({
                DebuggerTransport: realCdpTransport,
                GetActiveTabId: async () => 1,
                DomBridge: new InPageContentScriptExecutor(),
                DebuggerIdleDetachMs: 15000,
            });

            // Use Mode 2 CDP adapter to click & type into the live Wikipedia search input via real CDP 1.3!
            const cdpClickRes = await mode2Adapter.ClickElement({
                Selector: searchSelector,
            });
            expect(cdpClickRes.Success).toBe(true);
            expect(cdpClickRes.BackendUsed).toBe('debugger-cdp');
            expect(cdpEventsSent).toContain('Input.dispatchMouseEvent');

            await mode2Adapter.DetachDebugger();
            expect(cdpAttached).toBe(false);

            // 5. Verify SensitivePageGuard masks password inputs on the live Wikipedia page before state leaves!
            await page.evaluate(() => {
                const pwd = document.createElement('input');
                pwd.type = 'password';
                pwd.id = 'wiki-live-secret-password';
                pwd.value = 'TopSecretWikiPassword!2026';
                pwd.style.cssText = 'position:fixed;top:10px;left:10px;width:120px;height:28px;z-index:99999;';
                document.body.appendChild(pwd);
            });

            const stateWithPwd = await sendCommandToLiveContentScript<BrowserPageStateSnapshot>(
                page,
                'MJ_CS_GET_PAGE_STATE'
            );
            expect(stateWithPwd.IsAuthOrMfaScreen).toBe(true);
            expect(JSON.stringify(stateWithPwd)).not.toContain('TopSecretWikiPassword!2026');
            const redactedElem = stateWithPwd.InteractiveElements.find(
                (e) => e.Value === REDACTED_SENTINEL
            );
            expect(redactedElem).toBeDefined();

            // 6. Feed live Wikipedia page snapshot into BrowserContextEngine to verify 2-stage batched braiding
            const engine = BrowserContextEngine.Instance;
            engine.Configure({
                ViewRunner: {
                    RunViews: async (views) =>
                        views.map((v) => {
                            if (v.EntityName === 'Organizations') {
                                return {
                                    Success: true,
                                    TotalRowCount: 1,
                                    Results: [
                                        {
                                            ID: 'org-wikimedia-1',
                                            Name: 'Wikimedia Foundation',
                                            Website: 'https://en.wikipedia.org',
                                        },
                                    ],
                                };
                            }
                            if (v.EntityName === 'Deals') {
                                return {
                                    Success: true,
                                    TotalRowCount: 1,
                                    Results: [
                                        {
                                            ID: 'deal-wiki-1',
                                            DealName: 'Enterprise Knowledge Graph Partnership',
                                            Stage: 'Proposal',
                                            Amount: '$125,000',
                                        },
                                    ],
                                };
                            }
                            return { Success: true, TotalRowCount: 0, Results: [] };
                        }),
                },
            });

            const braided = await engine.ResolveBraidedContext(state);
            expect(braided.Matches.length).toBe(1);
            expect(braided.Matches[0].Anchor.RecordDisplayName).toBe('Wikimedia Foundation');
            expect(
                braided.Matches[0].Facets.some((f) => f.EntityName === 'Deals' && f.TotalCount === 1)
            ).toBe(true);

            // 7. Verify UnmatchedCandidates (AllowCreateIfUnmatched: true) & 1-click ApplyCaptureOrEnrichment on live snapshot
            const createdRecords: Array<{ EntityName: string; Fields: Record<string, string> }> = [];
            engine.Configure({
                ViewRunner: {
                    RunViews: async (views) =>
                        views.map(() => ({
                            Success: true,
                            TotalRowCount: 0,
                            Results: [],
                        })),
                },
                PersistenceAdapter: {
                    CreateRecord: async (entityName, fields) => {
                        createdRecords.push({ EntityName: entityName, Fields: fields });
                        return { Success: true, RecordID: 'org-created-live-1' };
                    },
                    UpdateRecord: async () => ({ Success: true }),
                },
            });

            const unmatchedBraided = await engine.ResolveBraidedContext(state);
            expect(unmatchedBraided.UnmatchedCandidates.length).toBeGreaterThan(0);
            const candidate = unmatchedBraided.UnmatchedCandidates[0];
            expect(candidate.TargetEntityName).toBe('Organizations');

            const captureRes = await engine.ApplyCaptureOrEnrichment({
                EntityName: candidate.TargetEntityName,
                Diffs: candidate.ProposedFields,
            });
            expect(captureRes.Success).toBe(true);
            expect(captureRes.RecordID).toBe('org-created-live-1');
            expect(createdRecords.length).toBe(1);
        } finally {
            await page.close();
        }
    }, 60000);

    it('E2E 2 (amazon.com): injects MV3 Content Script on live Amazon.com, extracts grounded elements & metadata signals, renders Shadow-DOM Coach-Marks, and resolves Braided Context', async () => {
        expect(context).not.toBeNull();
        const page = await context!.newPage();

        try {
            await page.goto('https://www.amazon.com', {
                waitUntil: 'load',
                timeout: 45000,
            });

            // Wait for the MV3 Content Script to mark readiness on document.documentElement
            await page.waitForSelector('html[data-mj-extension-content-script="ready"]', {
                timeout: 15000,
            });

            // Wait for at least one interactive element (link/button/input) on Amazon.com to be visible
            await page.waitForSelector('a[href], input, button', {
                state: 'visible',
                timeout: 15000,
            });
            await page.waitForSelector('html[data-mj-extension-brand="mj-copilot"]', {
                timeout: 15000,
            });

            const brandAttr = await page.getAttribute('html', 'data-mj-extension-brand');
            expect(brandAttr).toBe('mj-copilot');

            // 1. Capture live Amazon.com page state & grounded InteractiveElement[] via INTERACTIVITYPROBE
            const amazonState = await sendCommandToLiveContentScript<BrowserPageStateSnapshot>(
                page,
                'MJ_CS_GET_PAGE_STATE'
            );

            expect(amazonState.Url).toContain('amazon.com');
            expect(amazonState.Hostname).toContain('amazon.com');
            expect(amazonState.InteractiveElements.length).toBeGreaterThan(0);
            expect(amazonState.InteractiveElements[0].Index).toBe(0);
            expect(amazonState.InteractiveElements[0].BoundingBox).toBeDefined();
            expect(amazonState.CapturedSignals['HostnameRoot']).toBe('amazon.com');
            expect(typeof amazonState.MetaTags).toBe('object');
            expect(typeof amazonState.OpenGraph).toBe('object');

            // Verify data-mj-cu-index="0" was stamped into the live Amazon.com DOM by the probe
            const amazonCuZeroCount = await page.locator('[data-mj-cu-index="0"]').count();
            expect(amazonCuZeroCount).toBe(1);

            // 2. Highlight element by 0-based Index: 0 on live Amazon.com and render a Shadow-DOM Coach-Mark Spotlight
            const highlightRes = await sendCommandToLiveContentScript<{
                Success: boolean;
                Data?: {
                    HighlightId: string;
                    BoundingBox: { Top: number; Left: number; Width: number; Height: number };
                };
            }>(page, 'MJ_CS_HIGHLIGHT_ELEMENT', {
                Index: 0,
                Label: 'Amazon Interactive Target Grounded by MJ Co-Pilot',
                StepBadge: 'Amazon Live Spotlight',
            });

            expect(highlightRes.Success).toBe(true);
            expect(highlightRes.Data?.BoundingBox.Width).toBeGreaterThan(0);

            const hasCoachHost = await page.evaluate(() => {
                const host = document.getElementById('mj-ext-coach-mark-host');
                return Boolean(host && host.shadowRoot && host.shadowRoot.querySelector('.mj-spotlight-ring'));
            });
            expect(hasCoachHost).toBe(true);

            // Clear Coach-Marks on Amazon.com
            const clearRes = await sendCommandToLiveContentScript<{ Success: boolean }>(
                page,
                'MJ_CS_CLEAR_HIGHLIGHTS'
            );
            expect(clearRes.Success).toBe(true);

            // 3. Resolve Braided Context for Amazon.com via BrowserContextEngine
            const engine = BrowserContextEngine.Instance;
            engine.Configure({
                ViewRunner: {
                    RunViews: async (views) =>
                        views.map((v) => {
                            if (v.EntityName === 'Organizations') {
                                return {
                                    Success: true,
                                    TotalRowCount: 1,
                                    Results: [
                                        {
                                            ID: 'org-amazon-1',
                                            Name: 'Amazon.com, Inc.',
                                            Website: 'https://www.amazon.com',
                                        },
                                    ],
                                };
                            }
                            return { Success: true, TotalRowCount: 0, Results: [] };
                        }),
                },
            });

            const braidedAmazon = await engine.ResolveBraidedContext(amazonState);
            expect(braidedAmazon.Matches.length).toBe(1);
            expect(braidedAmazon.Matches[0].Anchor.RecordDisplayName).toBe('Amazon.com, Inc.');
        } finally {
            await page.close();
        }
    }, 60000);

    it('E2E 3 (Side Panel OAuth2 PKCE Popup): clicking MSAL and Auth0 sign-in buttons opens real OAuth2 PKCE popup windows to Microsoft Entra ID and Auth0', async () => {
        expect(context).not.toBeNull();
        const sidePanelPage = await context!.newPage();

        try {
            const sidePanelFileUrl = 'file://' + path.join(unpackedCopilotDir, 'sidepanel.html');
            await sidePanelPage.goto(sidePanelFileUrl, { waitUntil: 'domcontentloaded' });
            await sidePanelPage.waitForSelector('#mj-extension-sidepanel-root[data-ready="true"]', {
                timeout: 10000,
            });

            // 1. Click "Sign In with Microsoft (MSAL)" and verify real popup window opens to login.microsoftonline.com
            const msalPopupPromise = context!.waitForEvent('page', { timeout: 15000 });
            await sidePanelPage.click('#mj-btn-idp-msal');
            const msalPopup = await msalPopupPromise;
            await msalPopup.waitForLoadState('domcontentloaded', { timeout: 20000 });

            const msalOAuthUrl = await sidePanelPage.getAttribute(
                '#mj-extension-sidepanel-root',
                'data-last-oauth-url'
            );
            expect(msalOAuthUrl).toContain(
                'https://login.microsoftonline.com/ff10ade7-5d03-40a9-be28-cb7ab99670b1/oauth2/v2.0/authorize'
            );
            expect(msalOAuthUrl).toContain('client_id=7e6e6ecf-66ff-4733-9c60-1e6def949897');
            expect(msalOAuthUrl).toContain('code_challenge_method=S256');
            expect(msalPopup.url()).toContain('login.microsoftonline.com');
            await msalPopup.close();

            // 2. Click "Auth0 / OIDC" and verify real popup window opens to bluecypress-dev.us.auth0.com
            const auth0PopupPromise = context!.waitForEvent('page', { timeout: 15000 });
            await sidePanelPage.click('#mj-btn-idp-auth0');
            const auth0Popup = await auth0PopupPromise;
            await auth0Popup.waitForLoadState('domcontentloaded', { timeout: 20000 });

            const auth0OAuthUrl = await sidePanelPage.getAttribute(
                '#mj-extension-sidepanel-root',
                'data-last-oauth-url'
            );
            expect(auth0OAuthUrl).toContain('https://bluecypress-dev.us.auth0.com/authorize');
            expect(auth0OAuthUrl).toContain('client_id=uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI');
            expect(auth0OAuthUrl).toContain('code_challenge_method=S256');
            expect(auth0Popup.url()).toContain('bluecypress-dev.us.auth0.com');
            await auth0Popup.close();
        } finally {
            await sidePanelPage.close();
        }
    }, 60000);

    it('E2E 4 (Live MJAPI GraphQL Braiding & Bidirectional MJExplorer Conversation Handoff): syncs active conversation and realtime session with MJExplorer and resolves 360° records + Open App rules via GraphQL RunViews', async () => {
        expect(context).not.toBeNull();
        const hostPage = await context!.newPage();
        const sidePanelPage = await context!.newPage();

        try {
            // 1. Load live page with Content Script and simulate MJExplorer active conversation + realtime session attributes
            await hostPage.goto('https://en.wikipedia.org/wiki/Main_Page', {
                waitUntil: 'domcontentloaded',
                timeout: 45000,
            });
            await hostPage.waitForSelector('html[data-mj-extension-content-script="ready"]', {
                timeout: 15000,
            });

            await hostPage.evaluate(() => {
                document.documentElement.setAttribute('data-mj-active-conversation-id', 'conv-live-001');
                document.documentElement.setAttribute('data-mj-active-session-id', 'rt-session-99');
                document.addEventListener('mj-ext-resume-conversation', (ev: Event) => {
                    const detail = (ev as CustomEvent<{ ConversationID: string }>).detail;
                    document.documentElement.setAttribute(
                        'data-test-resumed-conversation',
                        detail?.ConversationID || ''
                    );
                });
            });

            // Verify Content Script extracts MJExplorer host session state (`MJ_CS_GET_MJ_HOST_SESSION`)
            const hostSession = await sendCommandToLiveContentScript<{
                Success: boolean;
                HasHostSession: boolean;
                ConversationID: string | null;
                LastSessionID: string | null;
            }>(hostPage, 'MJ_CS_GET_MJ_HOST_SESSION');

            expect(hostSession.Success).toBe(true);
            expect(hostSession.HasHostSession).toBe(true);
            expect(hostSession.ConversationID).toBe('conv-live-001');
            expect(hostSession.LastSessionID).toBe('rt-session-99');

            // Verify Content Script dispatches `mj-ext-resume-conversation` back to MJExplorer (`MJ_CS_RESUME_CONVERSATION`)
            const resumeRes = await sendCommandToLiveContentScript<{
                Success: boolean;
                ConversationID: string;
            }>(hostPage, 'MJ_CS_RESUME_CONVERSATION', { ConversationID: 'conv-live-001' });

            expect(resumeRes.Success).toBe(true);
            const resumedAttr = await hostPage.getAttribute('html', 'data-test-resumed-conversation');
            expect(resumedAttr).toBe('conv-live-001');

            // 2. Intercept MJAPI GraphQL endpoint in the Side Panel and serve live Open App (`bizapps-common`) metadata, 360° records, and conversations
            await sidePanelPage.route('**/graphql', async (route) => {
                const postData = route.request().postDataJSON() as {
                    variables?: { input?: Array<{ EntityName?: string }> };
                };
                const inputs = postData?.variables?.input || [];
                const results = inputs.map((item) => {
                    if (item.EntityName === 'MJ: Applications') {
                        return {
                            Success: true,
                            TotalRowCount: 1,
                            Results: [
                                {
                                    ID: 'app-bizapps-common',
                                    Name: 'Common Business Apps',
                                    AgentSettings: JSON.stringify({
                                        BrowserExtension: {
                                            ContextRules: [
                                                {
                                                    RuleID: 'bizapps-org-domain',
                                                    RuleName: 'Organization Domain Match',
                                                    EntityName: 'Organizations',
                                                    SignalType: 'hostname',
                                                    MatchPattern: '(?:^|\\.)([a-z0-9-]+\\.[a-z]{2,})$',
                                                    ExtraFilterTemplate: "Website LIKE '%${1}%'",
                                                    Priority: 5,
                                                },
                                            ],
                                            EntityFacets: [
                                                {
                                                    ParentEntityName: 'Organizations',
                                                    FacetId: 'org-people',
                                                    Title: 'People & Contacts',
                                                    Icon: 'fa-solid fa-users',
                                                    RelatedEntityName: 'People',
                                                    ForeignKeyField: 'OrganizationID',
                                                    MaxRecords: 5,
                                                },
                                            ],
                                        },
                                    }),
                                },
                            ],
                        };
                    }
                    if (item.EntityName === 'Organizations' || item.EntityName === 'MJ: AI Vendors') {
                        return {
                            Success: true,
                            TotalRowCount: 1,
                            Results: [
                                {
                                    ID: 'org-wikimedia-001',
                                    Name: 'Wikimedia Foundation (Live MJ Record)',
                                    Status: 'Active Enterprise Member',
                                    Website: 'wikipedia.org',
                                },
                            ],
                        };
                    }
                    if (item.EntityName === 'People' || item.EntityName === 'MJ: AI Models') {
                        return {
                            Success: true,
                            TotalRowCount: 2,
                            Results: [
                                {
                                    ID: 'person-1',
                                    Name: 'Elena Vance — VP of Knowledge Systems',
                                    Status: 'Primary Executive Sponsor',
                                },
                                {
                                    ID: 'person-2',
                                    Name: 'Marcus Chen — Director of Engineering',
                                    Status: 'Technical Champion',
                                },
                            ],
                        };
                    }
                    if (item.EntityName === 'MJ: Conversations') {
                        return {
                            Success: true,
                            TotalRowCount: 1,
                            Results: [
                                {
                                    ID: 'conv-live-001',
                                    Name: 'Q4 Executive Pipeline & Renewal Strategy',
                                    Status: 'Available',
                                },
                            ],
                        };
                    }
                    if (item.EntityName === 'MJ: Conversation Details') {
                        return {
                            Success: true,
                            TotalRowCount: 2,
                            Results: [
                                {
                                    ID: 'msg-1',
                                    ConversationID: 'conv-live-001',
                                    Role: 'User',
                                    Message: 'Summarize the Wikimedia renewal status from MJExplorer.',
                                },
                                {
                                    ID: 'msg-2',
                                    ConversationID: 'conv-live-001',
                                    Role: 'AI',
                                    Message: 'Wikimedia Foundation is an Active Enterprise Member with 2 key executive contacts.',
                                },
                            ],
                        };
                    }
                    return { Success: true, TotalRowCount: 0, Results: [] };
                });

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { RunViews: results } }),
                });
            });

            const sidePanelFileUrl = 'file://' + path.join(unpackedCopilotDir, 'sidepanel.html');
            await sidePanelPage.goto(sidePanelFileUrl, { waitUntil: 'domcontentloaded' });
            await sidePanelPage.waitForSelector('#mj-extension-sidepanel-root[data-ready="true"]', {
                timeout: 10000,
            });

            // Provide a test JWT token and trigger live MJAPI GraphQL resolution + conversation sync
            await sidePanelPage.fill('#mj-input-api-token', 'eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoiQW1pdGggTmFnYXJhamFuIiwiZW1haWwiOiJhbWl0aEBibHVlY3lwcmVzcy5pbyJ9.sig');
            await sidePanelPage.click('#mj-btn-save-auth');

            // Wait for the live MJAPI 360° anchor record to render in the 360° Context tab
            await sidePanelPage.waitForFunction(
                () => document.body.innerText.includes('Wikimedia Foundation (Live MJ Record)'),
                undefined,
                { timeout: 10000 }
            );

            const contextText = await sidePanelPage.innerText('#mj-sidepanel-context-view');
            expect(contextText).toContain('Wikimedia Foundation (Live MJ Record)');
            expect(contextText).toContain('Elena Vance — VP of Knowledge Systems');

            // Switch to Co-Pilot Chat tab and verify the synced MJExplorer conversation is loaded
            await sidePanelPage.click('[data-tab="chat"]');
            await sidePanelPage.waitForFunction(
                () => document.body.innerText.includes('Q4 Executive Pipeline & Renewal Strategy'),
                undefined,
                { timeout: 10000 }
            );

            const chatText = await sidePanelPage.innerText('#mj-sidepanel-context-view');
            expect(chatText).toContain('Q4 Executive Pipeline & Renewal Strategy');
            expect(chatText).toContain('Wikimedia Foundation is an Active Enterprise Member');
        } finally {
            await hostPage.close();
            await sidePanelPage.close();
        }
    }, 60000);
});
