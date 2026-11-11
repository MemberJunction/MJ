/**
 * ExecuteGQL / token-refresh behavioral tests for the REAL GraphQLDataProvider.
 *
 * Only graphql-request is faked (see ./support/graphQLWire.ts). These tests drive the
 * provider's real error-classification logic: GraphQL errors vs network errors, the
 * JWT_EXPIRED → RefreshToken → retry-once path, refresh dedup, the irrecoverable-auth
 * callback, and header/client lifecycle across a token refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { GraphQLDataProvider, GraphQLProviderConfigData } from '../graphQLDataProvider';
import { SafeGraphQLError } from '../sanitizeGraphQLError';
import { FakeGraphQLResponseError, GraphQLWire } from './support/graphQLWire';
import {
    BuildTestConfig,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

const QUERY = 'query Ping { Ping { Pong } }';

/**
 * Awaits a rejection from ExecuteGQL and asserts the SECURITY contract on what came out.
 *
 * ExecuteGQL deliberately does NOT rethrow the error the wire raised: the upstream ClientError
 * embeds the serialised request in its `message` and `stack`, and ~178 call sites catch it, many
 * of which stringify it into a log. So every exit path rethrows a `SafeGraphQLError` instead —
 * a different object carrying only what consumers read. Asserting identity against `raw` here
 * would re-pin the leak this replaced, so these tests assert the substitution instead.
 */
async function expectSafeRejection(promise: Promise<unknown>, raw: Error): Promise<SafeGraphQLError> {
    const thrown: unknown = await promise.then(
        () => {
            throw new Error('ExecuteGQL resolved; expected it to reject');
        },
        (e: unknown) => e,
    );
    expect(thrown).toBeInstanceOf(SafeGraphQLError);
    expect(thrown).not.toBe(raw); // the raw, payload-bearing error must NOT propagate
    return thrown as SafeGraphQLError;
}

