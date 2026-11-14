import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, KeyValuePair } from '@memberjunction/core';
import { GraphQLWire } from './support/graphQLWire';
import {
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';
import { GraphQLDataProvider } from '../graphQLDataProvider';

function keyFor(id: string): CompositeKey {
    return new CompositeKey([new KeyValuePair('ID', id)]);
}

function singleNameResponse(name: string) {
    return { GetEntityRecordName: { Success: true, Status: 'OK', RecordName: name } };
}

describe('GraphQLDataProvider record-name coalescing', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        GraphQLDataProvider.CoalesceEntityRecordNames = true;
        provider = CreateWireTestProvider();
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        GraphQLDataProvider.CoalesceEntityRecordNames = true;
        ResetGraphQLProviderSingleton();
    });

    it('coalesces multiple concurrent GetEntityRecordName calls into a single GetEntityRecordNames network query', async () => {
        GraphQLWire.EnqueueResponse({
            GetEntityRecordNames: [
                {
                    EntityName: 'Accounts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '1' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'Acme Corp',
                },
                {
                    EntityName: 'Contacts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '2' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'Alice Smith',
                },
                {
                    EntityName: 'Users',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '3' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'Bob Jones',
                },
            ],
        });

        const [accName, conName, usrName] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor('1')),
            provider.GetEntityRecordName('Contacts', keyFor('2')),
            provider.GetEntityRecordName('Users', keyFor('3')),
        ]);

        expect(accName).toBe('Acme Corp');
        expect(conName).toBe('Alice Smith');
        expect(usrName).toBe('Bob Jones');

        // Only ONE request sent over the network
        expect(GraphQLWire.Requests).toHaveLength(1);
        const req = GraphQLWire.LastRequest;
        expect(req.document).toContain('GetEntityRecordNames');
        const sentInfo = req.variables?.['info'] as Array<{ EntityName: string }>;
        expect(sentInfo).toHaveLength(3);

        // Cached values should now be immediately available synchronously
        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('1'))).toBe('Acme Corp');
        expect(provider.GetCachedRecordNameOnlyIfCached('Contacts', keyFor('2'))).toBe('Alice Smith');
        expect(provider.GetCachedRecordNameOnlyIfCached('Users', keyFor('3'))).toBe('Bob Jones');
    });

    it('deduplicates identical (entityName, compositeKey) lookups within the batch', async () => {
        GraphQLWire.EnqueueResponse({
            GetEntityRecordNames: [
                {
                    EntityName: 'Accounts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '10' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'Global Megacorp',
                },
                {
                    EntityName: 'Contacts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '20' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'Charlie Brown',
                },
            ],
        });

        // 3 calls, but 2 are identical (Accounts / ID: 10)
        const [firstCall, dupCall, diffCall] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor('10')),
            provider.GetEntityRecordName('Accounts', keyFor('10')),
            provider.GetEntityRecordName('Contacts', keyFor('20')),
        ]);

        expect(firstCall).toBe('Global Megacorp');
        expect(dupCall).toBe('Global Megacorp');
        expect(diffCall).toBe('Charlie Brown');

        expect(GraphQLWire.Requests).toHaveLength(1);
        const sentInfo = GraphQLWire.LastRequest.variables?.['info'] as Array<{ EntityName: string }>;
        // Exactly 2 items sent, not 3
        expect(sentInfo).toHaveLength(2);
    });

    it('deduplicates UUIDs regardless of casing differences', async () => {
        const uuidUpper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
        const uuidLower = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

        GraphQLWire.EnqueueResponse({
            GetEntityRecordNames: [
                {
                    EntityName: 'Accounts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: uuidLower }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'UUID Corp',
                },
                {
                    EntityName: 'Contacts',
                    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '99' }] },
                    Success: true,
                    Status: 'OK',
                    RecordName: 'David Lee',
                },
            ],
        });

        const [call1, call2, call3] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor(uuidUpper)),
            provider.GetEntityRecordName('Accounts', keyFor(uuidLower)),
            provider.GetEntityRecordName('Contacts', keyFor('99')),
        ]);

        expect(call1).toBe('UUID Corp');
        expect(call2).toBe('UUID Corp');
        expect(call3).toBe('David Lee');

        expect(GraphQLWire.Requests).toHaveLength(1);
        const sentInfo = GraphQLWire.LastRequest.variables?.['info'] as Array<{ EntityName: string }>;
        expect(sentInfo).toHaveLength(2);
    });

    it('uses single GetEntityRecordNameQuery when only 1 unique item is queued', async () => {
        GraphQLWire.EnqueueResponse(singleNameResponse('Solo Company'));

        const result = await provider.GetEntityRecordName('Accounts', keyFor('100'));

        expect(result).toBe('Solo Company');
        expect(GraphQLWire.Requests).toHaveLength(1);
        expect(GraphQLWire.LastRequest.document).toContain('GetEntityRecordNameQuery');
    });

    it('uses single GetEntityRecordNameQuery when duplicate calls arrive for the only queued item', async () => {
        GraphQLWire.EnqueueResponse(singleNameResponse('Solo Company Dup'));

        const [res1, res2] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor('101')),
            provider.GetEntityRecordName('Accounts', keyFor('101')),
        ]);

        expect(res1).toBe('Solo Company Dup');
        expect(res2).toBe('Solo Company Dup');
        expect(GraphQLWire.Requests).toHaveLength(1);
        // Single item query should be used since uniqueItems.length === 1
        expect(GraphQLWire.LastRequest.document).toContain('GetEntityRecordNameQuery');
    });

    it('propagates network error to all waiting callers in the coalesced batch', async () => {
        GraphQLWire.EnqueueError(new Error('Connection failed'));

        const p1 = provider.GetEntityRecordName('Accounts', keyFor('200'));
        const p2 = provider.GetEntityRecordName('Contacts', keyFor('201'));

        await expect(p1).rejects.toThrow();
        await expect(p2).rejects.toThrow();
    });

    it('bypasses coalescing when GraphQLDataProvider.CoalesceEntityRecordNames is false', async () => {
        GraphQLDataProvider.CoalesceEntityRecordNames = false;

        GraphQLWire.EnqueueResponse(singleNameResponse('Company A'));
        GraphQLWire.EnqueueResponse(singleNameResponse('Company B'));

        const [resA, resB] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor('300')),
            provider.GetEntityRecordName('Accounts', keyFor('301')),
        ]);

        expect(resA).toBe('Company A');
        expect(resB).toBe('Company B');

        // Without coalescing, each call sends its own query
        expect(GraphQLWire.Requests).toHaveLength(2);
        expect(GraphQLWire.Requests[0].document).toContain('GetEntityRecordNameQuery');
        expect(GraphQLWire.Requests[1].document).toContain('GetEntityRecordNameQuery');
    });

    it('serves already-cached records immediately without entering the coalesce queue', async () => {
        provider.SetCachedRecordName('Accounts', keyFor('400'), 'Pre-cached Inc');

        GraphQLWire.EnqueueResponse(singleNameResponse('Uncached Corp'));

        const [cached, uncached] = await Promise.all([
            provider.GetEntityRecordName('Accounts', keyFor('400')),
            provider.GetEntityRecordName('Accounts', keyFor('401')),
        ]);

        expect(cached).toBe('Pre-cached Inc');
        expect(uncached).toBe('Uncached Corp');

        // Only 1 wire request made, for the uncached record
        expect(GraphQLWire.Requests).toHaveLength(1);
        expect(GraphQLWire.LastRequest.document).toContain('GetEntityRecordNameQuery');
    });
});
