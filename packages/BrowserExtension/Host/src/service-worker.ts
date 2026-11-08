/**
 * @fileoverview Manifest V3 Service Worker Runtime (`service-worker.ts`) for the
 * MemberJunction Browser Extension.
 *
 * Responsibilities:
 * 1. Configures `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
 * 2. Handles `externally_connectable` messages (`MJ_EXT_PING`, `MJ_EXT_SESSION_HANDOFF`,
 *    `MJ_EXT_START_SHARED_DAEMON`, `MJ_EXT_LAUNCH_PLAYBOOK`) from MJ Central / MJ Explorer.
 * 3. Manages the Offscreen Audio Document (`offscreen.html`) for Topology A 0ms zero-blip
 *    voice continuity across tab navigations.
 * 4. Provides `ChromeDebuggerServiceWorkerTransport` (`IChromeDebuggerTransport`) for Mode 2
 *    (`'debugger-cdp'`) and Mode 3 (`'auto'`) with on-demand `chrome.permissions.request({ permissions: ['debugger'] })`.
 */

import { BaseSingleton } from '@memberjunction/global';
import {
    ExtensionSessionHandoffAck,
    ExtensionSessionHandoffCoordinator,
    ExtensionSessionHandoffPayload,
    IChromeDebuggerTransport,
} from '@memberjunction/browser-extension-core';
import { ExtensionOffscreenAudioDaemon } from './offscreen-audio.js';

/**
 * External message sent by MJ Central / MJ Explorer over `chrome.runtime.sendMessage(extensionId, msg)`.
 */
export interface ServiceWorkerExternalMessage {
    /** Message discriminator. */
    Type:
        | 'MJ_EXT_PING'
        | 'MJ_EXT_SESSION_HANDOFF'
        | 'MJ_EXT_START_SHARED_DAEMON'
        | 'MJ_EXT_LAUNCH_PLAYBOOK';
    /** Optional session handoff payload. */
    Payload?: ExtensionSessionHandoffPayload;
}

/**
 * Production `IChromeDebuggerTransport` backed by `chrome.debugger` (CDP 1.3) and
 * on-demand `chrome.permissions.request({ permissions: ['debugger'] })`.
 */
export class ChromeDebuggerServiceWorkerTransport implements IChromeDebuggerTransport {
    private readonly attachedTabs = new Set<number>();

    /**
     * Request optional `"debugger"` permission if not already granted and attach CDP 1.3 to `tabId`.
     */
    public async Attach(tabId: number): Promise<void> {
        if (this.attachedTabs.has(tabId)) {
            return;
        }
        const chromeObj = this.getChromeApi();
        if (chromeObj?.permissions?.contains && chromeObj.permissions.request) {
            const hasPerm = await chromeObj.permissions.contains({ permissions: ['debugger'] });
            if (!hasPerm) {
                const granted = await chromeObj.permissions.request({ permissions: ['debugger'] });
                if (!granted) {
                    throw new Error('User declined optional "debugger" permission for Mode 2 CDP Power Mode.');
                }
            }
        }
        if (chromeObj?.debugger?.attach) {
            await chromeObj.debugger.attach({ tabId }, '1.3');
        }
        this.attachedTabs.add(tabId);
    }

    /**
     * Detach CDP 1.3 from `tabId`.
     */
    public async Detach(tabId: number): Promise<void> {
        if (!this.attachedTabs.has(tabId)) {
            return;
        }
        const chromeObj = this.getChromeApi();
        if (chromeObj?.debugger?.detach) {
            try {
                await chromeObj.debugger.detach({ tabId });
            } catch {
                // Ignore if tab closed or already detached
            }
        }
        this.attachedTabs.delete(tabId);
    }

    /**
     * Check whether `tabId` currently has CDP 1.3 attached.
     */
    public IsAttached(tabId: number): boolean {
        return this.attachedTabs.has(tabId);
    }

    /**
     * Send a CDP 1.3 command to `tabId`.
     */
    public async SendCommand<TResult = Record<string, unknown>>(
        tabId: number,
        method: string,
        params?: Record<string, unknown>
    ): Promise<TResult> {
        const chromeObj = this.getChromeApi();
        if (!chromeObj?.debugger?.sendCommand) {
            throw new Error('chrome.debugger.sendCommand is not available in this context.');
        }
        return chromeObj.debugger.sendCommand({ tabId }, method, params) as Promise<TResult>;
    }

