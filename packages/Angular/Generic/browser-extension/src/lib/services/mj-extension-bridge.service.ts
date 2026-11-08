/**
 * @fileoverview Angular service for communicating between MJ web applications
 * (MJ Central, MJ Explorer) and the MemberJunction Browser Extension via
 * Chrome's `externally_connectable` messaging protocol.
 *
 * Supports:
 * - Extension presence & capability detection (`PingExtension`)
 * - Topology A (0ms zero-blip shared Extension Offscreen/SidePanel session daemon)
 * - Topology B (Warm mid-session handoff with `LastSessionID` continuity)
 * - Launching Guided Cross-Site Playbooks (e.g., HubSpot OAuth, Microsoft Entra ID)
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
    ExtensionSessionHandoffAck,
    ExtensionSessionHandoffPayload,
    ExtensionSessionTopology,
} from '@memberjunction/browser-extension-core';

/**
 * Envelope sent from an MJ web application to the Extension Service Worker
 * over `chrome.runtime.sendMessage(extensionId, message)`.
 */
export interface ExtensionExternalMessageRequest {
    /** Message discriminator. */
    Type: 'MJ_EXT_PING' | 'MJ_EXT_SESSION_HANDOFF' | 'MJ_EXT_START_SHARED_DAEMON' | 'MJ_EXT_LAUNCH_PLAYBOOK';
    /** Optional session handoff payload. */
    Payload?: ExtensionSessionHandoffPayload;
}

/**
 * Ping response returned by the Extension Service Worker when probed by an MJ web application.
 */
export interface ExtensionPingResponse {
    /** Whether the extension responded and is ready. */
    Installed: boolean;
    /** Installed extension version string. */
    Version: string;
    /** Active brand slug (`'mj-copilot'`, `'betty'`, `'sidecar'`, etc.). */
    BrandSlug: string;
    /** Active session topology if a daemon is already running. */
    ActiveTopology?: ExtensionSessionTopology;
}

/**
 * Pluggable transport abstraction for `chrome.runtime.sendMessage(extensionId, message)`.
 */
export interface IMJExtensionExternalTransport {
    /**
     * Send an external message to the target Chrome Extension ID.
     */
    SendExternalMessage<TResponse>(
        extensionId: string,
        message: ExtensionExternalMessageRequest
    ): Promise<TResponse>;
}

/**
 * Angular service that bridges MJ web applications (MJ Central, MJ Explorer)
 * with the MemberJunction Browser Extension.
 */
@Injectable({
    providedIn: 'root',
})
export class MJExtensionBridgeService {
    private _transport: IMJExtensionExternalTransport | null = null;
    private readonly _isConnected$ = new BehaviorSubject<boolean>(false);
    private readonly _lastPing$ = new BehaviorSubject<ExtensionPingResponse | null>(null);
    private readonly _lastHandoffAck$ = new BehaviorSubject<ExtensionSessionHandoffAck | null>(null);

    /**
     * Observable emitting `true` when a compatible MJ Browser Extension is detected and reachable.
     */
    public get IsExtensionConnected$(): Observable<boolean> {
        return this._isConnected$.asObservable();
    }

    /**
     * Synchronous snapshot of whether the extension is currently connected.
     */
    public get IsExtensionConnected(): boolean {
        return this._isConnected$.value;
    }

    /**
     * Observable emitting the latest ping response from the extension.
     */
    public get LastPing$(): Observable<ExtensionPingResponse | null> {
        return this._lastPing$.asObservable();
    }

    /**
     * Observable emitting the latest session handoff acknowledgment.
     */
    public get LastHandoffAck$(): Observable<ExtensionSessionHandoffAck | null> {
        return this._lastHandoffAck$.asObservable();
    }

    /**
     * Configure a custom external transport (used in unit tests or non-Chrome hosts).
     */
    public SetTransport(transport: IMJExtensionExternalTransport): void {
        this._transport = transport;
    }

