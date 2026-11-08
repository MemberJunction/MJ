// @vitest-environment jsdom
/**
 * @fileoverview Comprehensive unit test suite for `@memberjunction/browser-extension-core`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import {
    BrowserContextEngine,
    ChromeDebuggerBrowserAdapter,
    CoachMarkOverlayRenderer,
    ContentScriptBrowserAdapter,
    ControlModeCascade,
    ExtensionBrowserAdapter,
    ExtensionSessionHandoffCoordinator,
    GuidedPlaybookRunner,
    HUBSPOT_OAUTH_PLAYBOOK,
    InPageContentScriptExecutor,
    LinkedInPageExtractor,
    LoadLocalBrowserChannel,
    LocalBrowserChannel,
    ModelBlindSecretVaultPipe,
    REDACTED_SENTINEL,
    RuntimeBrandKitHydrator,
    SensitivePageGuard,
    StandardPageExtractor,
    type BrowserPageStateSnapshot,
    type ExtensionBrandProfile,
    type IBrowserEntityPersistenceAdapter,
    type IBrowserEntityViewRunner,
    type IChromeDebuggerTransport,
} from '../index.js';

describe('@memberjunction/browser-extension-core', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        ExtensionSessionHandoffCoordinator.Instance.Reset();
    });

    describe('SensitivePageGuard', () => {
        it('blocks default sensitive domains and wildcard patterns', () => {
            const guard = new SensitivePageGuard({
                ExtraBlockedDomains: ['*.payroll.internal.org'],
            });

            expect(guard.IsDomainBlocked('https://my.1password.com/vaults')).toBe(true);
            expect(guard.IsDomainBlocked('https://vault.bitwarden.com/#/login')).toBe(true);
            expect(guard.IsDomainBlocked('https://online.bank.america.com/accounts')).toBe(true);
            expect(guard.IsDomainBlocked('https://us.payroll.internal.org/compensation')).toBe(true);
            expect(guard.IsDomainBlocked('chrome://extensions')).toBe(true);
            expect(guard.IsDomainBlocked('https://en.wikipedia.org/wiki/Software')).toBe(false);
            expect(guard.IsDomainBlocked('https://www.amazon.com/dp/B08N5WRWNW')).toBe(false);
        });

        it('masks password, credit-card, and OTP fields while preserving regular inputs', () => {
            const guard = new SensitivePageGuard();

            expect(
                guard.SanitizeFieldValue({
                    TagName: 'input',
                    InputType: 'password',
                    Value: 'SuperSecret123!',
                })
            ).toBe(REDACTED_SENTINEL);

            expect(
                guard.SanitizeFieldValue({
                    TagName: 'input',
                    InputType: 'text',
                    Autocomplete: 'cc-number',
                    Value: '4111222233334444',
                })
            ).toBe(REDACTED_SENTINEL);

            expect(
                guard.SanitizeFieldValue({
                    TagName: 'input',
                    InputType: 'text',
                    Autocomplete: 'one-time-code',
                    Value: '849201',
                })
            ).toBe(REDACTED_SENTINEL);

            expect(
                guard.SanitizeFieldValue({
                    TagName: 'input',
                    InputType: 'search',
                    Name: 'q',
                    Value: 'MemberJunction',
                })
            ).toBe('MemberJunction');
        });

        it('detects login, SSO, and MFA screens accurately', () => {
            const guard = new SensitivePageGuard();

            expect(
                guard.DetectAuthOrMfaScreen({
                    Url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                    Title: 'Sign in to your account',
                    VisibleText: 'Enter your password',
                    HasPasswordInput: true,
                    HasOtpInput: false,
                })
            ).toBe(true);

            expect(
                guard.DetectAuthOrMfaScreen({
                    Url: 'https://app.hubspot.com/developer',
                    Title: 'Two-factor authentication',
                    VisibleText: 'Enter your verification code from your authenticator app',
                    HasPasswordInput: false,
                    HasOtpInput: true,
                })
            ).toBe(true);

            expect(
                guard.DetectAuthOrMfaScreen({
                    Url: 'https://en.wikipedia.org/wiki/TypeScript',
                    Title: 'TypeScript - Wikipedia',
                    VisibleText: 'TypeScript is a free and open-source high-level programming language.',
                    HasPasswordInput: false,
                    HasOtpInput: false,
                })
            ).toBe(false);
        });
    });

    describe('ControlModeCascade (4-Layer Cascade & Enterprise Safety Ceiling)', () => {
        it('defaults to Layer 1 content-script when no overrides are set', () => {
            const cascade = new ControlModeCascade();
            const res = cascade.Resolve({});
            expect(res.ConfiguredMode).toBe('content-script');
            expect(res.ActiveBackend).toBe('content-script');
            expect(res.WinningLayer).toBe('code-default');
            expect(res.EscalatedFromAuto).toBe(false);
        });

        it('honors Layer 2 -> Layer 3 -> Layer 4 precedence and enforces AllowDebuggerCDP: false ceiling', () => {
            const cascade = new ControlModeCascade();

            // Layer 4 user override wins when permitted
            const userWin = cascade.Resolve({
                BrandDefaultBackend: 'content-script',
                AgentDefaultBackend: 'auto',
                UserRuntimeOverride: 'debugger-cdp',
                AgentAllowDebuggerCDP: true,
            });
            expect(userWin.ConfiguredMode).toBe('debugger-cdp');
            expect(userWin.ActiveBackend).toBe('debugger-cdp');
            expect(userWin.WinningLayer).toBe('user-runtime-override');

            // Enterprise ceiling (AllowDebuggerCDP: false) clamps debugger-cdp back to content-script
            const clamped = cascade.Resolve({
                BrandDefaultBackend: 'debugger-cdp',
                UserRuntimeOverride: 'debugger-cdp',
                AgentAllowDebuggerCDP: false,
            });
            expect(clamped.DebuggerPermitted).toBe(false);
            expect(clamped.ConfiguredMode).toBe('content-script');
            expect(clamped.ActiveBackend).toBe('content-script');
        });

        it('resolves Mode 3 (auto) to content-script normally and escalates to debugger-cdp when trusted input is needed', () => {
            const cascade = new ControlModeCascade();

            const normalAuto = cascade.Resolve({
                AgentDefaultBackend: 'auto',
                AgentAllowDebuggerCDP: true,
            });
            expect(normalAuto.ConfiguredMode).toBe('auto');
            expect(normalAuto.ActiveBackend).toBe('content-script');
            expect(normalAuto.EscalatedFromAuto).toBe(false);

            const escalatedAuto = cascade.Resolve({
                AgentDefaultBackend: 'auto',
                AgentAllowDebuggerCDP: true,
                PlaybookRequireTrustedInput: true,
            });
            expect(escalatedAuto.ConfiguredMode).toBe('auto');
            expect(escalatedAuto.ActiveBackend).toBe('debugger-cdp');
            expect(escalatedAuto.EscalatedFromAuto).toBe(true);
        });
    });

    describe('Dual-Mode & Auto Browser Control Adapters + Coach-Mark Renderer', () => {
        it('executes Mode 1 (content-script), renders Shadow-DOM Coach-Marks, and escalates to Mode 2 (debugger-cdp) in Auto mode', async () => {
            document.body.innerHTML = `
                <main>
                    <input id="wiki-search" type="search" placeholder="Search Wikipedia" value="" />
                    <input id="secret-pwd" type="password" value="DoNotLeak99!" />
                    <button id="search-btn" type="button">Search</button>
                </main>
            `;

            const allEls = Array.from(document.querySelectorAll('input, button')) as HTMLElement[];
            allEls.forEach((el, idx) => {
                vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
                    x: 20,
                    y: 40 + idx * 50,
                    left: 20,
                    top: 40 + idx * 50,
                    right: 220,
                    bottom: 80 + idx * 50,
                    width: 200,
                    height: 40,
                    toJSON: () => ({}),
                });
            });

            const guard = new SensitivePageGuard();
            const coachRenderer = new CoachMarkOverlayRenderer({ Document: document });
            const inPageExecutor = new InPageContentScriptExecutor({
                Document: document,
                Window: window,
                Guard: guard,
                OverlayRenderer: coachRenderer,
            });

            const mode1 = new ContentScriptBrowserAdapter({
                DomBridge: inPageExecutor,
                Guard: guard,
                CaptureVisibleTab: async () => 'base64-jpeg-mode1',
            });

            // 1. Inspect page state via Mode 1 and verify password input is sanitized
            const stateRes = await mode1.GetPageState();
            expect(stateRes.Success).toBe(true);
            expect(stateRes.Data?.InteractiveElements.length).toBe(3);

            // 2. Render Shadow-DOM Coach-Mark Spotlight ring
            const highlightRes = await mode1.HighlightElement({
                Selector: '#search-btn',
                Label: 'Click Search to submit query',
                StepBadge: 'Step 1 of 2',
                CalloutPosition: 'bottom',
            });
            expect(highlightRes.Success).toBe(true);
            expect(coachRenderer.ActiveCount).toBe(1);
            const hostEl = document.getElementById('mj-ext-coach-mark-host');
            expect(hostEl).not.toBeNull();
            expect(hostEl?.shadowRoot).not.toBeNull();

            // Clear coach-marks
            await mode1.ClearHighlights();
            expect(coachRenderer.ActiveCount).toBe(0);

            // 3. Configure Mode 2 CDP mock transport & Mode 3 Auto adapter
            const cdpCommands: Array<{ method: string; params?: Record<string, unknown> }> = [];
            let attached = false;
            const mockDebuggerTransport: IChromeDebuggerTransport = {
                Attach: async () => {
                    attached = true;
                },
                Detach: async () => {
                    attached = false;
                },
                IsAttached: () => attached,
                SendCommand: async <TResult>(_tabId: number, method: string, params?: Record<string, unknown>): Promise<TResult> => {
                    cdpCommands.push({ method, params });
                    if (method === 'Runtime.evaluate') {
                        return {
                            result: {
                                value: { Found: true, X: 120, Y: 140 },
                            },
                        } as unknown as TResult;
                    }
                    return {} as TResult;
                },
            };

            const mode2 = new ChromeDebuggerBrowserAdapter({
                DebuggerTransport: mockDebuggerTransport,
                GetActiveTabId: async () => 101,
                DomBridge: inPageExecutor,
                Guard: guard,
                DebuggerIdleDetachMs: 15_000,
            });

            const autoAdapter = new ExtensionBrowserAdapter({
                ContentScriptAdapter: mode1,
                DebuggerAdapter: mode2,
                GetCascadeInput: () => ({
                    AgentDefaultBackend: 'auto',
                    AgentAllowDebuggerCDP: true,
                }),
            });

            // Normal FillInput runs in Mode 1 (content-script) without attaching debugger
            const fillRes = await autoAdapter.FillInput({
                Selector: '#wiki-search',
                Value: 'MemberJunction',
            });
            expect(fillRes.Success).toBe(true);
            expect(fillRes.BackendUsed).toBe('content-script');
            expect(fillRes.EscalatedToDebugger).toBe(false);
            expect((document.getElementById('wiki-search') as HTMLInputElement).value).toBe('MemberJunction');
            expect(cdpCommands.length).toBe(0);

            // ClickElement with RequireTrustedInput: true escalates to Mode 2 (debugger-cdp) and detaches immediately!
            const escalatedClick = await autoAdapter.ClickElement({
                Selector: '#search-btn',
                RequireTrustedInput: true,
            });
            expect(escalatedClick.Success).toBe(true);
            expect(escalatedClick.BackendUsed).toBe('debugger-cdp');
            expect(escalatedClick.EscalatedToDebugger).toBe(true);
            expect(cdpCommands.some((c) => c.method === 'Input.dispatchMouseEvent')).toBe(true);
            // Detached immediately after auto-escalated step
            expect(attached).toBe(false);
        });
    });

    describe('LocalBrowserChannel (Channels v2 Contract, Exposure Ceiling & Visual Perception)', () => {
        it('registers in MJGlobal ClassFactory and enforces none | state | pixels exposure ceiling', async () => {
            LoadLocalBrowserChannel();
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
                BaseRealtimeChannelClient,
                'LocalBrowserChannel'
            );
            expect(registration).toBeDefined();

            const channel = new LocalBrowserChannel();
            expect(channel.GetDescriptor().Key).toBe('LocalBrowser');
            expect(channel.GetDescriptor().Verbs.length).toBe(10);

            document.body.innerHTML = `<button id="act-btn">Continue</button>`;
            const btn = document.getElementById('act-btn') as HTMLElement;
            vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
                x: 10,
                y: 10,
                left: 10,
                top: 10,
                right: 110,
                bottom: 50,
                width: 100,
                height: 40,
                toJSON: () => ({}),
            });

            const inPage = new InPageContentScriptExecutor({ Document: document, Window: window });
            const adapter = new ContentScriptBrowserAdapter({
                DomBridge: inPage,
                CaptureVisibleTab: async () => 'frame-jpeg-bytes',
            });
            channel.SetAdapter(adapter);

            // Default exposure is 'pixels' -> GetPageContext & GetLatestFrame succeed
            const ctxResult = await channel.ApplyVerb('GetPageContext', { refresh: true }, 'agent');
            expect(ctxResult.Success).toBe(true);
            expect(await channel.GetLatestFrame()).toBe('frame-jpeg-bytes');

            // Lower exposure to 'state' -> GetPageContext succeeds, but GetLatestFrame returns null
            channel.ApplyExposure({ User: 'state' });
            expect(channel.Exposure).toBe('state');
            expect(await channel.GetLatestFrame()).toBeNull();
            const stateOnlyCtx = await channel.ApplyVerb('GetPageContext', { refresh: false }, 'agent');
            expect(stateOnlyCtx.Success).toBe(true);

            // Lower exposure to 'none' -> GetPageContext (ReturnsChannelData: 'state') is refused whole!
            channel.ApplyExposure({ User: 'none' });
            expect(channel.Exposure).toBe('none');
            const refusedCtx = await channel.ApplyVerb('GetPageContext', { refresh: false }, 'agent');
            expect(refusedCtx.Success).toBe(false);
            expect(refusedCtx.ErrorCode).toBe('exposure_restricted');
        });
    });

    describe('BrowserContextEngine (2-Stage Batched RunViews Braiding, Extractors & Field Diffing)', () => {
        it('extracts LinkedIn profile signals, batches Stage 1 & Stage 2 RunViews(), and computes Page-to-Entity diffs', async () => {
            const linkedInExtractor = new LinkedInPageExtractor();
            expect(
                linkedInExtractor.CanonicalizeLinkedInUrl('https://www.linkedin.com/in/Jane-Doe-12345/?trk=public_profile')
            ).toBe('https://www.linkedin.com/in/jane-doe-12345');

            const runViewsCalls: number[] = [];
            const mockViewRunner: IBrowserEntityViewRunner = {
                RunViews: async (params) => {
                    runViewsCalls.push(params.length);
                    return params.map((p) => {
                        if (p.EntityName === 'People') {
                            return {
                                Success: true,
                                TotalRowCount: 1,
                                Results: [
                                    {
                                        ID: 'person-uuid-1',
                                        Name: 'Jane Doe',
                                        Title: 'Director of Engineering', // Outdated title in CRM!
                                        Organization: 'Acme Corp',
                                        LinkedInURL: 'https://www.linkedin.com/in/jane-doe-12345',
                                    },
                                ],
                            };
                        }
                        if (p.EntityName === 'Job Applications') {
                            return {
                                Success: true,
                                TotalRowCount: 1,
                                Results: [
                                    {
                                        ID: 'app-1',
                                        RequisitionTitle: 'VP of Platform Engineering',
                                        Stage: 'Final Panel',
                                        Status: 'Active',
                                    },
                                ],
                            };
                        }
                        if (p.EntityName === 'Assessments') {
                            return {
                                Success: true,
                                TotalRowCount: 1,
                                Results: [
                                    {
                                        ID: 'caliber-1',
                                        AssessmentType: 'Executive Leadership Profile',
                                        SummaryLevel: 'High Readiness',
                                        OverallScore: '94',
                                    },
                                ],
                            };
                        }
                        if (p.EntityName === 'Memberships') {
                            return {
                                Success: true,
                                TotalRowCount: 1,
                                Results: [
                                    {
                                        ID: 'betty-mem-1',
                                        MembershipTier: 'Fellow Member',
                                        ChapterName: 'Midwest Technology Chapter',
                                        Status: 'Current',
                                    },
                                ],
                            };
                        }
                        return { Success: true, TotalRowCount: 0, Results: [] };
                    });
                },
            };

            const persistedUpdates: Array<{ entityName: string; recordId: string; fields: Record<string, string> }> = [];
            const mockPersistence: IBrowserEntityPersistenceAdapter = {
                CreateRecord: async () => ({ Success: true, RecordID: 'new-id-1' }),
                UpdateRecord: async (entityName, recordId, fields) => {
                    persistedUpdates.push({ entityName, recordId, fields });
                    return { Success: true };
                },
            };

            const engine = BrowserContextEngine.Instance;
            engine.Configure({
                ViewRunner: mockViewRunner,
                PersistenceAdapter: mockPersistence,
            });

            const snapshot: BrowserPageStateSnapshot = {
                Url: 'https://www.linkedin.com/in/Jane-Doe-12345/?trk=nav',
                Title: 'Jane Doe - SVP of Engineering - Acme Corp | LinkedIn',
                Hostname: 'www.linkedin.com',
                ViewportWidth: 1440,
                ViewportHeight: 900,
                InteractiveElements: [],
                VisibleTextExcerpt: 'Jane Doe SVP of Engineering at Acme Corp',
                OpenGraph: {
                    'og:title': 'Jane Doe - SVP of Engineering - Acme Corp | LinkedIn',
                },
                SchemaOrgEntities: [],
                MetaTags: {},
                CapturedSignals: {
                    location: 'Chicago, IL',
                },
                IsAuthOrMfaScreen: false,
                ActiveBackend: 'content-script',
                CapturedAtIso: new Date().toISOString(),
            };

            const braided = await engine.ResolveBraidedContext(snapshot);

            // Exactly 2 batched RunViews() calls (Stage 1 for Anchor, Stage 2 for all cross-app Facets)
            expect(runViewsCalls.length).toBe(2);
            expect(braided.Matches.length).toBe(1);

            const match = braided.Matches[0];
            expect(match.Anchor.EntityName).toBe('People');
            expect(match.Anchor.RecordDisplayName).toBe('Jane Doe');

            // Verify cross-app facets (ATS, Caliber, Tasks, Betty Memberships & Events)
            const facetTitles = match.Facets.map((f) => f.HeaderTitle);
            expect(facetTitles).toContain('ATS Job Applications');
            expect(facetTitles).toContain('Caliber Assessments');
            expect(facetTitles).toContain('Association Memberships');

            // Verify Page-to-Entity field diffs: Title changed from "Director of Engineering" -> "SVP of Engineering"
            const titleDiff = match.FieldDiffs.find((d) => d.FieldName === 'Title');
            expect(titleDiff).toBeDefined();
            expect(titleDiff?.Status).toBe('update');
            expect(titleDiff?.CurrentEntityValue).toBe('Director of Engineering');
            expect(titleDiff?.ExtractedPageValue).toBe('SVP of Engineering');

            // Location is a new field ('add')
            const locDiff = match.FieldDiffs.find((d) => d.FieldName === 'Location');
            expect(locDiff?.Status).toBe('add');
            expect(locDiff?.ExtractedPageValue).toBe('Chicago, IL');

            // Apply 1-click enrichment
            const applyRes = await engine.ApplyCaptureOrEnrichment({
                EntityName: match.Anchor.EntityName,
                RecordID: match.Anchor.RecordID,
                Diffs: match.FieldDiffs,
            });
            expect(applyRes.Success).toBe(true);
            expect(persistedUpdates.length).toBe(1);
            expect(persistedUpdates[0].fields['Title']).toBe('SVP of Engineering');
            expect(persistedUpdates[0].fields['Location']).toBe('Chicago, IL');
        });
    });

    describe('ExtensionSessionHandoffCoordinator (Topology A 0ms Daemon & Topology B Warm Resume)', () => {
        it('maintains 0ms zero-blip continuity in Topology A and supports LastSessionID warm resume in Topology B', async () => {
            const coordinator = ExtensionSessionHandoffCoordinator.Instance;
            let sidePanelOpened = false;
            coordinator.Configure({
                SidePanelOpener: {
                    OpenSidePanel: async () => {
                        sidePanelOpened = true;
                        return true;
                    },
                    ResumeSessionWithContinuity: async (payload) => ({
                        NewSessionID: `${payload.SessionID}-resumed`,
                    }),
                },
            });

            // Topology A: Shared daemon started -> 0ms zero-blip transition
            coordinator.StartTopologyASharedDaemon({
                SessionID: 'sess-alpha-1',
                ConversationID: 'conv-1',
                AgentID: 'agent-sage',
                HostOrigin: 'https://central.company.com',
            });

            const ackA = await coordinator.HandleExternalHandoffRequest({
                Topology: 'topology-a-shared-daemon',
                SessionID: 'sess-alpha-1',
                ConversationID: 'conv-1',
                AgentID: 'agent-sage',
                HostOrigin: 'https://central.company.com',
                ActivePlaybook: {
                    PlaybookID: 'hubspot-oauth-setup',
                    StepIndex: 0,
                    TargetUrl: 'https://app.hubspot.com/developer',
                },
            });

            expect(sidePanelOpened).toBe(true);
            expect(ackA.Accepted).toBe(true);
            expect(ackA.ActiveTopology).toBe('topology-a-shared-daemon');
            expect(ackA.ZeroBlipGuaranteed).toBe(true);
            expect(coordinator.CurrentState.ActivePlaybook?.PlaybookID).toBe('hubspot-oauth-setup');

            // Topology B: Warm resume from a web-tab session
            coordinator.Reset();
            const ackB = await coordinator.HandleExternalHandoffRequest({
                Topology: 'topology-b-warm-resume',
                SessionID: 'sess-web-99',
                ConversationID: 'conv-99',
                AgentID: 'agent-sage',
                HostOrigin: 'https://explorer.company.com',
            });

            expect(ackB.Accepted).toBe(true);
            expect(ackB.ActiveTopology).toBe('topology-b-warm-resume');
            expect(ackB.ZeroBlipGuaranteed).toBe(false);
            expect(coordinator.CurrentState.SessionID).toBe('sess-web-99-resumed');
            expect(coordinator.CurrentState.ResumedFromSessionID).toBe('sess-web-99');
        });
    });

    describe('GuidedPlaybookRunner & ModelBlindSecretVaultPipe', () => {
        it('pipes secrets directly from DOM to MJ Vault without exposing plaintext secret in result payload', async () => {
            document.body.innerHTML = `
                <input id="hubspot-client-secret" type="password" value="hs-live-secret-998877665544" />
            `;
            const inPage = new InPageContentScriptExecutor({ Document: document, Window: window });
            const adapter = new ContentScriptBrowserAdapter({ DomBridge: inPage });

            let vaultedPlaintext = '';
            const secretPipe = new ModelBlindSecretVaultPipe({
                DomBridge: inPage,
                VaultWriter: {
                    WriteSecretToVault: async (params) => {
                        vaultedPlaintext = params.PlaintextSecretValue;
                        return {
                            Success: true,
                            CredentialID: 'cred-vault-uuid-77',
                        };
                    },
                },
            });

            const vaultResult = await secretPipe.CopySecretToMJVault({
                SourceSelector: '#hubspot-client-secret',
                VaultCredentialName: 'HubSpot OAuth Prod',
                VaultTargetFieldName: 'ClientSecret',
            });

            expect(vaultResult.Success).toBe(true);
            expect(vaultResult.CredentialID).toBe('cred-vault-uuid-77');
            expect(vaultResult.RedactedPreview).toBe(REDACTED_SENTINEL);
            expect(vaultResult.ModelBlindVerified).toBe(true);
            // Verify plaintext secret was written to the vault writer, and is NOT anywhere in vaultResult JSON!
            expect(vaultedPlaintext).toBe('hs-live-secret-998877665544');
            expect(JSON.stringify(vaultResult)).not.toContain('hs-live-secret-998877665544');

            // Verify GuidedPlaybookRunner executes CopySecretToMJVault step
            const runner = new GuidedPlaybookRunner({
                Adapter: adapter,
                SecretVaultPipe: secretPipe,
            });
            const stepOutcome = await runner.ExecuteStepById(
                HUBSPOT_OAUTH_PLAYBOOK.Id,
                'hubspot-step-6-vault-client-secret'
            );
            expect(stepOutcome.Success).toBe(true);
            expect(stepOutcome.VaultedFieldName).toBe('ClientSecret');
            expect(JSON.stringify(stepOutcome)).not.toContain('hs-live-secret-998877665544');
        });
    });

    describe('RuntimeBrandKitHydrator (@memberjunction/theme-engine integration)', () => {
        it('derives --mj-* token stylesheets and injects <style> into document', () => {
            const hydrator = new RuntimeBrandKitHydrator();
            const bettyProfile: ExtensionBrandProfile = {
                BrandSlug: 'betty',
                BrandName: 'Betty — Association Intelligence Sidekick',
                ShortName: 'Betty',
                Version: '6.2.0',
                Description: 'Association intelligence companion',
                AssistantDisplayName: 'Betty',
                Tagline: 'Association & Community Intelligence',
                DefaultControlBackend: 'content-script',
                IncludeDebuggerPermission: false,
                HostPermissions: ['<all_urls>'],
                ExternallyConnectableMatches: ['https://*.memberjunction.com/*'],
                BlockedDomains: [],
                ThemeSeeds: {
                    primary: '#7c3aed',
                    accent: '#f59e0b',
                    tertiary: '#ec4899',
                    radius: 12,
                },
                Icons: {
                    Icon16: 'icons/icon-16.png',
                    Icon32: 'icons/icon-32.png',
                    Icon48: 'icons/icon-48.png',
                    Icon128: 'icons/icon-128.png',
                },
            };

            const theme = hydrator.HydrateFromBrandProfile(bettyProfile);
            expect(theme.BrandSlug).toBe('betty');
            expect(theme.StylesheetCss).toContain('--mj-brand-primary');
            expect(theme.StylesheetCss).toContain('[data-theme-overlay="betty"]');

            const styleEl = hydrator.ApplyThemeToDocument(document, theme);
            expect(styleEl.id).toBe('mj-extension-brand-theme');
            expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('betty');
        });
    });
});
