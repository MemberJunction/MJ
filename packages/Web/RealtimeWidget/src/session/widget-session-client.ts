/**
 * @fileoverview Mints + refreshes the guest session by calling MJAPI's public
 * `POST /widget/session` endpoint. The token is auth state (not a user preference),
 * so holding it in memory / sessionStorage is acceptable (CLAUDE rule 9) — but this
 * client keeps it only in memory and refreshes before expiry.
 *
 * @module @memberjunction/realtime-widget
 */

import { CreateProofOfPossessionJwt, CreateProofOfPossessionKey, type ProofOfPossessionKey } from '@memberjunction/global';
import type { WidgetModality, WidgetSession, WidgetSessionResponse } from '../types.js';

/** Injectable fetch so the client is unit-testable without a network. Defaults to global fetch. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;

/** A session endpoint answered with a failure. `Status` is the HTTP status, `Code` the server's `errorCode`. */
export class WidgetSessionError extends Error {
    constructor(
        message: string,
        public readonly Status: number,
        public readonly Code: string | null,
    ) {
        super(message);
        this.name = 'WidgetSessionError';
    }

    /**
     * True when the server refused for good (401/403): retrying the same request cannot succeed, so the
     * caller must start a new session. Rate limits (429), server faults (5xx) and network failures are temporary.
     */
    public get IsRefused(): boolean {
        return this.Status === 401 || this.Status === 403;
    }
}

/** How early (ms before expiry) to proactively refresh the guest token. */
const REFRESH_LEAD_MS = 60_000;

/**
 * The shortest wait before a refresh. A token already inside the lead (the client's clock ahead of the server's)
 * would otherwise be refreshed in a tight loop that trips the rate limiter's 429 instead of reaching the server's 403
 * that starts a new session.
 */
const MIN_REFRESH_DELAY_MS = 5_000;

/**
 * Talks to the widget guest-session endpoints. One instance per mounted widget.
 */
