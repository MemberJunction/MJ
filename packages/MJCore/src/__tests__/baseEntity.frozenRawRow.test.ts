/**
 * BaseEntity raw-mode reads against a FROZEN source row.
 *
 * `LoadFromData`'s fast path keeps the caller's row BY REFERENCE (`_raw`) and defers building
 * EntityField instances — the dominant warm-load case, where the row is typically a
 * LocalCacheManager cache entry. Since the cache deep-freezes rows on reference-sharing storage
 * providers, `_raw` is frequently frozen.
 *
 * The trap this pins: `Get()` writes back into `_raw` to MEMOIZE a converted Date (and an
 * rtrimmed fixed-width string). On a frozen row that write throws, so merely READING such a
 * field turned into a `TypeError` — which is exactly how `Cannot assign to read only property
 * 'Currency'` broke AI cost calculation (`Currency` is a fixed-width column). Found by the live
 * IT70 integration run, not by any unit test, so it gets one here.
 *
 * The memo is an optimization, never a correctness requirement: skipping it costs a re-parse per
 * read and nothing else. These tests assert the read still returns the right converted value.
 *
 * NOTE on the fixture: the raw-mode fast path requires a plain-object load into a fresh instance
 * of a NON-parent-type entity with primary keys (`canTakeFastPath`). The shared MockEntityData
 * entities are all parent types (they have children), which silently routes to the hydrated path
 * and would make these tests pass for the wrong reason — so this file defines its own childless
 * entity and asserts the fast path was actually taken.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';

const CACHED_ROW_ENTITY_ID = 'entity-cachedrow-001';

/** Childless entity (so IsParentType === false) with a PK, a datetime2, and a fixed-width char. */
const CACHED_ROW_ENTITY_DATA = {
    ID: CACHED_ROW_ENTITY_ID,
    Name: 'CachedRows',
    BaseTable: 'CachedRow',
    BaseView: 'vwCachedRows',
    SchemaName: 'dbo',
    VirtualEntity: false,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    IncludeInAPI: true,
    Status: 'Active',
    EntityFields: [
        makeField('f-cr-id', 'ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
        makeField('f-cr-start', 'StartTime', 'datetime2', { Sequence: 2 }),
        makeField('f-cr-currency', 'Currency', 'nchar', { Sequence: 3, Length: 3 }),
    ],
    EntityPermissions: [],
    EntityRelationships: [],
    EntitySettings: [],
};

function makeField(
    id: string,
    name: string,
    type: string,
    overrides: Record<string, unknown> = {}
): Record<string, unknown> {
    return {
        ID: id,
        EntityID: CACHED_ROW_ENTITY_ID,
        Name: name,
        Type: type,
        IsPrimaryKey: false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: true,
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        Sequence: 1,
        Status: 'Active',
        Entity: 'CachedRows',
        EntityFieldValues: [],
        ...overrides,
    };
}

/** Exposes the private raw-mode state so the tests can prove which path ran. */
class MJCachedRowEntity extends BaseEntity {
    public get RawModeActive(): boolean {
        const s = this as unknown as { _raw: unknown; _fieldsHydrated: boolean };
        return s._raw !== null && !s._fieldsHydrated;
    }
    public get RawIsFrozen(): boolean {
        return (this as unknown as { _rawIsFrozen: boolean })._rawIsFrozen;
    }
}

let entityInfo: EntityInfo;

beforeAll(() => {
    entityInfo = new EntityInfo(CACHED_ROW_ENTITY_DATA);
    Metadata.Provider = {
        Entities: [entityInfo],
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

function frozenRow(): Record<string, unknown> {
    return Object.freeze({
        ID: 'cr-1',
        StartTime: '2026-01-15T10:30:00.000Z',
        Currency: 'USD  ',
    }) as Record<string, unknown>;
}

describe('BaseEntity raw-mode read of a frozen cache row', () => {
    it('takes the raw-mode fast path and records the source row as frozen', async () => {
        // Guard against a vacuous suite: if this fails, the tests below prove nothing.
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        expect(entity.RawModeActive).toBe(true);
        expect(entity.RawIsFrozen).toBe(true);
    });

    it('converts a string date field without throwing on the frozen source', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        let value: unknown;
        expect(() => { value = entity.Get('StartTime'); }).not.toThrow();
        expect(value).toBeInstanceOf(Date);
        expect((value as Date).toISOString()).toBe('2026-01-15T10:30:00.000Z');
    });

    it('rtrims a fixed-width field without throwing (the Currency failure mode)', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        let value: unknown;
        expect(() => { value = entity.Get('Currency'); }).not.toThrow();
        expect(value).toBe('USD');
    });

    it('returns the same converted value on repeated reads (memo skipped, not broken)', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        const first = entity.Get('StartTime') as Date;
        const second = entity.Get('StartTime') as Date;
        expect(second.getTime()).toBe(first.getTime());
        expect(entity.Get('Currency')).toBe(entity.Get('Currency'));
    });

    it('leaves the frozen source row unmodified', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        const row = frozenRow();
        await entity.LoadFromData(row);

        entity.Get('StartTime');
        entity.Get('Currency');

        // No Date and no trimmed string memoized into the shared cache row.
        expect(typeof row['StartTime']).toBe('string');
        expect(row['StartTime']).toBe('2026-01-15T10:30:00.000Z');
        expect(row['Currency']).toBe('USD  ');
    });

    it('still memoizes when the source row is NOT frozen (optimization preserved)', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        const row: Record<string, unknown> = {
            ID: 'cr-1',
            StartTime: '2026-01-15T10:30:00.000Z',
            Currency: 'USD  ',
        };
        await entity.LoadFromData(row);
        expect(entity.RawIsFrozen).toBe(false);

        entity.Get('StartTime');
        entity.Get('Currency');

        // Unfrozen rows keep the write-back memo — the fast path is unchanged for them.
        expect(row['StartTime']).toBeInstanceOf(Date);
        expect(row['Currency']).toBe('USD');
    });

    it('a frozen row does not block writing fields on the entity itself', async () => {
        // Hydration copies values into EntityField instances, so the entity stays mutable even
        // though its source row is not. This keeps load-mutate-Save working on cache hits.
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        expect(() => { entity.Set('StartTime', new Date('2027-02-02T00:00:00.000Z')); }).not.toThrow();
        expect((entity.Get('StartTime') as Date).toISOString()).toBe('2027-02-02T00:00:00.000Z');
    });
});
