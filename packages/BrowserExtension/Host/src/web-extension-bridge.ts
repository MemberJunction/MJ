/**
 * @fileoverview Cross-Browser WebExtensions Runtime Polyfill (`WebExtensionBrowserBridge`)
 * for Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari.
 *
 * Normalizes the WebExtensions API namespace (`globalThis.browser ?? globalThis.chrome`),
 * abstracts Side Panel / Sidebar / Popup opening across browser engines, and provides
 * an Offscreen Audio Document fallback for Firefox and Safari where `chrome.offscreen`
 * is not present.
 *
 * @module @memberjunction/browser-extension-host
 */

import type { BrowserTarget } from '@memberjunction/browser-extension-core';

/**
 * Strongly-typed cross-browser WebExtensions runtime surface covering Chromium (`chrome`),
 * Firefox (`browser`), and Safari (`browser` / `chrome`).
 */
export interface WebExtensionRuntimeApi {
    sidePanel?: {
        open?: (opts: { windowId?: number; tabId?: number }) => Promise<void>;
        setPanelBehavior?: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
    };
    sidebarAction?: {
        open?: () => Promise<void>;
        setPanel?: (opts: { panel: string }) => Promise<void>;
    };
    action?: {
        openPopup?: () => Promise<void>;
    };
    tabs?: {
        create?: (opts: { url: string; active?: boolean }) => Promise<unknown>;
    };
    runtime?: {
        getURL?: (path: string) => string;
    };
    offscreen?: {
        createDocument?: (opts: {
            url: string;
            reasons: string[];
            justification: string;
        }) => Promise<void>;
        hasDocument?: () => Promise<boolean>;
    };
    debugger?: {
        attach?: (target: { tabId: number }, version: string) => Promise<void>;
        detach?: (target: { tabId: number }) => Promise<void>;
        sendCommand?: (
            target: { tabId: number },
            method: string,
            params?: Record<string, unknown>
        ) => Promise<unknown>;
    };
    permissions?: {
        contains?: (p: { permissions: string[] }) => Promise<boolean>;
        request?: (p: { permissions: string[] }) => Promise<boolean>;
    };
}

/**
 * Result of opening the extension's Side Panel / Sidebar / Popup across browsers.
 */
export interface OpenCrossBrowserSidePanelResult {
    /** Which browser-specific mechanism opened the side panel UI. */
    OpenedVia: 'sidePanel' | 'sidebarAction' | 'actionPopup' | 'tabFallback';
}

/**
 * Result of ensuring the Topology A Audio Daemon host is ready.
 */
export interface EnsureAudioDaemonHostResult {
    /**
     * `'offscreen-document'` on Chromium (`chrome` / `edge`) where `chrome.offscreen` exists,
     * or `'inline-event-page'` on Firefox / Safari where audio runs directly in the background/sidepanel context.
     */
    HostMode: 'offscreen-document' | 'inline-event-page';
}

/**
 * Cross-browser WebExtensions polyfill and capability bridge (`chrome`, `edge`, `firefox`, `safari`).
 */
export class WebExtensionBrowserBridge {
    /**
     * Resolves the active WebExtensions API namespace via `globalObj.browser ?? globalObj.chrome`.
     */
    public static ResolveApi(runtimeGlobal?: Record<string, unknown>): WebExtensionRuntimeApi | undefined {
        const g = runtimeGlobal ?? (globalThis as Record<string, unknown>);
        const browserObj = g['browser'] as WebExtensionRuntimeApi | undefined;
        const chromeObj = g['chrome'] as WebExtensionRuntimeApi | undefined;
        return browserObj ?? chromeObj;
    }

    /**
     * Detects the current browser target family from the available WebExtensions APIs.
     */
    public static DetectBrowserTarget(runtimeGlobal?: Record<string, unknown>): BrowserTarget {
        const api = this.ResolveApi(runtimeGlobal);
        if (api?.sidebarAction) {
            return 'firefox';
        }
        if (api?.sidePanel) {
            return 'chrome';
        }
        return 'safari';
    }

    /**
     * Returns `true` when the current browser runtime exposes `chrome.debugger` CDP 1.3.
     * Returns `false` on Firefox and Safari.
     */
    public static SupportsDebuggerCDP(runtimeGlobal?: Record<string, unknown>): boolean {
        const api = this.ResolveApi(runtimeGlobal);
        return Boolean(api?.debugger?.attach);
    }

