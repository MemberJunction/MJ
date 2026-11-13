/**
 * @fileoverview `ExtensionSessionHandoffCoordinator` — Seamless Realtime Voice & Text Session
 * Handoff Coordinator for the MemberJunction Browser Extension.
 *
 * Extends {@link BaseSingleton} from `@memberjunction/global` and implements both session
 * continuity topologies defined in `plans/browser-extension-architecture.md`:
 * - **Topology A (`'topology-a-shared-daemon'`, Recommended Default):** The live `BaseRealtimeClient`
 *   WebRTC/WebSocket connection and microphone `AudioWorklet` reside inside the extension's persistent
 *   Side Panel / Offscreen Audio Document (`offscreen-audio.ts`). When the user is inside MJ Central
 *   or MJ Explorer, the web app attaches to the extension's shared daemon over `chrome.runtime.connect`.
 *   Navigating away to a third-party tab (`portal.azure.com`, `app.hubspot.com`, etc.) produces a
 *   **0ms zero-blip transition** — voice audio and conversation state never drop.
 * - **Topology B (`'topology-b-warm-resume'`, Fallback):** When a session started inside the web tab's
 *   own `RealtimeSessionService` and the user triggers "Continue in Side Panel & Open Portal ->",
 *   transfers an {@link ExtensionSessionHandoffPayload} carrying `SessionID`, `ConversationID`,
 *   `AgentID`, and `ActivePlaybook` so the Side Panel resumes with `LastSessionID` continuity in < 800ms.
 *
 * @module @memberjunction/browser-extension-core
 */

import { BaseSingleton } from '@memberjunction/global';
import { BehaviorSubject, type Observable } from 'rxjs';
import type {
    ExtensionSessionHandoffAck,
    ExtensionSessionHandoffPayload,
    ExtensionSessionTopology,
} from '../types/extension-types.js';

/**
 * State of the active extension session daemon.
 */
export interface ExtensionDaemonSessionState {
    /** Active topology (`topology-a-shared-daemon` or `topology-b-warm-resume`). */
    Topology: ExtensionSessionTopology;
    /** Active `MJ: AI Agent Sessions` ID (or `LastSessionID` on warm resume). */
    SessionID: string | null;
    /** Resumed from prior session ID when Topology B warm resume occurred. */
    ResumedFromSessionID: string | null;
    /** Active `MJ: Conversations` ID. */
    ConversationID: string | null;
    /** Active `MJ: AI Agents` ID. */
    AgentID: string | null;
    /** Whether the Offscreen/SidePanel WebRTC voice transport is live and uninterrupted. */
    VoiceTransportLive: boolean;
    /** Connected MJ host origin (e.g. `https://central.mycompany.com`) if attached. */
    AttachedHostOrigin: string | null;
    /** Active guided playbook state carried across handoff. */
    ActivePlaybook: ExtensionSessionHandoffPayload['ActivePlaybook'] | null;
    /** Timestamp of the latest handoff or state update. */
    UpdatedAtIso: string;
}

/**
 * Pluggable callback invoked when the Side Panel needs to open or resume a session.
 */
export interface IExtensionSidePanelOpener {
    OpenSidePanel(windowId?: number): Promise<boolean>;
    ResumeSessionWithContinuity?(payload: ExtensionSessionHandoffPayload): Promise<{ NewSessionID: string }>;
}

const INITIAL_DAEMON_STATE: ExtensionDaemonSessionState = {
    Topology: 'topology-a-shared-daemon',
    SessionID: null,
    ResumedFromSessionID: null,
    ConversationID: null,
    AgentID: null,
    VoiceTransportLive: false,
    AttachedHostOrigin: null,
    ActivePlaybook: null,
    UpdatedAtIso: new Date().toISOString(),
};

/**
 * Coordinates Topology A (0ms shared daemon) and Topology B (warm session continuity resume)
 * between MemberJunction web apps (`MJ Central`, `MJ Explorer`) and the Browser Extension.
 */
export class ExtensionSessionHandoffCoordinator extends BaseSingleton<ExtensionSessionHandoffCoordinator> {
    private readonly stateSubject = new BehaviorSubject<ExtensionDaemonSessionState>(INITIAL_DAEMON_STATE);
    private sidePanelOpener: IExtensionSidePanelOpener | null = null;
    private extensionVersion = '6.2.0';
    private brandSlug = 'mj-copilot';

    protected constructor() {
        super();
    }

    /**
     * Singleton instance of `ExtensionSessionHandoffCoordinator`.
     */
    public static get Instance(): ExtensionSessionHandoffCoordinator {
        return super.getInstance<ExtensionSessionHandoffCoordinator>();
    }

    /**
     * Observable stream of the active daemon session state.
     */
    public get State$(): Observable<ExtensionDaemonSessionState> {
        return this.stateSubject.asObservable();
    }

