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

function keyFor(id: string): CompositeKey {
    return new CompositeKey([new KeyValuePair('ID', id)]);
}

function nameResponse(name: string) {
    return { GetEntityRecordName: { Success: true, Status: 'OK', RecordName: name } };
}

describe('GraphQLDataProvider record-name cache', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    it('serves a repeated lookup from the cache without a second round trip', async () => {
        GraphQLWire.EnqueueResponse(nameResponse('Acme Corp'));

        expect(await provider.GetEntityRecordName('Accounts', keyFor('1'))).toBe('Acme Corp');
        expect(await provider.GetEntityRecordName('Accounts', keyFor('1'))).toBe('Acme Corp');

        expect(GraphQLWire.Requests).toHaveLength(1);
    });

    it('answers the synchronous lookups from what an async lookup fetched', async () => {
        GraphQLWire.EnqueueResponse(nameResponse('Acme Corp'));
        await provider.GetEntityRecordName('Accounts', keyFor('1'));

        expect(provider.HasCachedRecordName('Accounts', keyFor('1'))).toBe(true);
        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('1'))).toBe('Acme Corp');
    });

    it('keeps a name set by a loaded record for synchronous retrieval', async () => {
        provider.SetCachedRecordName('Accounts', keyFor('2'), 'Globex');

        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('2'))).toBe('Globex');
        expect(await provider.GetCachedRecordName('Accounts', keyFor('2'))).toBe('Globex');
        expect(GraphQLWire.Requests).toHaveLength(0);
    });

    it('sends only the uncached records of a batch over the wire', async () => {
        provider.SetCachedRecordName('Accounts', keyFor('1'), 'Acme Corp');
        GraphQLWire.EnqueueResponse({
            GetEntityRecordNames: [
                { EntityName: 'Accounts', CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: '2' }] }, Success: true, Status: 'OK', RecordName: 'Globex' },
            ],
        });

        const results = await provider.GetEntityRecordNames([
            { EntityName: 'Accounts', CompositeKey: keyFor('1') },
            { EntityName: 'Accounts', CompositeKey: keyFor('2') },
        ]);

        expect(results.map(r => r.RecordName)).toEqual(['Acme Corp', 'Globex']);
        const sent = GraphQLWire.LastRequest.variables?.['info'] as Array<{ EntityName: string }>;
        expect(sent).toHaveLength(1);
        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('2'))).toBe('Globex');
    });

    it('goes back over the wire when forceRefresh is set', async () => {
        GraphQLWire.EnqueueResponse(nameResponse('Acme Corp'));
        GraphQLWire.EnqueueResponse(nameResponse('Acme Corporation'));

        await provider.GetEntityRecordName('Accounts', keyFor('1'));
        const refreshed = await provider.GetEntityRecordName('Accounts', keyFor('1'), undefined, true);

        expect(refreshed).toBe('Acme Corporation');
        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('1'))).toBe('Acme Corporation');
    });
});
