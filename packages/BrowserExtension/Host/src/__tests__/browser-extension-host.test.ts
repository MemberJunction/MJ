import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    BootstrapContentScript,
    ChromeDebuggerServiceWorkerTransport,
    ExtensionOffscreenAudioDaemon,
    ExtensionServiceWorkerRuntime,
    ExtensionSidePanelController,
    WebExtensionBrowserBridge,
} from '../index.js';
import type { ExtensionBrandProfile } from '@memberjunction/browser-extension-core';

describe('@memberjunction/browser-extension-host', () => {
    beforeEach(() => {
        document.body.innerHTML = `<div id="mj-extension-sidepanel-root"></div>`;
        ExtensionOffscreenAudioDaemon.Instance.StopSession();
    });

    it('bootstraps ExtensionContentScriptRuntime, sets ready attribute, and handles MJ_CS_GET_PAGE_STATE & Coach-Marks', async () => {
        document.body.innerHTML = `
            <input id="search-box" type="text" value="Wikipedia" />
            <button id="go-btn">Search</button>
        `;
        const goBtn = document.getElementById('go-btn') as HTMLElement;
        vi.spyOn(goBtn, 'getBoundingClientRect').mockReturnValue({
            x: 20,
            y: 40,
            left: 20,
            top: 40,
            right: 120,
            bottom: 80,
            width: 100,
            height: 40,
            toJSON: () => ({}),
        });
        const runtime = BootstrapContentScript();
        expect(runtime).not.toBeNull();
        expect(document.documentElement.getAttribute('data-mj-extension-content-script')).toBe('ready');

        const state = await runtime!.HandleCommand({
            Type: 'MJ_CS_GET_PAGE_STATE',
        });
        expect('Url' in state).toBe(true);

        const highlightRes = await runtime!.HandleCommand({
            Type: 'MJ_CS_HIGHLIGHT_ELEMENT',
            Payload: {
                Selector: '#go-btn',
                Label: 'Click Search',
                StepBadge: 'Step 1',
            },
        });
        expect('Success' in highlightRes && highlightRes.Success).toBe(true);
        expect(runtime!.CoachMarks.ActiveCount).toBe(1);

        await runtime!.HandleCommand({ Type: 'MJ_CS_CLEAR_HIGHLIGHTS' });
        expect(runtime!.CoachMarks.ActiveCount).toBe(0);
    });

    it('handles externally_connectable ping & Topology A 0ms session handoff in ExtensionServiceWorkerRuntime', async () => {
        const sw = ExtensionServiceWorkerRuntime.Instance;
        sw.Initialize({ BrandSlug: 'betty', Version: '6.2.0' });

        const ping = await sw.HandleExternalMessage({ Type: 'MJ_EXT_PING' });
        expect('Installed' in ping && ping.Installed).toBe(true);
        if ('BrandSlug' in ping) {
            expect(ping.BrandSlug).toBe('betty');
        }

        const ack = await sw.HandleExternalMessage({
            Type: 'MJ_EXT_SESSION_HANDOFF',
            Payload: {
                Topology: 'topology-a-shared-daemon',
                SessionID: 'sess-betty-1',
                ConversationID: 'conv-betty-1',
                AgentID: 'agent-betty',
                HostOrigin: 'https://central.association.org',
            },
        });
        expect('Accepted' in ack && ack.Accepted).toBe(true);
        if ('ZeroBlipGuaranteed' in ack) {
            expect(ack.ZeroBlipGuaranteed).toBe(true);
        }

        const audioStatus = ExtensionOffscreenAudioDaemon.Instance.RecordZeroBlipNavigation();
        expect(audioStatus.Running).toBe(true);
        expect(audioStatus.ActiveSessionID).toBe('sess-betty-1');
        expect(audioStatus.ZeroBlipTransitionsCount).toBe(1);
    });

    it('requests optional "debugger" permission on demand in ChromeDebuggerServiceWorkerTransport', async () => {
        let requestedPermissions: string[] = [];
        let attachedTabId = -1;
        const globalObj = globalThis as Record<string, unknown>;
        globalObj['chrome'] = {
            permissions: {
                contains: async () => false,
                request: async (p: { permissions: string[] }) => {
                    requestedPermissions = p.permissions;
                    return true;
                },
            },
            debugger: {
                attach: async (target: { tabId: number }) => {
                    attachedTabId = target.tabId;
                },
                detach: async () => {
                    attachedTabId = -1;
                },
                sendCommand: async () => ({ ok: true }),
            },
        };

        const transport = new ChromeDebuggerServiceWorkerTransport();
        await transport.Attach(42);
        expect(requestedPermissions).toEqual(['debugger']);
        expect(attachedTabId).toBe(42);
        expect(transport.IsAttached(42)).toBe(true);

        await transport.Detach(42);
        expect(transport.IsAttached(42)).toBe(false);
        delete globalObj['chrome'];
    });

    it('mounts ExtensionSidePanelController and hydrates BrandKit CSS tokens', () => {
        const sidecarBrand: ExtensionBrandProfile = {
            BrandSlug: 'sidecar',
            BrandName: 'Sidecar — Continuous Learning Companion',
            ShortName: 'Sidecar',
            Version: '6.2.0',
            Description: 'Continuous learning companion',
            AssistantDisplayName: 'Sidecar',
            Tagline: 'Continuous Learning & Workflow Companion',
            DefaultControlBackend: 'content-script',
            IncludeDebuggerPermission: true,
            HostPermissions: ['<all_urls>'],
            ExternallyConnectableMatches: ['https://*.memberjunction.com/*'],
            BlockedDomains: [],
            ThemeSeeds: {
                primary: '#0ea5e9',
                accent: '#10b981',
                radius: 10,
            },
            Icons: {
                Icon16: 'icons/icon-16.png',
                Icon32: 'icons/icon-32.png',
                Icon48: 'icons/icon-48.png',
                Icon128: 'icons/icon-128.png',
            },
        };

        const controller = new ExtensionSidePanelController(sidecarBrand);
        const theme = controller.Mount(document);
        expect(theme.BrandSlug).toBe('sidecar');
        const root = document.getElementById('mj-extension-sidepanel-root');
        expect(root?.getAttribute('data-brand-slug')).toBe('sidecar');
        expect(root?.textContent).toContain('Sidecar');

        expect(controller.SetExposure('state')).toBe('state');
        expect(controller.SetControlMode('auto')).toBe('auto');
    });

    it('normalizes WebExtensionBrowserBridge across Chrome/Edge, Firefox, and Safari', async () => {
        // 1. Chromium (Chrome / Edge): sidePanel + offscreen + debugger
        let chromeSidePanelOpened = false;
        let chromeOffscreenCreated = false;
        const chromeRuntime: Record<string, unknown> = {
            chrome: {
                sidePanel: {
                    open: async () => {
                        chromeSidePanelOpened = true;
                    },
                    setPanelBehavior: async () => undefined,
                },
                offscreen: {
                    hasDocument: async () => false,
                    createDocument: async () => {
                        chromeOffscreenCreated = true;
                    },
                },
                debugger: {
                    attach: async () => undefined,
                },
            },
        };

        expect(WebExtensionBrowserBridge.DetectBrowserTarget(chromeRuntime)).toBe('chrome');
        expect(WebExtensionBrowserBridge.SupportsDebuggerCDP(chromeRuntime)).toBe(true);
        expect(WebExtensionBrowserBridge.SupportsOffscreenDocument(chromeRuntime)).toBe(true);
        const chromeOpen = await WebExtensionBrowserBridge.OpenSidePanel({ WindowId: 1 }, chromeRuntime);
        expect(chromeOpen.OpenedVia).toBe('sidePanel');
        expect(chromeSidePanelOpened).toBe(true);
        const chromeAudio = await WebExtensionBrowserBridge.EnsureAudioDaemonHost('offscreen.html', chromeRuntime);
        expect(chromeAudio.HostMode).toBe('offscreen-document');
        expect(chromeOffscreenCreated).toBe(true);

        // 2. Firefox: browser.sidebarAction, no offscreen, no debugger
        let firefoxSidebarOpened = false;
        const firefoxRuntime: Record<string, unknown> = {
            browser: {
                sidebarAction: {
                    open: async () => {
                        firefoxSidebarOpened = true;
                    },
                    setPanel: async () => undefined,
                },
            },
        };

        expect(WebExtensionBrowserBridge.DetectBrowserTarget(firefoxRuntime)).toBe('firefox');
        expect(WebExtensionBrowserBridge.SupportsDebuggerCDP(firefoxRuntime)).toBe(false);
        expect(WebExtensionBrowserBridge.SupportsOffscreenDocument(firefoxRuntime)).toBe(false);
        const firefoxOpen = await WebExtensionBrowserBridge.OpenSidePanel({}, firefoxRuntime);
        expect(firefoxOpen.OpenedVia).toBe('sidebarAction');
        expect(firefoxSidebarOpened).toBe(true);
        const firefoxAudio = await WebExtensionBrowserBridge.EnsureAudioDaemonHost('offscreen.html', firefoxRuntime);
        expect(firefoxAudio.HostMode).toBe('inline-event-page');

        // 3. Safari: action.openPopup with fallback to tabs.create
        let safariTabCreatedUrl = '';
        const safariRuntime: Record<string, unknown> = {
            browser: {
                action: {
                    openPopup: async () => {
                        throw new Error('User gesture required');
                    },
                },
                runtime: {
                    getURL: (p: string) => `safari-web-extension://abc/${p}`,
                },
                tabs: {
                    create: async (opts: { url: string }) => {
                        safariTabCreatedUrl = opts.url;
                    },
                },
            },
        };

        expect(WebExtensionBrowserBridge.DetectBrowserTarget(safariRuntime)).toBe('safari');
        const safariOpen = await WebExtensionBrowserBridge.OpenSidePanel({}, safariRuntime);
        expect(safariOpen.OpenedVia).toBe('tabFallback');
        expect(safariTabCreatedUrl).toBe('safari-web-extension://abc/sidepanel.html');
    });
});