    private getChromeApi():
        | {
              permissions?: {
                  contains?: (p: { permissions: string[] }) => Promise<boolean>;
                  request?: (p: { permissions: string[] }) => Promise<boolean>;
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
          }
        | undefined {
        const globalObj = globalThis as Record<string, unknown>;
        return globalObj['chrome'] as ReturnType<ChromeDebuggerServiceWorkerTransport['getChromeApi']>;
    }
}

/**
 * Manifest V3 Service Worker runtime singleton coordinating Side Panel opening,
 * `externally_connectable` session handoffs, Offscreen Audio lifecycle, and CDP debugger transport.
 */
export class ExtensionServiceWorkerRuntime extends BaseSingleton<ExtensionServiceWorkerRuntime> {
    public readonly DebuggerTransport = new ChromeDebuggerServiceWorkerTransport();
    private brandSlug = 'mj-copilot';
    private version = '6.2.0';

    protected constructor() {
        super();
    }

    /**
     * Singleton instance of `ExtensionServiceWorkerRuntime`.
     */
    public static get Instance(): ExtensionServiceWorkerRuntime {
        return super.getInstance<ExtensionServiceWorkerRuntime>();
    }

    /**
     * Configure brand metadata and register Chrome Service Worker listeners.
     */
    public Initialize(config?: { BrandSlug?: string; Version?: string }): void {
        if (config?.BrandSlug) {
            this.brandSlug = config.BrandSlug;
        }
        if (config?.Version) {
            this.version = config.Version;
        }

        const coordinator = ExtensionSessionHandoffCoordinator.Instance;
        coordinator.Configure({
            ExtensionVersion: this.version,
            BrandSlug: this.brandSlug,
            SidePanelOpener: {
                OpenSidePanel: async (windowId?: number) => this.openBrowserSidePanel(windowId),
                ResumeSessionWithContinuity: async (payload) => ({
                    NewSessionID: `${payload.SessionID}-resumed`,
                }),
            },
        });

        this.configureSidePanelBehavior();
    }

    /**
     * Handle an incoming `externally_connectable` message from MJ Central or MJ Explorer.
     */
    public async HandleExternalMessage(
        message: ServiceWorkerExternalMessage
    ): Promise<
        | {
              Installed: true;
              Version: string;
              BrandSlug: string;
              ActiveTopology: string;
          }
        | ExtensionSessionHandoffAck
    > {
        const coordinator = ExtensionSessionHandoffCoordinator.Instance;

        if (message.Type === 'MJ_EXT_PING') {
            return {
                Installed: true,
                Version: this.version,
                BrandSlug: this.brandSlug,
                ActiveTopology: coordinator.CurrentState.Topology,
            };
        }

        const payload = message.Payload;
        if (!payload) {
            return {
                Accepted: false,
                ActiveTopology: 'topology-a-shared-daemon',
                ZeroBlipGuaranteed: false,
                ExtensionVersion: this.version,
                BrandSlug: this.brandSlug,
                ErrorMessage: 'Missing ExtensionSessionHandoffPayload in external message.',
            };
        }

        if (
            message.Type === 'MJ_EXT_START_SHARED_DAEMON' ||
            payload.Topology === 'topology-a-shared-daemon'
        ) {
            ExtensionOffscreenAudioDaemon.Instance.StartOrAttachSession({
                SessionID: payload.SessionID,
                ConversationID: payload.ConversationID,
                AgentID: payload.AgentID,
            });
            coordinator.StartTopologyASharedDaemon({
                SessionID: payload.SessionID,
                ConversationID: payload.ConversationID,
                AgentID: payload.AgentID,
                HostOrigin: payload.HostOrigin,
            });
        }

        return coordinator.HandleExternalHandoffRequest(payload);
    }

    private configureSidePanelBehavior(): void {
        const globalObj = globalThis as Record<string, unknown>;
        const chromeObj = globalObj['chrome'] as
            | {
                  sidePanel?: {
                      setPanelBehavior?: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
                  };
              }
            | undefined;

        try {
            void chromeObj?.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
        } catch {
            // Ignore in test environments without chrome.sidePanel
        }
    }

    private async openBrowserSidePanel(windowId?: number): Promise<boolean> {
        const globalObj = globalThis as Record<string, unknown>;
        const chromeObj = globalObj['chrome'] as
            | {
                  sidePanel?: {
                      open?: (opts: { windowId?: number }) => Promise<void>;
                  };
              }
            | undefined;

        if (chromeObj?.sidePanel?.open) {
            await chromeObj.sidePanel.open({ windowId });
        }
        return true;
    }
}
