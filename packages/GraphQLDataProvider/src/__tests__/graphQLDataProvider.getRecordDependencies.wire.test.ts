import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, KeyValuePair, RecordDependency } from '@memberjunction/core';
import { GraphQLWire } from './support/graphQLWire';
import {
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

describe('GraphQLDataProvider GetRecordDependencies wire behavior', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    it('sends correct GraphQL query selection set and variables', async () => {
        GraphQLWire.EnqueueResponse({
            GetRecordDependencies: [],
        });

        const key = new CompositeKey([new KeyValuePair('ID', 'CUST-001')]);
        const result = await provider.GetRecordDependencies('Customers', key);

        expect(result).toEqual([]);
        const req = GraphQLWire.LastRequest;
        expect(req.document).toContain('PrimaryKey');
        expect(req.document).toContain('IsSoftLink');
        expect(req.document).toContain('EntityIDFieldName');
        expect(req.document).not.toContain('CompositeKey {');
        expect(req.variables).toEqual({
            entityName: 'Customers',
            CompositeKey: {
                KeyValuePairs: [{ FieldName: 'ID', Value: 'CUST-001' }],
            },
        });
    });

    it('rehydrates hard foreign-key dependencies with a real CompositeKey instance', async () => {
        GraphQLWire.EnqueueResponse({
            GetRecordDependencies: [
                {
                    EntityName: 'Customers',
                    RelatedEntityName: 'Orders',
                    FieldName: 'CustomerID',
                    PrimaryKey: {
                        KeyValuePairs: [{ FieldName: 'ID', Value: 'ORD-1001' }],
                    },
                    IsSoftLink: null,
                    EntityIDFieldName: null,
                },
            ],
        });

        const key = new CompositeKey([new KeyValuePair('ID', 'CUST-001')]);
        const deps = await provider.GetRecordDependencies('Customers', key);

        expect(deps).toHaveLength(1);
        const dep = deps[0];
        expect(dep).toBeInstanceOf(RecordDependency);
        expect(dep.EntityName).toBe('Customers');
        expect(dep.RelatedEntityName).toBe('Orders');
        expect(dep.FieldName).toBe('CustomerID');
        expect(dep.PrimaryKey).toBeInstanceOf(CompositeKey);
        expect(dep.PrimaryKey.GetValueByFieldName('ID')).toBe('ORD-1001');
        expect(dep.IsSoftLink).toBeUndefined();
        expect(dep.EntityIDFieldName).toBeUndefined();
    });

    it('rehydrates polymorphic soft-link dependencies preserving IsSoftLink and EntityIDFieldName', async () => {
        GraphQLWire.EnqueueResponse({
            GetRecordDependencies: [
                {
                    EntityName: 'Users',
                    RelatedEntityName: 'RecordChanges',
                    FieldName: 'RecordID',
                    PrimaryKey: {
                        KeyValuePairs: [{ FieldName: 'ID', Value: 'CHG-9999' }],
                    },
                    IsSoftLink: true,
                    EntityIDFieldName: 'EntityID',
                },
            ],
        });

        const key = new CompositeKey([new KeyValuePair('ID', 'USER-001')]);
        const deps = await provider.GetRecordDependencies('Users', key);

        expect(deps).toHaveLength(1);
        const dep = deps[0];
        expect(dep).toBeInstanceOf(RecordDependency);
        expect(dep.EntityName).toBe('Users');
        expect(dep.RelatedEntityName).toBe('RecordChanges');
        expect(dep.FieldName).toBe('RecordID');
        expect(dep.PrimaryKey).toBeInstanceOf(CompositeKey);
        expect(dep.PrimaryKey.GetValueByFieldName('ID')).toBe('CHG-9999');
        expect(dep.IsSoftLink).toBe(true);
        expect(dep.EntityIDFieldName).toBe('EntityID');
    });

    it('handles null or missing response gracefully', async () => {
        GraphQLWire.EnqueueResponse({});

        const key = new CompositeKey([new KeyValuePair('ID', 'CUST-001')]);
        const deps = await provider.GetRecordDependencies('Customers', key);

        expect(deps).toEqual([]);
    });
});
