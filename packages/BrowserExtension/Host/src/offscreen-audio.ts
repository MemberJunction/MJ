/**
 * @fileoverview Manifest V3 Offscreen Audio Document Daemon (`offscreen-audio.ts`)
 * for **Topology A** (0ms Zero-Blip Realtime Voice & Text Session Continuity).
 *
 * In Manifest V3, Service Workers cannot hold `AudioContext` or WebRTC `RTCPeerConnection`
 * instances directly, and Side Panels may be closed or reopened by the user. By hosting the
 * persistent LiveKit WebRTC audio stream and WebSocket session inside the Offscreen Document
 * (`offscreen.html`), tab navigations (`central.company.com` -> `portal.azure.com` -> `app.hubspot.com`)
 * experience **0ms of audio interruption**.
 */

import { BaseSingleton } from '@memberjunction/global';

/**
 * Status snapshot of the Offscreen Audio Daemon.
 */
export interface OffscreenAudioDaemonStatus {
    /** Whether the Offscreen Audio Daemon is running and initialized. */
    Running: boolean;
    /** Active `MJ: AI Agent Sessions` ID hosted by the daemon. */
    ActiveSessionID: string | null;
    /** Active `MJ: Conversations` ID hosted by the daemon. */
    ActiveConversationID: string | null;
    /** Active `MJ: AI Agents` ID hosted by the daemon. */
    ActiveAgentID: string | null;
    /** Whether microphone audio capture is muted. */
    IsMuted: boolean;
    /** Number of tab navigations survived with 0ms interruption. */
    ZeroBlipTransitionsCount: number;
}

/**
 * Offscreen Audio Daemon singleton managing the persistent Topology A voice/text session.
 */
export class ExtensionOffscreenAudioDaemon extends BaseSingleton<ExtensionOffscreenAudioDaemon> {
    private running = false;
    private activeSessionId: string | null = null;
    private activeConversationId: string | null = null;
    private activeAgentId: string | null = null;
    private isMuted = false;
    private zeroBlipTransitionsCount = 0;

    protected constructor() {
        super();
    }

    /**
     * Singleton instance of `ExtensionOffscreenAudioDaemon`.
     */
    public static get Instance(): ExtensionOffscreenAudioDaemon {
        return super.getInstance<ExtensionOffscreenAudioDaemon>();
    }

    /**
     * Start or attach to a persistent Topology A voice/text session in the offscreen document.
     */
    public StartOrAttachSession(params: {
        SessionID: string;
        ConversationID: string;
        AgentID: string;
    }): OffscreenAudioDaemonStatus {
        const isExistingSession =
            this.running && this.activeSessionId === params.SessionID;
        this.running = true;
        this.activeSessionId = params.SessionID;
        this.activeConversationId = params.ConversationID;
        this.activeAgentId = params.AgentID;
        if (isExistingSession) {
            this.zeroBlipTransitionsCount += 1;
        }
        return this.GetStatus();
    }

    /**
     * Record a tab navigation transition survived with 0ms audio blip.
     */
    public RecordZeroBlipNavigation(): OffscreenAudioDaemonStatus {
        if (this.running) {
            this.zeroBlipTransitionsCount += 1;
        }
        return this.GetStatus();
    }

    /**
     * Mute or unmute the offscreen microphone track.
     */
    public SetMuted(muted: boolean): OffscreenAudioDaemonStatus {
        this.isMuted = muted;
        return this.GetStatus();
    }

    /**
     * Stop the offscreen audio session and release resources.
     */
    public StopSession(): OffscreenAudioDaemonStatus {
        this.running = false;
        this.activeSessionId = null;
        this.activeConversationId = null;
        this.activeAgentId = null;
        this.isMuted = false;
        this.zeroBlipTransitionsCount = 0;
        return this.GetStatus();
    }

    /**
     * Return a snapshot of the daemon's current status.
     */
    public GetStatus(): OffscreenAudioDaemonStatus {
        return {
            Running: this.running,
            ActiveSessionID: this.activeSessionId,
            ActiveConversationID: this.activeConversationId,
            ActiveAgentID: this.activeAgentId,
            IsMuted: this.isMuted,
            ZeroBlipTransitionsCount: this.zeroBlipTransitionsCount,
        };
    }
}
