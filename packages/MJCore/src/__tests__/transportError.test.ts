/**
 * @fileoverview The one line between "the wire failed" and "the server said no".
 *
 * {@link IsTransportError} gates whether the metadata provider may keep serving a cached
 * snapshot. A false positive here turns a refused identity into a client that silently runs
 * on empty or stale metadata; a false negative turns a gateway blip into a dead bootstrap.
 */
import { describe, it, expect } from 'vitest';
import { IsTransportError, CollectErrorText, DescribeTransportError } from '../generic/transportError';

const SCOPE_DENIAL =
    "Access denied. This API key requires the 'dataset:read' scope for resource 'MJ_Metadata' to " +
    "perform this operation. Please update the API key's scopes or use an API key with appropriate " +
    'permissions. Denial reason: No matching key scope rules';

describe('IsTransportError — transport failures, in every shape a GraphQL client produces', () => {
    it.each([
        ['Apollo text with a status code and no vocabulary', new Error('Response not successful: Received status code 504')],
        ['status on the error', Object.assign(new Error('nope'), { status: 503 })],
        ['statusCode on the error', Object.assign(new Error('nope'), { statusCode: 502 })],
        ['status on response', Object.assign(new Error('nope'), { response: { status: 429 } })],
        ['statusCode on networkError', Object.assign(new Error('nope'), { networkError: { statusCode: 408 } })],
        ['a networkError property at all', Object.assign(new Error('nope'), { networkError: new Error('ECONNRESET') })],
        ['fetch failure', new TypeError('Failed to fetch')],
        ['node socket', new Error('socket hang up')],
        ['node code only', Object.assign(new Error(''), { code: 'ETIMEDOUT' })],
        ['gateway reason phrase', new Error('504 Gateway Timeout')],
        ['bad gateway reason phrase', new Error('502 Bad Gateway')],
        ['Safari opaque', new Error('Load failed')],
        ['Safari opaque, prefixed', new TypeError('TypeError: Load failed')],
        ['abort by name', Object.assign(new Error(''), { name: 'AbortError' })],
        ['nested cause', Object.assign(new Error('request failed'), { cause: new Error('connect ECONNREFUSED 127.0.0.1:4000') })],
        ['inside response.errors[]', Object.assign(new Error('GraphQL error'), { response: { errors: [{ message: 'HTTP 503 from upstream' }] } })],
        // GraphQLDataProvider's SafeGraphQLError discards the upstream text, so it records the
        // verdict it made on the raw error before doing so.
        ['a sanitized error that recorded the verdict', Object.assign(new Error('GraphQL Error (Code: unknown)'), { IsTransportFailure: true })],
    ])('%s → transport', (_label, err) => {
        expect(IsTransportError(err)).toBe(true);
    });
});

describe('IsTransportError — a server that answered is never transport', () => {
    it.each([
        ['the scope denial MJAPI returns for a key without dataset:read', new Error(SCOPE_DENIAL)],
        ['the same denial as a GraphQL 200 with response.errors[]',
            Object.assign(new Error(SCOPE_DENIAL), { response: { status: 200, errors: [{ message: SCOPE_DENIAL, extensions: { code: 'FORBIDDEN' } }] } })],
        ['an entity missing from metadata', new Error('Entity MJ: Employees not found in metadata')],
        ['a validation rejection', new Error("Parameter 'since' must be a valid date")],
        ['a programming error', new TypeError("Cannot read properties of undefined (reading 'EntityUpdateDates')")],
        ['a 4xx that is a real answer', Object.assign(new Error('Forbidden'), { status: 403 })],
        ['a 401', Object.assign(new Error('Unauthorized'), { response: { status: 401 } })],
        ['a number that merely appears in the text', new Error('Row 504 of the import failed validation')],
        // "download failed" ends in "load failed", Safari's fetch-failure text: the boot error
        // SetupGraphQLClient throws must not turn the denial it carries into a network problem.
        ['the boot error carrying a scope denial',
            new Error(`SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: ${SCOPE_DENIAL}`)],
        ['an upload that was refused', new Error('The upload failed: file type not allowed')],
        ['a sanitized error recorded as not transport', Object.assign(new Error('GraphQL Error (Code: unknown)'), { IsTransportFailure: false })],
        ['a string', 'Failed to fetch'],
        ['nothing', undefined],
        ['null', null],
    ])('%s → not transport', (_label, err) => {
        expect(IsTransportError(err)).toBe(false);
    });

    it('does not spin on a self-referential error', () => {
        const err: Record<string, unknown> = { message: 'Forbidden' };
        err['error'] = err;
        err['cause'] = err;
        expect(IsTransportError(err)).toBe(false);
        expect(CollectErrorText(err)).toBe('Forbidden');
    });
});

describe('DescribeTransportError', () => {
    it('collects the text from wherever it hides', () => {
        const err = Object.assign(new Error('request failed'), { cause: new Error('socket hang up') });
        expect(DescribeTransportError(err)).toContain('socket hang up');
    });

    it('says something when the error carries no text at all', () => {
        expect(DescribeTransportError({ response: { status: 504 } })).toBe('The server did not respond.');
    });
});
