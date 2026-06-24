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

    /** Mints a fresh guest session. Throws on a non-2xx / unsuccessful response. */
    public async Mint(): Promise<WidgetSession> {
        return this.call('/widget/session');
    }

    /** Refreshes the guest session (server re-mints by the same key). */
    public async Refresh(): Promise<WidgetSession> {
        return this.call('/widget/session/refresh');
    }

    /** Milliseconds until the given session should be refreshed (never negative). */
    public static MsUntilRefresh(session: WidgetSession, nowMs: number): number {
        return Math.max(0, session.expiresAtMs - nowMs - REFRESH_LEAD_MS);
    }

    private async call(path: string): Promise<WidgetSession> {
        const res = await this.fetchImpl(`${this.trimmedApiUrl()}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ widgetKey: this.widgetKey }),
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
        };
    }

    private trimmedApiUrl(): string {
        return this.apiUrl.replace(/\/+$/, '');
    }
}
