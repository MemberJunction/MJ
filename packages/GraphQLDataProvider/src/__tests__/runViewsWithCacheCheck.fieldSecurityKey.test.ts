import { describe, expect, it, vi, afterEach } from 'vitest';
import type { RunViewWithCacheCheckParams } from '@memberjunction/core';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * A browser sends its field-security key with each cached view's status, so the server can answer
 * "stale" when the user lost a column but no row changed. A server older than the key rejects the
 * field; the client then retries once without it and leaves it out for a while.
 */

const KEY = '0123456789abcdef0123456789abcdef';

const PARAMS: RunViewWithCacheCheckParams[] = [{
    params: { EntityName: 'Employees', CacheLocal: true },
    cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 2, fieldSecurityKey: KEY },
}];

const OK_RESPONSE = {
    RunViewsWithCacheCheck: { success: true, results: [{ viewIndex: 0, status: 'current' }] },
};

function graphQLError(message: string, code: string | undefined): Error {
    const extensions = code ? { code } : undefined;
    return Object.assign(new Error(message), { response: { errors: [{ message, extensions }] } });
}

const OLD_SERVER_INPUT_FIELD = () => graphQLError('Variable "$input" got invalid value { maxUpdatedAt: "x", rowCount: 2, fieldSecurityKey: "k" } at "input[0].cacheStatus"; Field "fieldSecurityKey" is not defined by type "RunViewCacheStatusInput".', 'BAD_USER_INPUT');
const OTHER_ERROR = () => graphQLError('fieldSecurityKey could not be checked', 'INTERNAL_SERVER_ERROR');

type Step = 'ok' | (() => Error);
interface ExecuteCall { Input: Array<{ cacheStatus: Record<string, unknown> | null }> }

function makeProvider(script: Step[]) {
    const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
    const calls: ExecuteCall[] = [];
    let i = 0;
    const execute = vi.fn(async (_query: string, variables: { input: ExecuteCall['Input'] }) => {
        calls.push({ Input: variables.input });
        const step = script[Math.min(i++, script.length - 1)];
        if (typeof step === 'function') throw step();
        return OK_RESPONSE;
    });
    (provider as unknown as { ExecuteGQL: typeof execute }).ExecuteGQL = execute;
    return { provider, calls };
}

const sentKey = (call: ExecuteCall) => call.Input[0].cacheStatus?.['fieldSecurityKey'];

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GraphQLDataProvider.RunViewsWithCacheCheck — field-security key', () => {
    it('sends the key with the cache status', async () => {
        const { provider, calls } = makeProvider(['ok']);

        const response = await provider.RunViewsWithCacheCheck(PARAMS);

        expect(response.success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(sentKey(calls[0])).toBe(KEY);
    });

    it('sends an empty key (an unrestricted user) rather than dropping it', async () => {
        const { provider, calls } = makeProvider(['ok']);

        await provider.RunViewsWithCacheCheck([{ ...PARAMS[0], cacheStatus: { ...PARAMS[0].cacheStatus!, fieldSecurityKey: '' } }]);

        expect(sentKey(calls[0])).toBe('');
    });

    it('retries once without the key when an older server rejects the field, then leaves it out for a while', async () => {
        let now = 1_800_000_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { provider, calls } = makeProvider([OLD_SERVER_INPUT_FIELD, 'ok', 'ok', 'ok']);

        const response = await provider.RunViewsWithCacheCheck(PARAMS);
        expect(response.success).toBe(true);
        expect(calls).toHaveLength(2);
        expect(sentKey(calls[1])).toBeUndefined();

        now += 60_000;
        await provider.RunViewsWithCacheCheck(PARAMS);
        expect(sentKey(calls[2])).toBeUndefined();

        now += 5 * 60_000;
        await provider.RunViewsWithCacheCheck(PARAMS);
        expect(sentKey(calls[3])).toBe(KEY);
    });

    it('does not retry on an ordinary error that happens to name the field', async () => {
        const { provider, calls } = makeProvider([OTHER_ERROR, 'ok']);

        const response = await provider.RunViewsWithCacheCheck(PARAMS);

        expect(response.success).toBe(false);
        expect(calls).toHaveLength(1);
    });
});
