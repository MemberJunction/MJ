/**
 * Regression test for the 2026-08-29 memory-leak audit (Round 12): `GraphQLQueryAction` threw
 * away a non-2xx `SafeFetch` response without ever reading or cancelling its body. Under Node's
 * native `fetch` (undici), an unconsumed response body pins its connection out of the keep-alive
 * pool until GC finalizes it — a leak on every non-2xx reply from a caller-supplied GraphQL
 * endpoint, which is a routine, not exceptional, outcome for this action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const safeFetchMock = vi.fn();
const drainResponseBodyMock = vi.fn();

vi.mock('@memberjunction/network-utils', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
    return {
        ...actual,
        SafeFetch: (...args: unknown[]) => safeFetchMock(...args),
        DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
    };
});

import { GraphQLQueryAction } from '../custom/integration/graphql-query.action';

/** Exposes the protected entry point without weakening its type. */
class TestableGraphQLQueryAction extends GraphQLQueryAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

describe('GraphQLQueryAction — response body draining', () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
        drainResponseBodyMock.mockReset();
    });

    it('drains the response body before returning on a non-2xx status', async () => {
        safeFetchMock.mockResolvedValue({ status: 500, statusText: 'Server Error' });
        const action = new TestableGraphQLQueryAction();

        const result = await action.RunForTest(
            paramsFor({ Endpoint: 'https://api.example.com/graphql', Query: '{ __typename }' })
        );

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('HTTP_500');
        expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('does not drain the body on a 2xx response — the success path reads it itself', async () => {
        safeFetchMock.mockResolvedValue({
            status: 200,
            statusText: 'OK',
            text: async () => '{"data":{"ok":true}}',
        });
        const action = new TestableGraphQLQueryAction();

        const result = await action.RunForTest(
            paramsFor({ Endpoint: 'https://api.example.com/graphql', Query: '{ __typename }' })
        );

        expect(result.Success).toBe(true);
        expect(drainResponseBodyMock).not.toHaveBeenCalled();
    });
});
