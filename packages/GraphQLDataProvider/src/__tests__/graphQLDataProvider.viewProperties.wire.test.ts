/**
 * View properties on the wire for the REAL GraphQLDataProvider: a stored-view run sends its
 * `Properties`, a run without them sends no key at all, and the two mistakes a caller can make
 * (properties on a dynamic run, `ServerProperties` from the browser) throw instead of being dropped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    BuildLoadedUserView,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

const CHAPTER = '11111111-1111-4111-8111-111111111111';

function singleViewResponse(queryName: string): Record<string, unknown> {
    return { [queryName]: { Results: [], UserViewRunID: '', RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, Success: true, ErrorMessage: '' } };
}

function lastInputRecord(): Record<string, unknown> {
    return GraphQLWire.LastInput as Record<string, unknown>;
}

describe('GraphQLDataProvider view properties on the wire', () => {
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

    it('a ViewID run sends its Properties; a run without them sends no key', async () => {
        const view = BuildLoadedUserView(provider, { ID: 'VIEW-0001' });
        GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID'));
        await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001', Properties: { Chapter: CHAPTER } });
        expect(lastInputRecord()['Properties']).toEqual({ Chapter: CHAPTER });

        GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID'));
        await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001' });
        expect(Object.prototype.hasOwnProperty.call(lastInputRecord(), 'Properties')).toBe(false);
    });

    it('a batched view run sends its Properties', async () => {
        const view = BuildLoadedUserView(provider, { ID: 'VIEW-0001' });
        GraphQLWire.EnqueueResponse({ RunViews: [] });
        await provider.CallInternalRunViews([
            { ViewEntity: view, ViewID: 'VIEW-0001', Properties: { Chapter: [CHAPTER] } },
            { EntityName: 'Customers' },
        ]);
        const inputs = GraphQLWire.LastInput as Record<string, unknown>[];
        expect(inputs[0]['Properties']).toEqual({ Chapter: [CHAPTER] });
        expect(Object.prototype.hasOwnProperty.call(inputs[1], 'Properties')).toBe(false);
    });

    it('refuses Properties on a dynamic run and ServerProperties from the browser', async () => {
        await expect(provider.CallInternalRunView({ EntityName: 'Customers', Properties: { Chapter: CHAPTER } })).rejects.toThrow(/apply only to a stored view/);
        const view = BuildLoadedUserView(provider, { ID: 'VIEW-0001' });
        await expect(provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001', ServerProperties: { Chapter: CHAPTER } })).rejects.toThrow(/set only by server code/);
        expect(GraphQLWire.Requests).toHaveLength(0);
    });
});
