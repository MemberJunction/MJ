import { describe, it, expect } from 'vitest';
import { CompositeKey, KeyValuePair, type EntityInfo, type EntityFieldInfo } from '@memberjunction/core';
import { DeriveTargetKey, KeyStrategyFor, SingleKeyField, ToCompositeKey, ToRecordKeyString } from '../CloneKeys';

const field = (f: Partial<EntityFieldInfo>) => f as EntityFieldInfo;
const entity = (name: string, pks: Array<Partial<EntityFieldInfo>>, extra: Array<Partial<EntityFieldInfo>> = []) =>
    ({ Name: name, PrimaryKeys: pks.map(field), Fields: [...pks, ...extra].map(field) }) as unknown as EntityInfo;

const uuidEntity = entity('Parents', [{ Name: 'ID', Type: 'uniqueidentifier' }]);
const identityEntity = entity('Counters', [{ Name: 'ID', Type: 'int', AutoIncrement: true }]);
const naturalEntity = entity('Codes', [{ Name: 'Code', Type: 'nvarchar' }]);
const isaChild = entity('Children', [{ Name: 'ID', Type: 'uniqueidentifier', RelatedEntityID: 'p', RelatedEntity: 'Parents' }]);
const junction = entity('Parent Tags', [
    { Name: 'ParentID', Type: 'uniqueidentifier', RelatedEntityID: 'p', RelatedEntity: 'Parents' },
    { Name: 'TagID', Type: 'uniqueidentifier', RelatedEntityID: 't', RelatedEntity: 'Tags' },
]);

describe('KeyStrategyFor', () => {
    it('mints a UUID for a single uniqueidentifier key', () => expect(KeyStrategyFor(uuidEntity)).toBe('mint'));
    it('mints for a PostgreSQL uuid key too', () =>
        expect(KeyStrategyFor(entity('PgParents', [{ Name: 'ID', Type: 'uuid' }]))).toBe('mint'));
    it('lets the database assign an auto-increment key', () => expect(KeyStrategyFor(identityEntity)).toBe('server'));
    it('derives natural, composite and IS-A (key is an FK) keys', () => {
        expect(KeyStrategyFor(naturalEntity)).toBe('derived');
        expect(KeyStrategyFor(junction)).toBe('derived');
        expect(KeyStrategyFor(isaChild)).toBe('derived');
    });
});

describe('DeriveTargetKey', () => {
    const source = new CompositeKey([new KeyValuePair('ParentID', 'p-1'), new KeyValuePair('TagID', 't-9')]);

    it('remaps FK key columns to cloned rows and keeps the rest', () => {
        const { Key, Changed } = DeriveTargetKey(junction, source, { 'Parents::p-1': 'p-new' });
        expect(Key.KeyValuePairs.map((p) => [p.FieldName, p.Value])).toEqual([['ParentID', 'p-new'], ['TagID', 't-9']]);
        expect(Changed).toBe(true);
    });

    it('reports an unchanged key when no key column points at a cloned row', () => {
        expect(DeriveTargetKey(junction, source, {}).Changed).toBe(false);
    });

    it('leaves a column pointing at a database-keyed parent empty and counts it as changed', () => {
        const { Key, Changed } = DeriveTargetKey(junction, source, {}, new Set(['Parents::p-1']));
        expect(Key.KeyValuePairs.map((p) => [p.FieldName, p.Value])).toEqual([['ParentID', null], ['TagID', 't-9']]);
        expect(Changed).toBe(true);
    });

    it('gives an IS-A child the same new key as its cloned parent', () => {
        const { Key } = DeriveTargetKey(isaChild, new CompositeKey([new KeyValuePair('ID', 'p-1')]), { 'Parents::p-1': 'p-new' });
        expect(Key.KeyValuePairs[0].Value).toBe('p-new');
    });
});

describe('record-id strings', () => {
    it('uses the bare value for one column and the full segment for several', () => {
        expect(ToRecordKeyString('ID|abc')).toBe('abc');
        expect(ToRecordKeyString('abc')).toBe('abc');
        expect(ToRecordKeyString({ KeyValuePairs: [{ FieldName: 'A', Value: '1' }, { FieldName: 'B', Value: '2' }] })).toBe('A|1||B|2');
    });

    it('parses every column back', () => {
        expect(ToCompositeKey(junction, 'ParentID|p-1||TagID|t-9').KeyValuePairs.map((p) => p.Value)).toEqual(['p-1', 't-9']);
    });
});

describe('SingleKeyField', () => {
    it('returns the only key column and refuses a composite key', () => {
        expect(SingleKeyField(uuidEntity, 'test')).toBe('ID');
        expect(() => SingleKeyField(junction, 'Joining')).toThrow("'Parent Tags' has a 2-column primary key");
    });
});
