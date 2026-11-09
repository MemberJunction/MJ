import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, KeyValuePair } from '@memberjunction/core';
import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

/** #3093: a merge field map could not set a field to NULL; the client called `.toString()` on it. */
describe('GraphQLDataProvider MergeRecords field map wire behavior', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        const customers = BuildCustomerEntityInfo();
        customers.AllowRecordMerge = true;
        vi.spyOn(provider, 'Entities', 'get').mockReturnValue([customers]);
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        vi.restoreAllMocks();
        ResetGraphQLProviderSingleton();
    });

    it('sends a null field-map value as null and other values as strings', async () => {
        GraphQLWire.EnqueueResponse({ MergeRecords: { Success: true, OverallStatus: null, RecordMergeLogID: 'log-1', RecordStatus: [] } });

        await provider.MergeRecords({
            EntityName: 'Customers',
            SurvivingRecordCompositeKey: new CompositeKey([new KeyValuePair('ID', 'CUST-001')]),
            RecordsToMerge: [new CompositeKey([new KeyValuePair('ID', 'CUST-002')])],
            FieldMap: [
                { FieldName: 'First Name', Value: null },
                { FieldName: 'Age', Value: 42 },
            ],
        });

        const sent = GraphQLWire.LastRequest.variables as { request: { FieldMap: Array<{ FieldName: string; Value: string | null }> } };
        expect(sent.request.FieldMap).toEqual([
            { FieldName: 'First Name', Value: null },
            { FieldName: 'Age', Value: '42' },
        ]);
    });
});
