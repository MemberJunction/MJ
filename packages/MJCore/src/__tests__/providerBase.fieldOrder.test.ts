import { describe, it, expect } from 'vitest';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import {
    EntityMetadataRow,
    EntityFieldMetadataRow,
} from '../generic/providerBase';

class OrderExposingProvider extends TestMetadataProvider {
    public runPostProcess(entities: EntityMetadataRow[], fields: EntityFieldMetadataRow[]) {
        return this.PostProcessEntityMetadata(
            entities,
            fields,
            [],
            [],
            [],
            [],
            [],
            []
        );
    }
}

describe('ProviderBase.PostProcessEntityMetadata deterministic ordering (T10)', () => {
    it('sorts entities by Name (ordinal), then by ID as tiebreaker', () => {
        const provider = new OrderExposingProvider();

        const entityA1: EntityMetadataRow = { ID: 'id-002', Name: 'Users', SchemaName: 'core' };
        const entityA2: EntityMetadataRow = { ID: 'id-001', Name: 'Users', SchemaName: 'core' };
        const entityB: EntityMetadataRow = { ID: 'id-003', Name: 'Accounts', SchemaName: 'core' };
        const entityC: EntityMetadataRow = { ID: 'id-004', Name: '_system', SchemaName: 'core' };

        // Shuffled input
        const entities = [entityA1, entityB, entityA2, entityC];
        const result = provider.runPostProcess(entities, []);

        // Ordinal order: 'Accounts' (0x41) < 'Users' (0x55) < '_system' (0x5F)
        expect(result.map(e => e.Name)).toEqual(['Accounts', 'Users', 'Users', '_system']);
        // For 'Users', tiebreak by ID: 'id-001' before 'id-002'
        expect(result[1].ID).toBe('id-001');
        expect(result[2].ID).toBe('id-002');
    });

    it('sorts fields by Sequence, then Name (ordinal), then ID (ordinal) under ties', () => {
        const provider = new OrderExposingProvider();

        const entityId = 'e1111111-1111-1111-1111-111111111111';
        const entities: EntityMetadataRow[] = [{ ID: entityId, Name: 'TestEntity', SchemaName: 'test' }];

        const fields: EntityFieldMetadataRow[] = [
            { ID: 'f-id-05', EntityID: entityId, Name: 'Zeta', Sequence: 20 },
            { ID: 'f-id-02', EntityID: entityId, Name: 'Beta', Sequence: 10 },
            { ID: 'f-id-04', EntityID: entityId, Name: 'Beta', Sequence: 10 }, // duplicate Name, Sequence tie -> tiebreak by ID
            { ID: 'f-id-01', EntityID: entityId, Name: 'Alpha', Sequence: 10 }, // Sequence tie -> tiebreak by Name
            { ID: 'f-id-03', EntityID: entityId, Name: 'Gamma', Sequence: 10 },
            { ID: 'f-id-00', EntityID: entityId, Name: 'First', Sequence: 0 },
        ];

        // Reverse input to test invariance to input order
        const result1 = provider.runPostProcess([...entities], [...fields]);
        const result2 = provider.runPostProcess([...entities], [...fields].reverse());

        const getFieldOrder = (res: typeof result1) => res[0].Fields.map(f => ({ Name: f.Name, Sequence: f.Sequence, ID: f.ID }));

        const expected = [
            { Name: 'First', Sequence: 0, ID: 'f-id-00' },
            { Name: 'Alpha', Sequence: 10, ID: 'f-id-01' },
            { Name: 'Beta', Sequence: 10, ID: 'f-id-02' },
            { Name: 'Beta', Sequence: 10, ID: 'f-id-04' },
            { Name: 'Gamma', Sequence: 10, ID: 'f-id-03' },
            { Name: 'Zeta', Sequence: 20, ID: 'f-id-05' },
        ];

        expect(getFieldOrder(result1)).toEqual(expected);
        expect(getFieldOrder(result2)).toEqual(expected);
    });
});
