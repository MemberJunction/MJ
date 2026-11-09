/**
 * @fileoverview The transport verdict survives sanitization.
 *
 * ExecuteGQL rethrows {@link ToSafeGraphQLError}, which re-derives the message from the GraphQL
 * response and drops the upstream text. For a server that never answered there is no response,
 * so "fetch failed" and ECONNREFUSED were discarded and `IsTransportError` could no longer tell
 * a dead server from any other failure: the metadata provider then rethrew instead of serving
 * the snapshot it holds. The sanitizer now records the verdict as a boolean, which carries no
 * payload.
 *
 * It judges the raw TEXT only when there is no response. A graphql-request `ClientError`
 * serializes the whole request, variables included, into its message, so its text says nothing
 * reliable about the transport; for a response-bearing error only the HTTP status counts.
 */
import { describe, it, expect } from 'vitest';
import { IsTransportError } from '@memberjunction/core';
import { SanitizeGraphQLError, ToSafeGraphQLError } from '../sanitizeGraphQLError';

const SCOPE_DENIAL =
    "Access denied. This API key requires the 'dataset:read' scope for resource 'MJ_Metadata' to " +
    'perform this operation. Denial reason: No matching key scope rules';

/** A graphql-request ClientError: the message embeds the serialized request. */
function clientError(status: number, errors: Array<{ message: string }> | undefined, variables: Record<string, unknown>): Error {
    const request = { query: 'query GetStatus { AllEntityUpdateDates { ID } }', variables };
    const message = `${errors?.[0]?.message ?? `GraphQL Error (Code: ${status})`}: ${JSON.stringify({ response: { status, errors }, request })}`;
    return Object.assign(new Error(message), { name: 'ClientError', response: { status, errors }, request });
}

describe('SanitizeGraphQLError — the transport verdict survives the dropped message', () => {
    it.each([
        ['node fetch, server down', new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4000'), { code: 'ECONNREFUSED' }) })],
        ['browser fetch, offline', new TypeError('Failed to fetch')],
        ['DNS failure', Object.assign(new Error('getaddrinfo ENOTFOUND api.example.test'), { code: 'ENOTFOUND' })],
    ])('%s → the rethrown error is still transport', (_label, raw) => {
        const safe = ToSafeGraphQLError(raw);

        expect(safe.message).toBe('GraphQL Error (Code: unknown)'); // the evidence is gone from the text…
        expect(safe.IsTransportFailure).toBe(true);                 // …but the verdict was kept
        expect(IsTransportError(safe)).toBe(true);
    });

    it('a gateway status on a ClientError is transport', () => {
        const safe = ToSafeGraphQLError(clientError(504, undefined, {}));
        expect(safe.IsTransportFailure).toBe(true);
        expect(IsTransportError(safe)).toBe(true);
    });

    it('a denial is not transport, even when the serialized request mentions the network', () => {
        const raw = clientError(200, [{ message: SCOPE_DENIAL }], { note: 'network timeout while fetching' });
        // The control: judging the raw ClientError's text would call this a transport failure.
        expect(IsTransportError(raw)).toBe(true);

        const safe = ToSafeGraphQLError(raw);
        expect(safe.IsTransportFailure).toBe(false);
        expect(IsTransportError(safe)).toBe(false);
    });

    it('records a boolean and nothing else', () => {
        const sanitized = SanitizeGraphQLError(new TypeError('Failed to fetch'));
        expect(typeof sanitized.isTransport).toBe('boolean');
        expect(SanitizeGraphQLError('Failed to fetch').isTransport).toBeUndefined();
    });
});
