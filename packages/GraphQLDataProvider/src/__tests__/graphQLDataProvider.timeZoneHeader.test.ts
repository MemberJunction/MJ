import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetLocalTimeZone, TIME_ZONE_HEADER } from '@memberjunction/core';
import { GraphQLProviderConfigData } from '../graphQLDataProvider';
import { ConnectGraphQLClient } from '../config';
import { ResetGraphQLProviderSingleton } from './support/wireTestHarness';

// The provider sends the runtime's IANA zone on every request so the server can work date tokens
// out in the caller's zone. Exercises the REAL provider; only fetch is stubbed.

function makeConfig(token = 'test-token'): GraphQLProviderConfigData {
    return new GraphQLProviderConfigData(token, 'http://localhost:4000/', 'ws://localhost:4000/');
}

function okResponse(): Response {
    return new Response(JSON.stringify({ data: { Ok: true } }), { headers: { 'content-type': 'application/json' } });
}

/** The time-zone header of the request the client sent in fetch call `n`. */
function timeZoneOfCall(fetchSpy: ReturnType<typeof vi.spyOn>, n: number): string | null {
    const init = fetchSpy.mock.calls[n][1] as RequestInit;
    return new Headers(init.headers).get(TIME_ZONE_HEADER);
}

describe('GraphQLDataProvider time-zone header', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetGraphQLProviderSingleton();
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        ResetGraphQLProviderSingleton();
    });

    it('sends the runtime IANA zone on every request', async () => {
        const provider = await ConnectGraphQLClient(makeConfig());
        fetchSpy.mockResolvedValueOnce(okResponse());

        await provider.ExecuteGQL('query { Ok }', null);

        expect(GetLocalTimeZone()).toBeTruthy();
        expect(timeZoneOfCall(fetchSpy, 0)).toBe(GetLocalTimeZone());
        expect(provider.GetDynamicHeaders().get(TIME_ZONE_HEADER)).toBe(GetLocalTimeZone());
    });

    it('still sends it after the client is rebuilt for new credentials', async () => {
        const provider = await ConnectGraphQLClient(makeConfig('anon-token'));
        await provider.Connect(makeConfig('user-token'));
        fetchSpy.mockResolvedValueOnce(okResponse());

        await provider.ExecuteGQL('query { Ok }', null);

        expect(timeZoneOfCall(fetchSpy, 0)).toBe(GetLocalTimeZone());
    });

    it('keeps a zone the host set before connecting', async () => {
        const provider = await ConnectGraphQLClient(makeConfig());
        provider.SetDynamicHeader(TIME_ZONE_HEADER, 'Pacific/Auckland');
        await provider.Connect(makeConfig('user-token'));
        fetchSpy.mockResolvedValueOnce(okResponse());

        await provider.ExecuteGQL('query { Ok }', null);

        expect(timeZoneOfCall(fetchSpy, 0)).toBe('Pacific/Auckland');
    });

    it('sends no header, quietly, where Intl reports no zone', async () => {
        vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({} as Intl.ResolvedDateTimeFormatOptions);
        const provider = await ConnectGraphQLClient(makeConfig());
        fetchSpy.mockResolvedValueOnce(okResponse());

        await provider.ExecuteGQL('query { Ok }', null);

        expect(timeZoneOfCall(fetchSpy, 0)).toBeNull();
        expect(provider.GetDynamicHeaders().has(TIME_ZONE_HEADER)).toBe(false);
    });
});
