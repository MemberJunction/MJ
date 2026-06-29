/**
 * @fileoverview Mints + refreshes the guest session by calling MJAPI's public
 * `POST /widget/session` endpoint. The token is auth state (not a user preference),
 * so holding it in memory / sessionStorage is acceptable (CLAUDE rule 9) — but this
 * client keeps it only in memory and refreshes before expiry.
 *
 * @module @memberjunction/web-widget
 */

import type { WidgetModality, WidgetSession, WidgetSessionResponse } from '../types.js';

/** Injectable fetch so the client is unit-testable without a network. Defaults to global fetch. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;

/** How early (ms before expiry) to proactively refresh the guest token. */
const REFRESH_LEAD_MS = 60_000;

/**
 * Talks to the widget guest-session endpoints. One instance per mounted widget.
 */
export class WidgetSessionClient {
    private readonly fetchImpl: FetchLike;

    constructor(
        private readonly apiUrl: string,
        private readonly widgetKey: string,
        fetchImpl?: FetchLike,
    ) {
        // happy fallback to the platform fetch; explicit in tests.
        this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init) as unknown as ReturnType<FetchLike>);
    }

    /**
     * Mints a fresh guest session. Throws on a non-2xx / unsuccessful response.
     * @param visitorKey the durable returning-visitor anchor from the first-party cookie, if present —
     *   the server uses it to chain this visit to the visitor's prior conversation (gated on the widget's
     *   RememberReturningVisitors toggle). Omit on a first visit; the server mints one when remembering is on.
     */
    public async Mint(visitorKey?: string): Promise<WidgetSession> {
        return this.call('/widget/session', visitorKey);
    }

    /** Refreshes the guest session (server re-mints by the same key). Carries the visitor anchor so the
     *  refreshed session keeps the same returning-visitor identity. */
    public async Refresh(visitorKey?: string): Promise<WidgetSession> {
        return this.call('/widget/session/refresh', visitorKey);
    }

    /**
     * W5 magic-link upgrade ("Verify it's you"): asks the server to email a verification link scoped to
     * the widget's app. On success the visitor receives an email; clicking it redeems a VERIFIED session
     * JWT (via the existing `/magic-link/redeem`). The host page hands that token back to the widget,
     * which calls `transport.UpdateToken(verifiedToken)` to swap it in — the live conversationId is
     * preserved because the transport holds it. Never throws; returns a structured result for the UI.
     */
    public async RequestUpgrade(email: string): Promise<{ success: boolean; emailSent?: boolean; error?: string }> {
        try {
            const res = await this.fetchImpl(`${this.trimmedApiUrl()}/widget/upgrade`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ widgetKey: this.widgetKey, email }),
            });
            const body = (await res.json()) as { success?: boolean; emailSent?: boolean; error?: string; errorCode?: string };
            if (!res.ok || !body?.success) {
                return { success: false, error: body?.error ?? body?.errorCode ?? 'Could not start verification.' };
            }
            return { success: true, emailSent: body.emailSent };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Could not start verification.' };
        }
    }

    /**
     * RV5 "forget me": asks the server to archive this visitor's memory and clear the VisitorKey
     * linkage. The caller is responsible for clearing the durable cookie afterward
     * (`clearVisitorKey`). Public endpoint — the durable key is the proof. Never throws.
     */
    public async Forget(visitorKey: string): Promise<{ success: boolean; notesArchived?: number; error?: string }> {
        try {
            const res = await this.fetchImpl(`${this.trimmedApiUrl()}/widget/forget`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ widgetKey: this.widgetKey, visitorKey }),
            });
            const body = (await res.json()) as { success?: boolean; notesArchived?: number; error?: string; errorCode?: string };
            if (!res.ok || !body?.success) {
                return { success: false, error: body?.error ?? body?.errorCode ?? 'Could not forget this visitor.' };
            }
            return { success: true, notesArchived: body.notesArchived };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Could not forget this visitor.' };
        }
    }

    /**
     * RV4 (magic-link upgrade path): after the visitor verifies and the widget swaps in the VERIFIED
     * token, promote their anonymous returning-visitor trail to the verified record. AUTHENTICATED —
     * the verified token is sent as a Bearer credential; the server reads the verified email from it.
     * Never throws; returns a structured result.
     */
    public async ResolveIdentity(
        verifiedToken: string,
        visitorKey: string,
    ): Promise<{ success: boolean; mergedConversations?: number; error?: string }> {
        try {
            const res = await this.fetchImpl(`${this.trimmedApiUrl()}/widget/resolve-identity`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${verifiedToken}` },
                body: JSON.stringify({ widgetKey: this.widgetKey, visitorKey }),
            });
            const body = (await res.json()) as { success?: boolean; mergedConversations?: number; error?: string; errorCode?: string };
            if (!res.ok || !body?.success) {
                return { success: false, error: body?.error ?? body?.errorCode ?? 'Could not resolve identity.' };
            }
            return { success: true, mergedConversations: body.mergedConversations };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Could not resolve identity.' };
        }
    }

    /** Milliseconds until the given session should be refreshed (never negative). */
    public static MsUntilRefresh(session: WidgetSession, nowMs: number): number {
        return Math.max(0, session.expiresAtMs - nowMs - REFRESH_LEAD_MS);
    }

    private async call(path: string, visitorKey?: string): Promise<WidgetSession> {
        const res = await this.fetchImpl(`${this.trimmedApiUrl()}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(visitorKey ? { widgetKey: this.widgetKey, visitorKey } : { widgetKey: this.widgetKey }),
        });
        const body = (await res.json()) as WidgetSessionResponse;
        if (!res.ok || !body?.success || !body.token) {
            throw new Error(`Widget session mint failed (${res.status}): ${body?.errorCode ?? body?.error ?? 'unknown'}`);
        }
        return this.toSession(body);
    }

    /** Maps the API response to the in-memory session, validating required fields. */
    private toSession(body: WidgetSessionResponse): WidgetSession {
        if (!body.widgetId || !body.applicationId || !body.pinnedAgentId) {
            throw new Error('Widget session response missing required fields (widgetId/applicationId/pinnedAgentId).');
        }
        const expiresAtMs = body.expiresAt ? Date.parse(body.expiresAt) : Number.NaN;
        return {
            token: body.token!,
            expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 15 * 60_000,
            widgetId: body.widgetId,
            applicationId: body.applicationId,
            pinnedAgentId: body.pinnedAgentId,
            modality: (body.modality ?? 'Text') as WidgetModality,
            sessionId: body.sessionId ?? '',
            voiceMaxSessionMinutes: body.voiceMaxSessionMinutes,
            rememberReturningVisitors: body.rememberReturningVisitors ?? false,
            visitorKey: body.visitorKey,
            previousConversationId: body.previousConversationId,
            resolvedEntityId: body.resolvedEntityId,
            resolvedRecordId: body.resolvedRecordId,
        };
    }

    private trimmedApiUrl(): string {
        return this.apiUrl.replace(/\/+$/, '');
    }
}