    /**
     * Returns `true` when the current browser runtime exposes `chrome.offscreen.createDocument`.
     */
    public static SupportsOffscreenDocument(runtimeGlobal?: Record<string, unknown>): boolean {
        const api = this.ResolveApi(runtimeGlobal);
        return Boolean(api?.offscreen?.createDocument);
    }

    /**
     * Configures the browser's toolbar action click behavior to open the Side Panel / Sidebar.
     * - Chromium (`chrome` / `edge`): `extApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
     * - Firefox (`firefox`): `extApi.sidebarAction.setPanel({ panel: 'sidepanel.html' })`
     * - Safari (`safari`): handled declaratively via `action.default_popup` in `manifest.json`
     */
    public static async ConfigureSidePanelBehavior(
        panelPath = 'sidepanel.html',
        runtimeGlobal?: Record<string, unknown>
    ): Promise<void> {
        const api = this.ResolveApi(runtimeGlobal);
        try {
            if (api?.sidePanel?.setPanelBehavior) {
                await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
                return;
            }
            if (api?.sidebarAction?.setPanel) {
                await api.sidebarAction.setPanel({ panel: panelPath });
            }
        } catch {
            // Ignore in headless/non-extension test environments
        }
    }

    /**
     * Opens the extension Side Panel / Sidebar / Popup across Chrome, Edge, Firefox, and Safari:
     * - Chromium (`chrome` / `edge`): `extApi.sidePanel.open({ windowId })`
     * - Firefox (`firefox`): `extApi.sidebarAction.open()`
     * - Safari (`safari`): `extApi.action?.openPopup?.()` with fallback to `extApi.tabs.create({ url })`
     */
    public static async OpenSidePanel(
        options?: { WindowId?: number; PanelPath?: string },
        runtimeGlobal?: Record<string, unknown>
    ): Promise<OpenCrossBrowserSidePanelResult> {
        const api = this.ResolveApi(runtimeGlobal);
        const panelPath = options?.PanelPath ?? 'sidepanel.html';

        if (api?.sidePanel?.open) {
            await api.sidePanel.open({ windowId: options?.WindowId });
            return { OpenedVia: 'sidePanel' };
        }

        if (api?.sidebarAction?.open) {
            await api.sidebarAction.open();
            return { OpenedVia: 'sidebarAction' };
        }

        if (api?.action?.openPopup) {
            try {
                await api.action.openPopup();
                return { OpenedVia: 'actionPopup' };
            } catch {
                // Fall through to tab fallback if Safari blocks programmatic openPopup outside user gesture
            }
        }

        if (api?.tabs?.create) {
            const resolvedUrl = api.runtime?.getURL ? api.runtime.getURL(panelPath) : panelPath;
            await api.tabs.create({ url: resolvedUrl, active: true });
            return { OpenedVia: 'tabFallback' };
        }

        return { OpenedVia: 'tabFallback' };
    }

    /**
     * Ensures the Topology A Audio Daemon host is ready:
     * - On Chromium (`chrome` / `edge`): creates `offscreen.html` via `extApi.offscreen.createDocument` if not already open.
     * - On Firefox / Safari (where `extApi.offscreen` is absent): executes audio session management directly in the event page / side panel without throwing.
     */
    public static async EnsureAudioDaemonHost(
        offscreenPath = 'offscreen.html',
        runtimeGlobal?: Record<string, unknown>
    ): Promise<EnsureAudioDaemonHostResult> {
        const api = this.ResolveApi(runtimeGlobal);
        if (api?.offscreen?.createDocument) {
            try {
                const alreadyExists = api.offscreen.hasDocument ? await api.offscreen.hasDocument() : false;
                if (!alreadyExists) {
                    await api.offscreen.createDocument({
                        url: offscreenPath,
                        reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
                        justification: 'Maintain 0ms zero-blip MemberJunction voice session across tab navigations.',
                    });
                }
            } catch {
                // Document may already exist
            }
            return { HostMode: 'offscreen-document' };
        }

        return { HostMode: 'inline-event-page' };
    }
}