    /**
     * Probe whether the MJ Browser Extension with the given `extensionId` is installed
     * and reachable via `externally_connectable`.
     *
     * @param extensionId - Chrome Extension ID to probe.
     */
    public async PingExtension(extensionId: string): Promise<ExtensionPingResponse> {
        try {
            const response = await this.sendMessage<ExtensionPingResponse>(extensionId, {
                Type: 'MJ_EXT_PING',
            });
            const installed = Boolean(response && response.Installed);
            this._isConnected$.next(installed);
            if (installed) {
                this._lastPing$.next(response);
                return response;
            }
        } catch {
            // Extension not installed or origin not in externally_connectable
        }
        const fallback: ExtensionPingResponse = {
            Installed: false,
            Version: '',
            BrandSlug: '',
        };
        this._isConnected$.next(false);
        this._lastPing$.next(fallback);
        return fallback;
    }

    /**
     * Request a seamless session handoff to the Browser Extension Side Panel.
     *
     * - When `payload.Topology === 'topology-a-shared-daemon'`, the extension opens the
     *   Side Panel attached to the shared Offscreen/SidePanel LiveKit + WebSocket daemon
     *   with **0ms zero audio/text interruption**.
     * - When `payload.Topology === 'topology-b-warm-resume'`, the extension opens the
     *   Side Panel and immediately reconnects with `LastSessionID = payload.SessionID`
     *   to preserve transcript & agent context.
     *
     * @param extensionId - Target Chrome Extension ID.
     * @param payload - Session handoff descriptor.
     */
    public async RequestSessionHandoff(
        extensionId: string,
        payload: ExtensionSessionHandoffPayload
    ): Promise<ExtensionSessionHandoffAck> {
        try {
            const ack = await this.sendMessage<ExtensionSessionHandoffAck>(extensionId, {
                Type: 'MJ_EXT_SESSION_HANDOFF',
                Payload: payload,
            });
            this._lastHandoffAck$.next(ack);
            return ack;
        } catch (err) {
            const failedAck: ExtensionSessionHandoffAck = {
                Accepted: false,
                ActiveTopology: payload.Topology,
                ZeroBlipGuaranteed: false,
                ExtensionVersion: '',
                BrandSlug: '',
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
            this._lastHandoffAck$.next(failedAck);
            return failedAck;
        }
    }

    /**
     * Launch a Guided Cross-Site Playbook (e.g., HubSpot OAuth setup or Microsoft Entra ID
     * App Registration) in the Browser Extension Side Panel while keeping the user's
     * active voice/text conversation alive.
     *
     * @param extensionId - Target Chrome Extension ID.
     * @param params - Playbook launch and session parameters.
     */
    public async LaunchGuidedPlaybook(
        extensionId: string,
        params: {
            PlaybookID: string;
            TargetUrl: string;
            SessionID: string;
            ConversationID: string;
            AgentID: string;
            HostOrigin: string;
            Topology?: ExtensionSessionTopology;
        }
    ): Promise<ExtensionSessionHandoffAck> {
        const payload: ExtensionSessionHandoffPayload = {
            Topology: params.Topology ?? 'topology-a-shared-daemon',
            SessionID: params.SessionID,
            ConversationID: params.ConversationID,
            AgentID: params.AgentID,
            HostOrigin: params.HostOrigin,
            ActivePlaybook: {
                PlaybookID: params.PlaybookID,
                StepIndex: 0,
                TargetUrl: params.TargetUrl,
            },
        };
        return this.RequestSessionHandoff(extensionId, payload);
    }

    private async sendMessage<TResponse>(
        extensionId: string,
        message: ExtensionExternalMessageRequest
    ): Promise<TResponse> {
        if (this._transport) {
            return this._transport.SendExternalMessage<TResponse>(extensionId, message);
        }

        const globalObj = globalThis as Record<string, unknown>;
        const chromeObj = globalObj['chrome'] as
            | {
                  runtime?: {
                      sendMessage?: (
                          extId: string,
                          msg: ExtensionExternalMessageRequest,
                          callback: (res: TResponse) => void
                      ) => void;
                      lastError?: { message?: string };
                  };
              }
            | undefined;

        if (!chromeObj?.runtime?.sendMessage) {
            throw new Error('Chrome runtime external messaging API is not available in this browser context.');
        }

        const sendFn = chromeObj.runtime.sendMessage;
        return new Promise<TResponse>((resolve, reject) => {
            sendFn(extensionId, message, (response: TResponse) => {
                const lastErr = chromeObj.runtime?.lastError;
                if (lastErr?.message) {
                    reject(new Error(lastErr.message));
                    return;
                }
                resolve(response);
            });
        });
    }
}
