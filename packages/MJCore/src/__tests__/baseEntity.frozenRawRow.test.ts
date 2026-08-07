/**
 * BaseEntity raw-mode reads against a FROZEN source row.
 *
 * `LoadFromData`'s fast path keeps the caller's row BY REFERENCE (`_raw`) and defers building
 * EntityField instances — the dominant warm-load case, where the row is typically a
 * LocalCacheManager cache entry. Since the cache deep-freezes rows on reference-sharing storage
 * providers, `_raw` is frequently frozen.
 *
 * The trap this pins: `Get()` used to write back into `_raw` to MEMOIZE a converted Date (and an
 * rtrimmed fixed-width string). On a frozen row that write throws, so merely READING such a
 * field turned into a `TypeError` — which is exactly how `Cannot assign to read only property
 * 'Currency'` broke AI cost calculation (`Currency` is a fixed-width column). Found by the live
 * IT71 integration run, not by any unit test, so it gets one here.
 *
 * `Get()` now memoizes into a per-instance side table instead of the row, so the source row is
 * never written to at all — frozen or not. See `baseEntity.rawConversionMemo.test.ts` for why the
 * earlier "sample Object.isFrozen once at load and skip the memo" mitigation could not be made
 * correct (the freeze is asynchronous relative to the consumer, so the sample goes stale).
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
    /** Number of conversions memoized into the per-instance side table (0 when none yet). */
    public get MemoizedConversionCount(): number {
        return (this as unknown as { _rawConverted: Map<string, unknown> | null })._rawConverted?.size ?? 0;
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
    it('takes the raw-mode fast path (guard against a vacuous suite)', async () => {
        // If this fails, the tests below prove nothing — they would be exercising the hydrated
        // path, which copies values into EntityField instances and never touches the source row.
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        expect(entity.RawModeActive).toBe(true);
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

    it('memoizes into the side table and leaves an UNFROZEN source row alone too', async () => {
        // Non-mutation is unconditional, not a frozen-row special case: the row may be shared
        // whether or not the freeze has landed on it yet.
        const entity = new MJCachedRowEntity(entityInfo);
        const row: Record<string, unknown> = {
            ID: 'cr-1',
            StartTime: '2026-01-15T10:30:00.000Z',
            Currency: 'USD  ',
        };
        await entity.LoadFromData(row);
        expect(entity.MemoizedConversionCount).toBe(0);

        entity.Get('StartTime');
        entity.Get('Currency');

        // Both conversions cached on the instance...
        expect(entity.MemoizedConversionCount).toBe(2);
        // ...and the caller's row is untouched.
        expect(row['StartTime']).toBe('2026-01-15T10:30:00.000Z');
        expect(row['Currency']).toBe('USD  ');
    });

    it('memoizes on a FROZEN row as well — the optimization is no longer given up', async () => {
        const entity = new MJCachedRowEntity(entityInfo);
        await entity.LoadFromData(frozenRow());

        const first = entity.Get('StartTime');
        expect(entity.MemoizedConversionCount).toBe(1);
        // Same instance back, rather than a fresh re-parse per read.
        expect(entity.Get('StartTime')).toBe(first);
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
