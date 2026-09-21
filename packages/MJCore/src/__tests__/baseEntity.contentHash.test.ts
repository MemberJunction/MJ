import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { computeContentHashAsync } from '@memberjunction/global';

describe('BaseEntity.ComputeContentHash', () => {
    class MockEntity extends BaseEntity {}

    const entityInfo = new EntityInfo({
        ID: 'mock-entity-id',
        Name: 'MockEntity',
        BaseTable: 'MockEntity',
        BaseView: 'vwMockEntities',
        Status: 'Active',
        Fields: [
            {
                ID: 'f1',
                Name: 'Name',
                Type: 'nvarchar',
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f2',
                Name: 'Score',
                Type: 'int',
                AllowsNull: true,
                Status: 'Active',
            },
            {
                ID: 'f3',
                Name: '__mj_CreatedAt',
                Type: 'datetimeoffset',
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f4',
                Name: '__mj_UpdatedAt',
                Type: 'datetimeoffset',
                AllowsNull: false,
                Status: 'Active',
            },
        ],
    });

    it('computes content hash excluding system fields (__mj_*) by default', async () => {
        const entity = new MockEntity(entityInfo);
        entity.Set('Name', 'Test Name');
        entity.Set('Score', 42);
        entity.Set('__mj_CreatedAt', new Date('2026-01-01T00:00:00.000Z'));
        entity.Set('__mj_UpdatedAt', new Date('2026-01-02T00:00:00.000Z'));

        const hash = await entity.ComputeContentHash();
        const expected = await computeContentHashAsync({
            Name: 'Test Name',
            Score: 42,
        });

        expect(hash).toBe(expected);
    });

    it('honors explicit Fields projection', async () => {
        const entity = new MockEntity(entityInfo);
        entity.Set('Name', 'Test Name');
        entity.Set('Score', 42);

        const hash = await entity.ComputeContentHash({ Fields: ['Name'] });
        const expected = await computeContentHashAsync({
            Name: 'Test Name',
        });

        expect(hash).toBe(expected);
    });

    it('includes system fields when ExcludeSystemFields is explicitly false', async () => {
        const entity = new MockEntity(entityInfo);
        const d = new Date('2026-01-01T00:00:00.000Z');
        entity.Set('Name', 'Test Name');
        entity.Set('Score', 42);
        entity.Set('__mj_CreatedAt', d);
        entity.Set('__mj_UpdatedAt', d);

        const hash = await entity.ComputeContentHash({ ExcludeSystemFields: false });
        const expected = await computeContentHashAsync({
            Name: 'Test Name',
            Score: 42,
            __mj_CreatedAt: d,
            __mj_UpdatedAt: d,
        });

        expect(hash).toBe(expected);
    });

    it('produces identical hash regardless of field assignment order', async () => {
        const entity1 = new MockEntity(entityInfo);
        entity1.Set('Name', 'Alpha');
        entity1.Set('Score', 10);

        const entity2 = new MockEntity(entityInfo);
        entity2.Set('Score', 10);
        entity2.Set('Name', 'Alpha');

        const hash1 = await entity1.ComputeContentHash();
        const hash2 = await entity2.ComputeContentHash();

        expect(hash1).toBe(hash2);
    });
});
