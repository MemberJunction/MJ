import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { CreateSessionCloseBeaconForProvider, FetchSessionCloseBeacon } from '../session/SessionCloseBeacon';

const AUTH = { GraphQLURL: 'https://api.example/graphql', Headers: () => ({ authorization: 'Bearer jwt-1', 'x-mj-api-key': 'shared' }) };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

describe('FetchSessionCloseBeacon', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('dispatches a keepalive CloseAgentSession with the provider credentials before its first await', async () => {
        const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ data: { CloseAgentSession: true } }));
        const beacon = new FetchSessionCloseBeacon(AUTH, fetchMock as unknown as typeof fetch);

        const acked = beacon.SendClose('session-1', 'Explicit');

        // Dispatched synchronously: the page may unload right after the pagehide handler returns.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.example/graphql');
        expect(init.method).toBe('POST');
        expect(init.keepalive).toBe(true);
        expect(init.headers).toEqual({ 'Content-Type': 'application/json', authorization: 'Bearer jwt-1', 'x-mj-api-key': 'shared' });
        const body = JSON.parse(String(init.body)) as { query: string; variables: Record<string, string> };
        expect(body.query).toContain('CloseAgentSession(agentSessionId: $agentSessionId, closeReason: $closeReason)');
        expect(body.variables).toEqual({ agentSessionId: 'session-1', closeReason: 'Explicit' });
        await expect(acked).resolves.toBe(true);
    });

    it.each([
        ['an HTTP failure', async () => new Response('', { status: 500 }), 'status 500'],
        ['a GraphQL error', async () => jsonResponse({ errors: [{ message: 'Not authorized' }] }), 'Not authorized'],
        ['a network failure', async () => { throw new TypeError('Failed to fetch'); }, 'could not be sent'],
    ])('resolves false and logs the session on %s, never rejecting', async (_label, impl, logged) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const beacon = new FetchSessionCloseBeacon(AUTH, vi.fn(impl) as unknown as typeof fetch);

        await expect(beacon.SendClose('session-2', 'Explicit')).resolves.toBe(false);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('session-2');
        expect(message).toContain(logged);
    });

    it('is not created for a provider without a GraphQL URL', () => {
        expect(CreateSessionCloseBeaconForProvider(null)).toBeNull();
        expect(CreateSessionCloseBeaconForProvider({ ConfigData: { URL: '' } } as unknown as IMetadataProvider)).toBeNull();
        expect(CreateSessionCloseBeaconForProvider({ ConfigData: { URL: 'https://api.example/graphql' } } as unknown as IMetadataProvider)).toBeInstanceOf(FetchSessionCloseBeacon);
    });
});
