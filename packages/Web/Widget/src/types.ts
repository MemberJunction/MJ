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
    /**
     * Returning-visitor memory toggle for this widget (RememberReturningVisitors). When false (default),
     * the widget sets no durable visitor cookie and does no cross-session linking — fully off.
     */
    rememberReturningVisitors?: boolean;
    /**
     * The durable, opaque visitor anchor (RV3). Present only when rememberReturningVisitors is true:
     * either echoed back from the cookie the client presented, or freshly minted on a first visit.
     * The client persists it as a long-lived first-party cookie and stamps it on Conversation.VisitorKey.
     */
    visitorKey?: string;
    /**
     * The visitor's most-recent prior conversation for this VisitorKey within the widget's application
     * (RV2 chain). Present only on a returning visit; the client stamps it on Conversation.PreviousConversationID.
     */
    previousConversationId?: string;
    /**
     * Resolved polymorphic identity (RV4), present only when a host-identity widget asserted a
     * resolvable identity at mint. The client stamps `(resolvedEntityId, resolvedRecordId)` on the new
     * conversation so memory injection keys off the resolved record rather than the cookie chain.
     */
    resolvedEntityId?: string;
    /** Resolved polymorphic identity record id (RV4); paired with resolvedEntityId. */
    resolvedRecordId?: string;
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
    /** Returning-visitor memory enabled for this widget (gates cookie-set + cross-session linking). */
    rememberReturningVisitors: boolean;
    /** Durable visitor anchor when remembering is on (persisted as a cookie, stamped on Conversation.VisitorKey). */
    visitorKey?: string;
    /** The prior conversation this visit chains from (stamped on Conversation.PreviousConversationID). */
    previousConversationId?: string;
    /** Resolved polymorphic identity entity id (RV4), stamped on Conversation.ResolvedEntityID when set. */
    resolvedEntityId?: string;
    /** Resolved polymorphic identity record id (RV4), stamped on Conversation.ResolvedRecordID when set. */
    resolvedRecordId?: string;
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
