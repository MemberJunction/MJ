import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

describe('EntityInfo RelatedEntities deterministic ordering (T10)', () => {
    it('sorts RelatedEntities by Sequence, then RelatedEntity (ordinal), then ID (ordinal) under ties', () => {
        const entity = new EntityInfo({
            ID: 'entity-1',
            Name: 'Orders',
            EntityRelationships: [
                { ID: 'r-05', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'Users', Sequence: 20 },
                { ID: 'r-02', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'Customers', Sequence: 10 },
                { ID: 'r-04', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'Customers', Sequence: 10 }, // Duplicate name, Sequence tie -> tiebreak by ID
                { ID: 'r-01', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'Accounts', Sequence: 10 },  // Sequence tie -> tiebreak by RelatedEntity name
                { ID: 'r-03', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'Products', Sequence: 10 },
                { ID: 'r-00', Entity: 'Orders', EntityID: 'entity-1', RelatedEntity: 'FirstItem', Sequence: 1 },
            ]
        });

        const actual = entity.RelatedEntities.map(r => ({
            RelatedEntity: r.RelatedEntity,
            Sequence: r.Sequence,
            ID: r.ID
        }));

        const expected = [
            { RelatedEntity: 'FirstItem', Sequence: 1, ID: 'r-00' },
            { RelatedEntity: 'Accounts', Sequence: 10, ID: 'r-01' },
            { RelatedEntity: 'Customers', Sequence: 10, ID: 'r-02' },
            { RelatedEntity: 'Customers', Sequence: 10, ID: 'r-04' },
            { RelatedEntity: 'Products', Sequence: 10, ID: 'r-03' },
            { RelatedEntity: 'Users', Sequence: 20, ID: 'r-05' },
        ];

        expect(actual).toEqual(expected);
    });

    it('is invariant to input order of RelatedEntities', () => {
        const rels = [
            { ID: 'r-03', Entity: 'E', EntityID: 'e-1', RelatedEntity: 'Gamma', Sequence: 10 },
            { ID: 'r-01', Entity: 'E', EntityID: 'e-1', RelatedEntity: 'Alpha', Sequence: 10 },
            { ID: 'r-02', Entity: 'E', EntityID: 'e-1', RelatedEntity: 'Beta', Sequence: 10 },
        ];

        const entity1 = new EntityInfo({ ID: 'e-1', Name: 'E', EntityRelationships: [...rels] });
        const entity2 = new EntityInfo({ ID: 'e-1', Name: 'E', EntityRelationships: [...rels].reverse() });

        const getNames = (e: EntityInfo) => e.RelatedEntities.map(r => r.RelatedEntity);
        expect(getNames(entity1)).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(getNames(entity2)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
});