export class WidgetSessionClient {
    private readonly fetchImpl: FetchLike;
    /**
     * The key the current session is bound to: created at each mint, held only in memory, and never
     * exportable. The server signs its thumbprint into the token, and refresh must be signed with it, so a
     * token copied off this page cannot be renewed elsewhere.
     */
    private proofKey: ProofOfPossessionKey | null = null;
    /**
     * How far the server's clock is ahead of this browser's (ms), learned from the `iat` of each token the server
     * issues. A visitor's device clock can be minutes off, and the server refuses a refresh proof more than 60 s
     * from its own time, so the proof's `iat` and the refresh timer both run on server time. The token's `iat`
     * rather than the HTTP `Date` header, because a cross-origin embed cannot read `Date` (not CORS-safelisted).
     * `WidgetKeyClient` (`@memberjunction/ng-realtime-widget`) does the same; the two packages share no code, so
     * the duplication is deliberate.
     */
    private serverOffsetMs = 0;

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
        const key = await CreateProofOfPossessionKey();
        const session = await this.call('/widget/session', visitorKey, undefined, key);
        this.proofKey = key;
        return session;
    }

    /** Refreshes the guest session (server re-mints by the same key while verifying the current token to
     *  preserve `mj_sid`). Carries the visitor anchor so the refreshed session keeps the same
     *  returning-visitor identity. */
    public async Refresh(currentToken: string, visitorKey?: string): Promise<WidgetSession> {
        if (!this.proofKey) {
            throw new Error('Widget session refresh needs the key registered at mint; call Mint first.');
        }
        return this.call('/widget/session/refresh', visitorKey, currentToken, this.proofKey);
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

    /** Milliseconds until the given session should be refreshed (at least {@link MIN_REFRESH_DELAY_MS}). */
    public static MsUntilRefresh(session: WidgetSession, nowMs: number): number {
        return Math.max(MIN_REFRESH_DELAY_MS, session.expiresAtMs - nowMs - REFRESH_LEAD_MS);
    }

    /**
     * POSTs to a session endpoint. A mint (no `bearerToken`) registers `key`'s public half; a refresh sends the
     * token and a proof signed by `key` for this URL and token.
     */
    private async call(path: string, visitorKey: string | undefined, bearerToken: string | undefined, key: ProofOfPossessionKey): Promise<WidgetSession> {
        const url = `${this.trimmedApiUrl()}${path}`;
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        const request: Record<string, unknown> = { widgetKey: this.widgetKey };
        if (visitorKey) {
            request.visitorKey = visitorKey;
        }
        if (bearerToken) {
            headers['authorization'] = `Bearer ${bearerToken}`;
            headers['dpop'] = await CreateProofOfPossessionJwt(key, {
                Method: 'POST',
                Url: url,
                AccessToken: bearerToken,
                NowSeconds: Math.floor((Date.now() + this.serverOffsetMs) / 1000),
            });
        } else {
            request.proofKey = key.PublicJwk;
        }
        const res = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(request) });
        const body = (await res.json()) as WidgetSessionResponse;
        if (!res.ok || !body?.success || !body.token) {
            throw new WidgetSessionError(`Widget session mint failed (${res.status}): ${body?.errorCode ?? body?.error ?? 'unknown'}`, res.status, body?.errorCode ?? null);
        }
        this.learnServerOffset(body.token);
        return this.toSession(body);
    }

    /**
     * Records the server's clock offset from a token it just issued (`iat` is its "now"). The offset is off by the
     * response's one-way latency, far inside the server's 60 s window. A token without a readable `iat` keeps the
     * previous offset: the server stamps `iat` on every token it signs, so this is never a guess about server time.
     */
    private learnServerOffset(token: string): void {
        const iat = ReadTokenIssuedAtSeconds(token);
        if (iat !== null) {
            this.serverOffsetMs = iat * 1000 - Date.now();
        }
    }

    /**
     * Maps the API response to the in-memory session, validating required fields. `expiresAtMs` is put on this
     * browser's clock (the server's expiry less the learned offset), so `expiresAtMs - Date.now()` is the time the
     * token really has left even on a device whose clock is off.
     */
    private toSession(body: WidgetSessionResponse): WidgetSession {
        if (!body.widgetId || !body.applicationId || !body.pinnedAgentId) {
            throw new Error('Widget session response missing required fields (widgetId/applicationId/pinnedAgentId).');
        }
        const expiresAtMs = body.expiresAt ? Date.parse(body.expiresAt) : Number.NaN;
        return {
            token: body.token!,
            expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs - this.serverOffsetMs : Date.now() + 15 * 60_000,
            widgetId: body.widgetId,
            applicationId: body.applicationId,
            pinnedAgentId: body.pinnedAgentId,
            modality: (body.modality ?? 'Text') as WidgetModality,
            sessionId: body.sessionId ?? '',
            voiceMaxSessionMinutes: body.voiceMaxSessionMinutes,
            rememberReturningVisitors: body.rememberReturningVisitors ?? false,
            visitorKey: body.visitorKey,
            lastConversationId: body.lastConversationId,
            linkedEntityId: body.linkedEntityId,
            linkedRecordId: body.linkedRecordId,
            enabledChannels: Array.isArray(body.enabledChannels) ? body.enabledChannels : [],
        };
    }

    private trimmedApiUrl(): string {
        return this.apiUrl.replace(/\/+$/, '');
    }
}

/**
 * The `iat` (epoch seconds) of a JWT, read WITHOUT verifying it: the widget only needs the server's clock reading,
 * and the server verifies the token itself. Null when the token is unreadable or carries no numeric `iat`.
 */
function ReadTokenIssuedAtSeconds(token: string): number | null {
    const part = token.split('.')[1];
    if (!part) {
        return null;
    }
    try {
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const payload: unknown = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)));
        if (typeof payload !== 'object' || payload === null || !('iat' in payload)) {
            return null;
        }
        return typeof payload.iat === 'number' && Number.isFinite(payload.iat) ? payload.iat : null;
    } catch {
        // Not base64 or not JSON: an unreadable token says nothing about the server's clock (see learnServerOffset).
        return null;
    }
}