describe('GraphQLDataProvider.ExecuteGQL', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
    });

    afterEach(() => {
        ResetGraphQLProviderSingleton();
    });

    describe('request plumbing', () => {
        it('sends the document and variables through the wire client and returns the data', async () => {
            provider = CreateWireTestProvider();
            GraphQLWire.EnqueueResponse({ Ping: { Pong: true } });

            const data = await provider.ExecuteGQL(QUERY, { a: 1 });

            expect(data).toEqual({ Ping: { Pong: true } });
            expect(GraphQLWire.LastRequest.document).toBe(QUERY);
            expect(GraphQLWire.LastRequest.variables).toEqual({ a: 1 });
        });

        it('creates the client with session, bearer, and API-key headers from config', () => {
            const config = BuildTestConfig({
                token: 'jwt-abc',
                mjAPIKey: 'shared-secret',
                userAPIKey: 'mj_sk_user_key',
            });
            provider = CreateWireTestProvider(config, 'session-42');

            expect(GraphQLWire.Clients).toHaveLength(1);
            expect(GraphQLWire.LastClient.Url).toBe('http://localhost:4000/graphql');
            expect(GraphQLWire.LastClient.Headers).toEqual({
                'x-session-id': 'session-42',
                authorization: 'Bearer jwt-abc',
                'x-mj-api-key': 'shared-secret',
                'x-api-key': 'mj_sk_user_key',
            });
        });

        it('the static ExecuteGQL delegates to the singleton instance', async () => {
            provider = CreateWireTestProvider();
            GraphQLWire.EnqueueResponse({ Ping: { Pong: 'static' } });

            const data = await GraphQLDataProvider.ExecuteGQL(QUERY, null);

            expect(data).toEqual({ Ping: { Pong: 'static' } });
            expect(GraphQLWire.Requests).toHaveLength(1);
        });
    });

    describe('error handling', () => {
        it('rethrows non-JWT GraphQL errors without attempting a token refresh', async () => {
            const refreshSpy = vi.fn(async () => 'should-not-be-called');
            const config = new GraphQLProviderConfigData('t0', 'http://localhost:4000/graphql', '', refreshSpy);
            provider = CreateWireTestProvider(config);
            const error = new FakeGraphQLResponseError('Field does not exist', 'GRAPHQL_VALIDATION_FAILED');
            GraphQLWire.EnqueueError(error);

            const safe = await expectSafeRejection(provider.ExecuteGQL(QUERY, null), error);
            // The classification the caller acts on survives sanitisation.
            expect(safe.message).toBe('Field does not exist');
            expect(safe.Code).toBe('GRAPHQL_VALIDATION_FAILED');
            expect(refreshSpy).not.toHaveBeenCalled();
            expect(GraphQLWire.Requests).toHaveLength(1);
        });

        it('rethrows GraphQL errors that carry no extensions code', async () => {
            provider = CreateWireTestProvider();
            const error = new FakeGraphQLResponseError('boom');
            GraphQLWire.EnqueueError(error);

            const safe = await expectSafeRejection(provider.ExecuteGQL(QUERY, null), error);
            expect(safe.message).toBe('boom');
            expect(safe.Code).toBeUndefined();
        });

        it('rethrows plain network errors, but with a generic message — there is no response to sanitise', async () => {
            provider = CreateWireTestProvider();
            const networkError = new Error('ECONNREFUSED 127.0.0.1:4000');
            GraphQLWire.EnqueueError(networkError);

            const safe = await expectSafeRejection(provider.ExecuteGQL(QUERY, null), networkError);
            // Real behavior worth knowing: a transport error carries no `response.errors`, so the
            // sanitiser has no server message to derive from and falls back to the status form with
            // an unknown status. The original text ('ECONNREFUSED …') does NOT survive — anything
            // diagnosing a connection failure must read the log, not the propagated error.
            expect(safe.message).toBe('GraphQL Error (Code: unknown)');
            expect(safe.Code).toBeUndefined();
            expect(safe.response?.errors).toBeUndefined();
        });
    });

    describe('JWT_EXPIRED token refresh', () => {
        it('refreshes the token, rebuilds the client, and retries the request exactly once', async () => {
            const refreshSpy = vi.fn(async () => 'refreshed-jwt');
            const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', refreshSpy);
            provider = CreateWireTestProvider(config, 'session-7');

            // code is deliberately lowercase — the provider normalizes with toUpperCase().trim()
            GraphQLWire.EnqueueError(new FakeGraphQLResponseError('jwt expired', 'jwt_expired'));
            GraphQLWire.EnqueueResponse({ Ping: { Pong: 'after-refresh' } });

            const data = await provider.ExecuteGQL(QUERY, { x: 1 });

            expect(data).toEqual({ Ping: { Pong: 'after-refresh' } });
            expect(refreshSpy).toHaveBeenCalledTimes(1);
            expect(config.Token).toBe('refreshed-jwt');

            // A NEW client was created for the retry, carrying the refreshed bearer token
            expect(GraphQLWire.Clients).toHaveLength(2);
            expect(GraphQLWire.Clients[1].Headers['authorization']).toBe('Bearer refreshed-jwt');
            expect(GraphQLWire.Clients[1].Headers['x-session-id']).toBe('session-7');
            expect(GraphQLWire.Requests).toHaveLength(2);
            expect(GraphQLWire.Requests[0].clientIndex).toBe(0); // first attempt on the stale client
            expect(GraphQLWire.Requests[1].clientIndex).toBe(1); // retry on the refreshed client
        });

        it('does not refresh when refreshTokenIfNeeded is false', async () => {
            const refreshSpy = vi.fn(async () => 'unused');
            const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', refreshSpy);
            provider = CreateWireTestProvider(config);
            const error = new FakeGraphQLResponseError('jwt expired', 'JWT_EXPIRED');
            GraphQLWire.EnqueueError(error);

            const safe = await expectSafeRejection(provider.ExecuteGQL(QUERY, null, false), error);
            // JWT_EXPIRED still reaches the caller — opting out of refresh must not hide WHY.
            expect(safe.Code).toBe('JWT_EXPIRED');
            expect(refreshSpy).not.toHaveBeenCalled();
            expect(GraphQLWire.Requests).toHaveLength(1);
        });

        it('gives up after one refresh when the retried request is still JWT_EXPIRED', async () => {
            const refreshSpy = vi.fn(async () => 'refreshed-but-still-bad');
            const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', refreshSpy);
            provider = CreateWireTestProvider(config);
            const secondError = new FakeGraphQLResponseError('still expired', 'JWT_EXPIRED');
            GraphQLWire.EnqueueError(new FakeGraphQLResponseError('jwt expired', 'JWT_EXPIRED'));
            GraphQLWire.EnqueueError(secondError);

            const safe = await expectSafeRejection(provider.ExecuteGQL(QUERY, null), secondError);
            // It is the SECOND failure that surfaces, not the first — proof the retry actually ran.
            expect(safe.message).toBe('still expired');
            expect(refreshSpy).toHaveBeenCalledTimes(1); // no second refresh — retry runs with refresh disabled
            expect(GraphQLWire.Requests).toHaveLength(2);
        });

        it('reapplies dynamic headers to the client created during refresh', async () => {
            const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', async () => 'refreshed-jwt');
            provider = CreateWireTestProvider(config);
            provider.SetDynamicHeader('x-organization-id', 'org-9');
            expect(GraphQLWire.Clients[0].Headers['x-organization-id']).toBe('org-9');

            GraphQLWire.EnqueueError(new FakeGraphQLResponseError('jwt expired', 'JWT_EXPIRED'));
            GraphQLWire.EnqueueResponse({ Ping: { Pong: true } });
            await provider.ExecuteGQL(QUERY, null);

            // The re-created client keeps the dynamic header alongside the new bearer token
            expect(GraphQLWire.Clients[1].Headers['x-organization-id']).toBe('org-9');
            expect(GraphQLWire.Clients[1].Headers['authorization']).toBe('Bearer refreshed-jwt');
        });
    });

    describe('RefreshToken failure modes', () => {
        it('rejects and notifies OnAuthenticationError when the refresh function returns no token', async () => {
            const authErrors: Error[] = [];
            const config = new GraphQLProviderConfigData(
                'stale-jwt',
                'http://localhost:4000/graphql',
                '',
                async () => '',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                (error: Error) => authErrors.push(error)
            );
            provider = CreateWireTestProvider(config);

            await expect(provider.RefreshToken()).rejects.toThrow(
                'Refresh token function returned null or undefined token'
            );
            // Current behavior: the null-token branch notifies, throws, and the surrounding
            // catch notifies AGAIN with the same error — callers see the callback twice.
            expect(authErrors).toHaveLength(2);
            expect(authErrors[0].message).toBe('Refresh token function returned null or undefined token');
            expect(authErrors[1]).toBe(authErrors[0]);
            // No replacement client was ever created
            expect(GraphQLWire.Clients).toHaveLength(1);
        });

        it('rejects and notifies OnAuthenticationError when no refresh function is configured', async () => {
            const authErrors: Error[] = [];
            const config = BuildTestConfig({ onAuthenticationError: (error: Error) => authErrors.push(error) });
            delete config.Data.RefreshTokenFunction;
            provider = CreateWireTestProvider(config);

            await expect(provider.RefreshToken()).rejects.toThrow('No refresh token function provided');
            expect(authErrors).toHaveLength(1);
        });

        it('propagates refresh-function exceptions and notifies OnAuthenticationError with the same error', async () => {
            const authErrors: Error[] = [];
            const refreshError = new Error('IdP unreachable');
            const config = new GraphQLProviderConfigData(
                'stale-jwt',
                'http://localhost:4000/graphql',
                '',
                async () => {
                    throw refreshError;
                },
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                (error: Error) => authErrors.push(error)
            );
            provider = CreateWireTestProvider(config);

            await expect(provider.RefreshToken()).rejects.toBe(refreshError);
            expect(authErrors).toEqual([refreshError]);
        });

        it('deduplicates concurrent RefreshToken calls into a single refresh', async () => {
            let releaseRefresh: (token: string) => void = () => undefined;
            const refreshSpy = vi.fn(
                () => new Promise<string>((resolve) => {
                    releaseRefresh = resolve;
                })
            );
            const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', refreshSpy);
            provider = CreateWireTestProvider(config);

            const first = provider.RefreshToken();
            const second = provider.RefreshToken();
            releaseRefresh('refreshed-once');
            await Promise.all([first, second]);

            expect(refreshSpy).toHaveBeenCalledTimes(1);
            expect(config.Token).toBe('refreshed-once');
        });
    });
});
