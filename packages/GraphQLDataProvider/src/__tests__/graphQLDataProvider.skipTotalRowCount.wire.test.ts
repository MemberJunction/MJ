/**
 * `SkipTotalRowCount` on the wire for the REAL GraphQLDataProvider.
 *
 * A browser caller can only avoid the server's count if the flag reaches the server. Only
 * graphql-request is faked (see ./support/graphQLWire.ts), so every assertion is on the exact
 * variables the provider puts on the wire, on each of the three transports a RunView can take.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

function dynamicViewResponse(): Record<string, unknown> {
    return {
        RunCRMCustomerDynamicView: {
            Results: [],
            UserViewRunID: '',
            RowCount: 0,
            TotalRowCount: null,
            ExecutionTime: 1,
            Success: true,
            ErrorMessage: '',
        },
    };
}

describe('GraphQLDataProvider SkipTotalRowCount wire behavior', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        provider.RegisterTestEntity(BuildCustomerEntityInfo());
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    it('InternalRunView forwards the flag only when the caller set it', async () => {
        GraphQLWire.EnqueueResponse(dynamicViewResponse());
        await provider.CallInternalRunView({ EntityName: 'Customers', SkipTotalRowCount: true });
        expect((GraphQLWire.LastInput as Record<string, unknown>)['SkipTotalRowCount']).toBe(true);

        GraphQLWire.EnqueueResponse(dynamicViewResponse());
        await provider.CallInternalRunView({ EntityName: 'Customers' });
        expect(GraphQLWire.LastInput as Record<string, unknown>).not.toHaveProperty('SkipTotalRowCount');
    });

    it('InternalRunViews forwards the flag per view, omitting it where unset', async () => {
        GraphQLWire.EnqueueResponse({ RunViews: [] });

        await provider.CallInternalRunViews([
            { EntityName: 'Customers', SkipTotalRowCount: true },
            { EntityName: 'Customers' },
        ]);

        const input = GraphQLWire.LastInput as Record<string, unknown>[];
        expect(input[0]['SkipTotalRowCount']).toBe(true);
        expect(input[1]).not.toHaveProperty('SkipTotalRowCount');
    });

    it('RunViewsWithCacheCheck forwards the flag in each params entry', async () => {
        GraphQLWire.EnqueueResponse({ RunViewsWithCacheCheck: { success: true, errorMessage: null, results: [] } });

        await provider.RunViewsWithCacheCheck([
            { params: { EntityName: 'Customers', SkipTotalRowCount: true } },
            { params: { EntityName: 'Customers' } },
        ]);

        const input = GraphQLWire.LastInput as { params: Record<string, unknown> }[];
        expect(input[0].params['SkipTotalRowCount']).toBe(true);
        expect(input[1].params['SkipTotalRowCount']).toBeUndefined();
    });
});
