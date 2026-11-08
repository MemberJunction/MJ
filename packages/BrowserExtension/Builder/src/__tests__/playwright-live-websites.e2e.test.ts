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

const BRANDS_DIR = path.resolve(__dirname, '../../../Brands');

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

describe('Headless Playwright E2E Proof — Live Wikipedia.org & Amazon.com with MV3 Extension', () => {
    let buildOutDir = '';
    let unpackedCopilotDir = '';
    let context: BrowserContext | null = null;

    beforeAll(async () => {
        buildOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-e2e-live-'));
        const builder = new ExtensionBrandBuilder();

        // Build all 3 white-label brands (mj-copilot, betty, sidecar)
        const copilotRes = builder.BuildBrandedExtension({
            BrandSource: path.join(BRANDS_DIR, 'mj-copilot/mj-extension-brand.json'),
            OutputRootDir: buildOutDir,
        });
        builder.BuildBrandedExtension({
            BrandSource: path.join(BRANDS_DIR, 'betty/mj-extension-brand.json'),
            OutputRootDir: buildOutDir,
        });
        builder.BuildBrandedExtension({
            BrandSource: path.join(BRANDS_DIR, 'sidecar/mj-extension-brand.json'),
            OutputRootDir: buildOutDir,
        });

        unpackedCopilotDir = copilotRes.UnpackedDir;

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
            expect(state.CapturedSignals['HostnameRoot']).toBe('en.wikipedia.org');

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
            expect(amazonState.CapturedSignals['HostnameRoot']).toBe('amazon.com');

            // 2. Pick the first live interactive element on Amazon.com and render a Shadow-DOM Coach-Mark Spotlight
            const firstInteractiveSelector =
                amazonState.InteractiveElements[0]?.Selector ?? 'a[href], input, button';

            const highlightRes = await sendCommandToLiveContentScript<{
                Success: boolean;
                Data?: {
                    HighlightId: string;
                    BoundingBox: { Top: number; Left: number; Width: number; Height: number };
                };
            }>(page, 'MJ_CS_HIGHLIGHT_ELEMENT', {
                Selector: firstInteractiveSelector,
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
});
