import { describe, expect, it, vi, afterEach } from 'vitest';
import type { RunQueryWithCacheCheckParams } from '@memberjunction/core';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * A server older than the query-definition check rejects `definitionHash`. The client retries once
 * without it, leaves it out for a while, and then tries it again.
 */

const PARAMS: RunQueryWithCacheCheckParams[] = [{
    params: { QueryID: 'Q1' },
    cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1, definitionHash: 'hash-1' },
}];

const OK_RESPONSE = {
    RunQueriesWithCacheCheck: {
        success: true,
        results: [{ queryIndex: 0, queryId: 'Q1', status: 'current', maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1 }],
    },
};

/** A thrown GraphQL error shaped as ExecuteGQL rethrows it: the first error's message, plus the errors. */
function graphQLError(message: string, code: string | undefined): Error {
    const extensions = code ? { code } : undefined;
    return Object.assign(new Error(message), { response: { errors: [{ message, extensions }] } });
}

/** What an older server returns: graphql-js / Apollo messages and codes for the unknown output and input fields. */
const OLD_SERVER_OUTPUT_FIELD = () => graphQLError('Cannot query field "definitionHash" on type "RunQueryWithCacheCheckResultOutput".', 'GRAPHQL_VALIDATION_FAILED');
const OLD_SERVER_INPUT_FIELD = () => graphQLError('Variable "$input" got invalid value { maxUpdatedAt: "x", rowCount: 1, definitionHash: "h" } at "input[0].cacheStatus"; Field "definitionHash" is not defined by type "RunQueryCacheStatusInput".', 'BAD_USER_INPUT');
/** Errors a current server could raise that name the field without meaning the schema lacks it. */
const NEW_SERVER_ERROR = () => graphQLError('definitionHash validation failed for this request', 'INTERNAL_SERVER_ERROR');
const SIGNATURE_WITH_OTHER_CODE = () => graphQLError('Cannot query field "definitionHash" on type "RunQueryWithCacheCheckResultOutput".', 'INTERNAL_SERVER_ERROR');
const PLAIN_ERROR_NAMING_FIELD = () => new Error('could not read definitionHash');

interface ExecuteCall {
    Query: string;
    Input: Array<{ cacheStatus: Record<string, unknown> | null }>;
}

/** A provider whose ExecuteGQL is scripted; records each call's query text and input. */
type Step = 'ok' | 'other-error' | (() => Error);

function makeProvider(script: Step[]) {
    const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
    const calls: ExecuteCall[] = [];
    let i = 0;
    const execute = vi.fn(async (query: string, variables: { input: ExecuteCall['Input'] }) => {
        calls.push({ Query: query, Input: variables.input });
        const step = script[Math.min(i++, script.length - 1)];
        if (typeof step === 'function') throw step();
        if (step === 'other-error') throw new Error('network down');
        return OK_RESPONSE;
    });
    (provider as unknown as { ExecuteGQL: typeof execute }).ExecuteGQL = execute;
    return { provider, calls };
}

const sentHash = (call: ExecuteCall) => call.Input[0].cacheStatus?.['definitionHash'];
const selectsHash = (call: ExecuteCall) => call.Query.includes('definitionHash');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GraphQLDataProvider.RunQueriesWithCacheCheck against a server without definition hashes', () => {
    it('sends the definition hash to a server that accepts it', async () => {
        const { provider, calls } = makeProvider(['ok']);

        const response = await provider.RunQueriesWithCacheCheck(PARAMS);

        expect(response.success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(sentHash(calls[0])).toBe('hash-1');
        expect(selectsHash(calls[0])).toBe(true);
    });

    it('retries once without the hash when the server rejects the output field', async () => {
        const { provider, calls } = makeProvider([OLD_SERVER_OUTPUT_FIELD, 'ok']);

        const response = await provider.RunQueriesWithCacheCheck(PARAMS);

        expect(response.success).toBe(true);
        expect(response.results[0].status).toBe('current');
        expect(calls).toHaveLength(2);
        expect(sentHash(calls[1])).toBeUndefined();
        expect(selectsHash(calls[1])).toBe(false);
    });

    it('leaves the hash out of later calls for a while, then tries it again', async () => {
        let now = 1_800_000_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { provider, calls } = makeProvider([OLD_SERVER_OUTPUT_FIELD, 'ok', 'ok', 'ok']);

        await provider.RunQueriesWithCacheCheck(PARAMS);
        now += 60_000;
        await provider.RunQueriesWithCacheCheck(PARAMS);
        expect(calls).toHaveLength(3);
        expect(sentHash(calls[2])).toBeUndefined();

        now += 5 * 60_000;
        await provider.RunQueriesWithCacheCheck(PARAMS);
        expect(calls).toHaveLength(4);
        expect(sentHash(calls[3])).toBe('hash-1');
    });

    it('retries once without the hash when the server rejects the input field', async () => {
        const { provider, calls } = makeProvider([OLD_SERVER_INPUT_FIELD, 'ok']);

        const response = await provider.RunQueriesWithCacheCheck(PARAMS);

        expect(response.success).toBe(true);
        expect(calls).toHaveLength(2);
        expect(sentHash(calls[1])).toBeUndefined();
    });

    it.each([
        ['an error from a current server that names the field', NEW_SERVER_ERROR],
        ['a schema-rejection message with a non-validation code', SIGNATURE_WITH_OTHER_CODE],
        ['a plain error that names the field', PLAIN_ERROR_NAMING_FIELD],
    ])('fails without downgrading on %s', async (_label, error) => {
        const { provider, calls } = makeProvider([error, 'ok']);

        const response = await provider.RunQueriesWithCacheCheck(PARAMS);
        expect(response.success).toBe(false);
        expect(calls).toHaveLength(1);

        await provider.RunQueriesWithCacheCheck(PARAMS);
        expect(calls).toHaveLength(2);
        expect(sentHash(calls[1])).toBe('hash-1');
    });

    it('does not retry other errors', async () => {
        const { provider, calls } = makeProvider(['other-error']);

        const response = await provider.RunQueriesWithCacheCheck(PARAMS);

        expect(response.success).toBe(false);
        expect(response.errorMessage).toBe('network down');
        expect(calls).toHaveLength(1);
    });
});
