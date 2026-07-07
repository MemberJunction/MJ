/**
 * @fileoverview The voice seam. The UI element depends only on this interface, so the
 * voice affordance is unit-testable with a mock and decoupled from the realtime client
 * + mint wiring. The real implementation (`RealtimeVoiceController`) reuses
 * `@memberjunction/ai-realtime-client` (client-direct topology) — no new driver.
 *
 * @module @memberjunction/realtime-widget
 */

/** Coarse voice UI state surfaced to the widget. */
export type WidgetVoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'error';

/** A transcript line delivered to the widget while voice is active. */
export interface WidgetVoiceTranscript {
    role: 'user' | 'agent';
    text: string;
    isFinal: boolean;
}

/** Callbacks the widget supplies when starting voice. */
export interface VoiceControllerCallbacks {
    onState: (state: WidgetVoiceState) => void;
    onTranscript: (transcript: WidgetVoiceTranscript) => void;
    /** Called when the session ends (incl. an abuse-ceiling abort), with an optional reason. */
    onEnded: (reason?: string) => void;
    /**
     * Reveals (and returns) the demonstration-surface host element for an interactive channel the agent
     * just engaged, so the channel can render into it inside the widget's shadow DOM. Called the first
     * time a channel's tool fires. Omitted when the widget exposes no channel surface.
     */
    getChannelSurface?: (channelName: string, title: string) => HTMLElement;
}

/** Starts/stops a client-direct voice session with the pinned agent. */
export interface IVoiceController {
    /** Begins a voice session (mints, connects, acquires mic, enforces ceilings). */
    Start(callbacks: VoiceControllerCallbacks): Promise<void>;
    /** Ends the active voice session. */
    Stop(): Promise<void>;
    /** Whether a voice session is currently active. */
    readonly IsActive: boolean;
}
