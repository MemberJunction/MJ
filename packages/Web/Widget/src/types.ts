/**
 * @fileoverview Shared types for the public web widget bundle.
 * @module @memberjunction/web-widget
 */

/** Modalities a widget instance may expose (mirrors the WidgetInstance.Modality column). */
export type WidgetModality = 'Text' | 'Voice' | 'Both';

/**
 * The successful response shape from `POST /widget/session` (see
 * `WidgetSessionService.MintGuestSession` in MJServer). Mirrors `MintGuestSessionResult`.
 */
export interface WidgetSessionResponse {
    success: boolean;
    token?: string;
    expiresAt?: string;
    widgetId?: string;
    applicationId?: string;
    /** The pinned support agent the widget passes as explicitAgentId for every turn (D5). */
    pinnedAgentId?: string;
    modality?: WidgetModality;
    /** Opaque per-session id; stamped onto Conversation.ExternalID so the Widget Guest RLS filters isolate this guest. */
    sessionId?: string;
    /** Optional hard ceiling (minutes) on a voice session for this widget (server default applies when absent). */
    voiceMaxSessionMinutes?: number;
    error?: string;
    errorCode?: string;
}

/** Resolved, validated session a widget instance holds in memory after minting. */
export interface WidgetSession {
    token: string;
    expiresAtMs: number;
    widgetId: string;
    applicationId: string;
    pinnedAgentId: string;
    modality: WidgetModality;
    /** Opaque per-session id; stamped onto Conversation.ExternalID for per-guest RLS isolation. */
    sessionId: string;
    /** Optional hard ceiling (minutes) on a voice session — the authoritative limit for the voice-abuse guard. */
    voiceMaxSessionMinutes?: number;
}

/** Options the host page supplies (via data-attributes or the programmatic API). */
export interface WidgetMountOptions {
    /** The public widget key (pk_live_…). */
    widgetKey: string;
    /** Base URL of MJAPI (e.g. https://api.yourco.com). */
    apiUrl: string;
    /** Element (or selector) to mount into. When omitted, a floating launcher is appended to <body>. */
    mountTarget?: HTMLElement | string;
    /** Optional UI title shown in the widget header. */
    title?: string;
    /** Optional greeting shown in the empty state. */
    greeting?: string;
}

/** A single chat message rendered in the widget transcript. */
export interface WidgetChatMessage {
    role: 'user' | 'agent' | 'system';
    text: string;
    /** Epoch ms; used for ordering + display. */
    timestampMs: number;
}