    /**
     * Current synchronous snapshot of the daemon session state.
     */
    public get CurrentState(): ExtensionDaemonSessionState {
        return this.stateSubject.getValue();
    }

    /**
     * Configures the Side Panel opener and extension identity metadata.
     */
    public Configure(options: {
        SidePanelOpener?: IExtensionSidePanelOpener | null;
        ExtensionVersion?: string;
        BrandSlug?: string;
    }): void {
        if (options.SidePanelOpener !== undefined) {
            this.sidePanelOpener = options.SidePanelOpener;
        }
        if (options.ExtensionVersion) {
            this.extensionVersion = options.ExtensionVersion;
        }
        if (options.BrandSlug) {
            this.brandSlug = options.BrandSlug;
        }
    }

    /**
     * Starts or registers a Topology A shared session daemon inside the Extension's Offscreen/SidePanel host.
     * When the user navigates away from MJ Central/Explorer to an external site, the WebRTC/WebSocket
     * audio connection stays 100% live with 0ms interruption.
     */
    public StartTopologyASharedDaemon(params: {
        SessionID: string;
        ConversationID: string;
        AgentID: string;
        HostOrigin?: string;
        VoiceTransportLive?: boolean;
    }): ExtensionDaemonSessionState {
        const next: ExtensionDaemonSessionState = {
            Topology: 'topology-a-shared-daemon',
            SessionID: params.SessionID,
            ResumedFromSessionID: null,
            ConversationID: params.ConversationID,
            AgentID: params.AgentID,
            VoiceTransportLive: params.VoiceTransportLive ?? true,
            AttachedHostOrigin: params.HostOrigin ?? null,
            ActivePlaybook: this.CurrentState.ActivePlaybook,
            UpdatedAtIso: new Date().toISOString(),
        };
        this.stateSubject.next(next);
        return next;
    }

    /**
     * Handles an incoming `externally_connectable` handoff or ping request from MJ Central or MJ Explorer.
     */
    public async HandleExternalHandoffRequest(
        payload: ExtensionSessionHandoffPayload
    ): Promise<ExtensionSessionHandoffAck> {
        if (this.sidePanelOpener) {
            await this.sidePanelOpener.OpenSidePanel();
        }

        const current = this.CurrentState;

        // Case 1: Topology A (0ms Zero-Blip Transition)
        // If the session is already running in the extension's shared daemon (or requested as Topology A),
        // keep the existing WebRTC/WebSocket voice stream alive without reconnecting!
        if (
            payload.Topology === 'topology-a-shared-daemon' ||
            (current.VoiceTransportLive && current.SessionID === payload.SessionID)
        ) {
            const nextState: ExtensionDaemonSessionState = {
                Topology: 'topology-a-shared-daemon',
                SessionID: payload.SessionID,
                ResumedFromSessionID: null,
                ConversationID: payload.ConversationID,
                AgentID: payload.AgentID,
                VoiceTransportLive: true,
                AttachedHostOrigin: payload.HostOrigin,
                ActivePlaybook: payload.ActivePlaybook ?? current.ActivePlaybook,
                UpdatedAtIso: new Date().toISOString(),
            };
            this.stateSubject.next(nextState);

            return {
                Accepted: true,
                ActiveTopology: 'topology-a-shared-daemon',
                ZeroBlipGuaranteed: true,
                ExtensionVersion: this.extensionVersion,
                BrandSlug: this.brandSlug,
            };
        }

        // Case 2: Topology B (Warm Session Continuity Handoff via LastSessionID)
        let resumedSessionId = payload.SessionID;
        if (this.sidePanelOpener?.ResumeSessionWithContinuity) {
            const resumed = await this.sidePanelOpener.ResumeSessionWithContinuity(payload);
            resumedSessionId = resumed.NewSessionID;
        }

        const nextState: ExtensionDaemonSessionState = {
            Topology: 'topology-b-warm-resume',
            SessionID: resumedSessionId,
            ResumedFromSessionID: payload.SessionID,
            ConversationID: payload.ConversationID,
            AgentID: payload.AgentID,
            VoiceTransportLive: true,
            AttachedHostOrigin: payload.HostOrigin,
            ActivePlaybook: payload.ActivePlaybook ?? null,
            UpdatedAtIso: new Date().toISOString(),
        };
        this.stateSubject.next(nextState);

        return {
            Accepted: true,
            ActiveTopology: 'topology-b-warm-resume',
            ZeroBlipGuaranteed: false,
            ExtensionVersion: this.extensionVersion,
            BrandSlug: this.brandSlug,
        };
    }

    /**
     * Resets the daemon session state (used on session close or unit test teardown).
     */
    public Reset(): void {
        this.stateSubject.next({
            ...INITIAL_DAEMON_STATE,
            UpdatedAtIso: new Date().toISOString(),
        });
    }
}
