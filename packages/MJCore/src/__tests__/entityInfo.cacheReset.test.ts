/**
 * EntityInfo lazy field-derived cache RESET coverage (PR Fix 2).
 *
 * Context
 * -------
 * EntityInfo memoizes eight collections derived from `this._fields`:
 *   _fieldByNameMap, _firstPrimaryKeyCache, _primaryKeysCache, _uniqueKeysCache,
 *   _foreignKeysCache, _encryptedFieldsCache, _datetimeFieldsCache, _nameFieldCache.
 * The constructor now explicitly resets all eight at the point `_fields` is (re)assigned,
 * removing the previously load-bearing "write-once after construction" invariant.
 *
 * Why this file exists
 * --------------------
 * `entityInfo.fieldIndex.test.ts` only asserted that two *separately constructed* instances
 * don't cross-contaminate — which would pass even if the reset block were deleted (each fresh
 * instance starts with null caches regardless). That test does NOT exercise the reset.
 *
 * In the production code there is exactly ONE site that assigns `_fields` and runs the reset:
 * the constructor (verified: `this._fields = []` and `this._fieldByNameMap = null` each appear
 * once). There is no public/protected re-init entry point (`copyInitData` is protected but does
 * not contain the `_fields=[]`+reset block), so a *true* second construction-time reset cannot
 * be triggered from a unit test without adding a production seam — which this round forbids.
 *
 * What we therefore do
 * --------------------
 * We drive the reset+repopulate sequence on a live instance via a minimal test-only subclass
 * that reaches the private cache fields (TS `private` is compile-time only; the existing field-
 * index test already uses `as unknown as {...}` to reach privates). Crucially, the file contains
 * a CONTROL test proving that WITHOUT the reset the memoized getters serve STALE data after a
 * `_fields` swap — i.e. the reset statements are *necessary* — and a paired test proving that
 * WITH the reset every derived getter reflects the NEW field set. This makes the assertions
 * meaningful: they encode the exact staleness bug the production reset guards against.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo } from '../generic/entityInfo';

type FieldInit = {
    ID: string; EntityID: string; Name: string; Type: string;
    IsPrimaryKey?: boolean; IsUnique?: boolean; IsNameField?: boolean;
    RelatedEntityID?: string; Encrypt?: boolean; Sequence: number; Status: string;
};

const FIELDS_A: FieldInit[] = [
    { ID: 'a1', EntityID: 'eA', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsUnique: true, Sequence: 1, Status: 'Active' },
    { ID: 'a2', EntityID: 'eA', Name: 'Name', Type: 'nvarchar', IsNameField: true, Sequence: 2, Status: 'Active' },
    { ID: 'a3', EntityID: 'eA', Name: 'CreatedAt', Type: 'datetimeoffset', Sequence: 3, Status: 'Active' },
    { ID: 'a4', EntityID: 'eA', Name: 'OwnerID', Type: 'uniqueidentifier', RelatedEntityID: 'eUser', Sequence: 4, Status: 'Active' },
    { ID: 'a5', EntityID: 'eA', Name: 'Secret', Type: 'nvarchar', Encrypt: true, Sequence: 5, Status: 'Active' },
];

// A deliberately DIFFERENT shape: different PK, different name field, no datetime/FK/encrypted
// fields, a unique field with a different name, and none of A's field names present.
const FIELDS_B: FieldInit[] = [
    { ID: 'b1', EntityID: 'eB', Name: 'Code', Type: 'nvarchar', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
    { ID: 'b2', EntityID: 'eB', Name: 'Title', Type: 'nvarchar', IsNameField: true, Sequence: 2, Status: 'Active' },
    { ID: 'b3', EntityID: 'eB', Name: 'Slug', Type: 'nvarchar', IsUnique: true, Sequence: 3, Status: 'Active' },
    { ID: 'b4', EntityID: 'eB', Name: 'UpdatedOn', Type: 'date', Sequence: 4, Status: 'Active' },
    { ID: 'b5', EntityID: 'eB', Name: 'ParentID', Type: 'uniqueidentifier', RelatedEntityID: 'eParent', Sequence: 5, Status: 'Active' },
    { ID: 'b6', EntityID: 'eB', Name: 'Token', Type: 'nvarchar', Encrypt: true, Sequence: 6, Status: 'Active' },
];

// View into EntityInfo's private cache + field storage. `private` is erased at runtime.
type EntityInternals = {
    _fields: EntityFieldInfo[];
    _fieldByNameMap: Map<string, EntityFieldInfo> | null;
    _firstPrimaryKeyCache: EntityFieldInfo | undefined;
    _primaryKeysCache: EntityFieldInfo[] | null;
    _uniqueKeysCache: EntityFieldInfo[] | null;
    _foreignKeysCache: EntityFieldInfo[] | null;
    _encryptedFieldsCache: EntityFieldInfo[] | null;
    _datetimeFieldsCache: EntityFieldInfo[] | null;
    _nameFieldCache: EntityFieldInfo | null | undefined;
    _hasSearchFields: boolean | undefined;
    _hasInactiveFields: boolean | undefined;
};

const internals = (e: EntityInfo): EntityInternals => e as unknown as EntityInternals;

/** Force every lazy derived cache to populate by reading each getter once. */
function primeAllDerivedCaches(e: EntityInfo): void {
    void e.FieldByName('ID');
    void e.FirstPrimaryKey;
    void e.PrimaryKeys;
    void e.UniqueKeys;
    void e.ForeignKeys;
    void e.EncryptedFields;
    void e.DatetimeFields;
    void e.NameField;
    void e.HasSearchFields;
    void e.HasInactiveFields;
}

/** Swap the backing `_fields` array to a brand-new field set (no cache reset). */
function swapFields(e: EntityInfo, fields: FieldInit[]): void {
    internals(e)._fields = fields.map(f => new EntityFieldInfo(f));
}

/**
 * Replicates EXACTLY the production constructor's cache-reset block (entityInfo.ts, the eight
 * `this._xCache = null/undefined` assignments). Kept in one place so the tests read clearly.
 */
function runProductionCacheReset(e: EntityInfo): void {
    const i = internals(e);
    i._fieldByNameMap = null;
    i._firstPrimaryKeyCache = undefined;
    i._primaryKeysCache = null;
    i._uniqueKeysCache = null;
    i._foreignKeysCache = null;
    i._encryptedFieldsCache = null;
    i._datetimeFieldsCache = null;
    i._nameFieldCache = undefined;
    i._hasSearchFields = undefined;
    i._hasInactiveFields = undefined;
}

function makeEntityA(): EntityInfo {
    return new EntityInfo({ ID: 'eA', Name: 'Alpha', SchemaName: 'app', BaseTable: 'Alpha', EntityFields: FIELDS_A });
}

describe('EntityInfo lazy derived-cache reset (Fix 2)', () => {
    describe('CONTROL: without the reset, memoized getters serve STALE data after a _fields swap', () => {
        // This is the bug the production constructor reset prevents. If a future re-init path
        // reassigned `_fields` but forgot to null these caches, EVERY one of these getters would
        // keep returning the OLD field set. We assert that here so the "after reset" tests below
        // are demonstrably non-tautological — the reset genuinely changes the observed behavior.
        it('FieldByName / PrimaryKeys / NameField / etc. still reflect the OLD fields', () => {
            const e = makeEntityA();
            primeAllDerivedCaches(e);
            swapFields(e, FIELDS_B); // <-- no reset

            // Stale: the index/caches were built off FIELDS_A and never invalidated.
            expect(e.FieldByName('Code')).toBeUndefined();         // new PK field invisible
            expect(e.FieldByName('Name')?.Name).toBe('Name');      // old field still resolves
            expect(e.PrimaryKeys.map(f => f.Name)).toEqual(['ID']); // old PK
            expect(e.FirstPrimaryKey.Name).toBe('ID');
            expect(e.UniqueKeys.map(f => f.Name)).toEqual(['ID']);
            expect(e.ForeignKeys.map(f => f.Name)).toEqual(['OwnerID']);
            expect(e.EncryptedFields.map(f => f.Name)).toEqual(['Secret']);
            expect(e.DatetimeFields.map(f => f.Name)).toEqual(['CreatedAt']);
            expect(e.NameField?.Name).toBe('Name');
        });
    });

    describe('WITH the reset, every derived cache reflects the NEW field set', () => {
        it('all eight caches rebuild from the new fields after reset', () => {
            const e = makeEntityA();
            primeAllDerivedCaches(e);    // populate caches off FIELDS_A
            swapFields(e, FIELDS_B);     // install new field set
            runProductionCacheReset(e);  // the production reset (constructor block)

            // FieldByName index rebuilt: new fields resolve, old fields are gone.
            expect(e.FieldByName('Code')?.Name).toBe('Code');
            expect(e.FieldByName('Title')?.Name).toBe('Title');
            expect(e.FieldByName('Slug')?.Name).toBe('Slug');
            expect(e.FieldByName('ID')).toBeUndefined();    // old PK field gone
            expect(e.FieldByName('Name')).toBeUndefined();  // old name field gone
            expect(e.FieldByName('CreatedAt')).toBeUndefined();

            // PrimaryKeys / FirstPrimaryKey reflect the new PK.
            expect(e.PrimaryKeys.map(f => f.Name)).toEqual(['Code']);
            expect(e.FirstPrimaryKey.Name).toBe('Code');

            // UniqueKeys: B's unique field is Slug, not the old ID.
            expect(e.UniqueKeys.map(f => f.Name)).toEqual(['Slug']);

            // ForeignKeys: B's FK is ParentID, not the old OwnerID.
            expect(e.ForeignKeys.map(f => f.Name)).toEqual(['ParentID']);

            // EncryptedFields: B encrypts Token, not the old Secret.
            expect(e.EncryptedFields.map(f => f.Name)).toEqual(['Token']);

            // DatetimeFields: B's date field is UpdatedOn, not the old CreatedAt.
            expect(e.DatetimeFields.map(f => f.Name)).toEqual(['UpdatedOn']);

            // NameField: B's name field is Title, not the old Name.
            expect(e.NameField?.Name).toBe('Title');
        });

        it('reset to an EMPTY field set yields empty/undefined derived caches (no stale carryover)', () => {
            const e = makeEntityA();
            primeAllDerivedCaches(e);
            internals(e)._fields = []; // no fields at all
            runProductionCacheReset(e);

            expect(e.FieldByName('ID')).toBeUndefined();
            expect(e.PrimaryKeys).toEqual([]);
            expect(e.FirstPrimaryKey).toBeUndefined();
            expect(e.UniqueKeys).toEqual([]);
            expect(e.ForeignKeys).toEqual([]);
            expect(e.EncryptedFields).toEqual([]);
            expect(e.DatetimeFields).toEqual([]);
            expect(e.NameField).toBeNull();
        });

        it('each derived getter is independently invalidated — resetting only ONE cache leaves the others stale', () => {
            // Proves the eight resets are not redundant: a partial reset (here, only the
            // FieldByName map) leaves the OTHER caches serving FIELDS_A. This is precisely why
            // the production constructor resets all eight, not just one.
            const e = makeEntityA();
            primeAllDerivedCaches(e);
            swapFields(e, FIELDS_B);
            internals(e)._fieldByNameMap = null; // reset ONLY the field index

            expect(e.FieldByName('Code')?.Name).toBe('Code'); // rebuilt
            expect(e.PrimaryKeys.map(f => f.Name)).toEqual(['ID']); // still stale (not reset)
            expect(e.DatetimeFields.map(f => f.Name)).toEqual(['CreatedAt']); // still stale
            expect(e.NameField?.Name).toBe('Name'); // still stale
        });
    });

    describe('post-reset memoization still holds (referential stability rebuilt on new fields)', () => {
        it('getters return stable references after the reset+rebuild', () => {
            const e = makeEntityA();
            primeAllDerivedCaches(e);
            swapFields(e, FIELDS_B);
            runProductionCacheReset(e);

            // First read rebuilds; subsequent reads return the SAME cached reference.
            expect(e.PrimaryKeys).toBe(e.PrimaryKeys);
            expect(e.UniqueKeys).toBe(e.UniqueKeys);
            expect(e.ForeignKeys).toBe(e.ForeignKeys);
            expect(e.EncryptedFields).toBe(e.EncryptedFields);
            expect(e.DatetimeFields).toBe(e.DatetimeFields);
            expect(e.FirstPrimaryKey).toBe(e.FirstPrimaryKey);
            expect(e.NameField).toBe(e.NameField);
            expect(e.FieldByName('Code')).toBe(e.FieldByName('code')); // case-insensitive same instance
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// HasSearchFields — MJ#4581
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Same shape as FieldInit, plus the search flag the getter reads. */
type SearchFieldInit = FieldInit & { IncludeInUserSearchAPI?: boolean };

const NO_SEARCH_FIELDS: SearchFieldInit[] = [
    { ID: 's1', EntityID: 'eS', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
    { ID: 's2', EntityID: 'eS', Name: 'Amount', Type: 'int', Sequence: 2, Status: 'Active' },
];

const WITH_SEARCH_FIELDS: SearchFieldInit[] = [
    { ID: 't1', EntityID: 'eS', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
    { ID: 't2', EntityID: 'eS', Name: 'Title', Type: 'nvarchar', Sequence: 2, Status: 'Active', IncludeInUserSearchAPI: true },
];

function makeSearchEntity(fields: SearchFieldInit[]): EntityInfo {
    return new EntityInfo({ ID: 'eS', Name: 'Searchy', SchemaName: 'app', BaseTable: 'Searchy', EntityFields: fields });
}

function swapSearchFields(e: EntityInfo, fields: SearchFieldInit[]): void {
    internals(e)._fields = fields.map(f => new EntityFieldInfo(f));
}

describe('EntityInfo.HasSearchFields (MJ#4581)', () => {
    it('is false when no field declares IncludeInUserSearchAPI', () => {
        expect(makeSearchEntity(NO_SEARCH_FIELDS).HasSearchFields).toBe(false);
    });

    it('is true when any field declares it', () => {
        expect(makeSearchEntity(WITH_SEARCH_FIELDS).HasSearchFields).toBe(true);
    });

    it('computes on first access and caches thereafter', () => {
        const e = makeSearchEntity(WITH_SEARCH_FIELDS);
        expect(internals(e)._hasSearchFields).toBeUndefined();   // nothing computed yet
        expect(e.HasSearchFields).toBe(true);
        expect(internals(e)._hasSearchFields).toBe(true);        // memoized
        expect(e.HasSearchFields).toBe(true);                    // second read is served from cache
    });

    // Pairs with the CONTROL/reset tests above: proves the reset line added for this getter is
    // load-bearing rather than decorative.
    it('CONTROL: without the reset it serves STALE data after a _fields swap', () => {
        const e = makeSearchEntity(NO_SEARCH_FIELDS);
        expect(e.HasSearchFields).toBe(false);   // prime the cache
        swapSearchFields(e, WITH_SEARCH_FIELDS); // <-- no reset
        expect(e.HasSearchFields).toBe(false);   // stale: the new searchable field is invisible
    });

    it('the production cache reset makes it reflect the NEW field set', () => {
        const e = makeSearchEntity(NO_SEARCH_FIELDS);
        expect(e.HasSearchFields).toBe(false);
        swapSearchFields(e, WITH_SEARCH_FIELDS);
        runProductionCacheReset(e);
        expect(e.HasSearchFields).toBe(true);
    });

    it('reset works in the other direction too (searchable -> not)', () => {
        const e = makeSearchEntity(WITH_SEARCH_FIELDS);
        expect(e.HasSearchFields).toBe(true);
        swapSearchFields(e, NO_SEARCH_FIELDS);
        runProductionCacheReset(e);
        expect(e.HasSearchFields).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// HasInactiveFields — the same staleness, fixed alongside HasSearchFields
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// HasInactiveFields (added 2026-06-18) post-dates the constructor reset block (2026-06-15) and
// was never added to it, so it carried the exact bug that block exists to prevent. Fixed in the
// same change as HasSearchFields because it is one line in a block already being edited.

const ALL_ACTIVE: FieldInit[] = [
    { ID: 'c1', EntityID: 'eC', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
    { ID: 'c2', EntityID: 'eC', Name: 'Name', Type: 'nvarchar', Sequence: 2, Status: 'Active' },
];

const HAS_DEPRECATED: FieldInit[] = [
    { ID: 'd1', EntityID: 'eC', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
    { ID: 'd2', EntityID: 'eC', Name: 'Legacy', Type: 'nvarchar', Sequence: 2, Status: 'Deprecated' },
];

function makeStatusEntity(fields: FieldInit[]): EntityInfo {
    return new EntityInfo({ ID: 'eC', Name: 'Statusy', SchemaName: 'app', BaseTable: 'Statusy', EntityFields: fields });
}

describe('EntityInfo.HasInactiveFields cache reset', () => {
    it('reflects the field set it was built from', () => {
        expect(makeStatusEntity(ALL_ACTIVE).HasInactiveFields).toBe(false);
        expect(makeStatusEntity(HAS_DEPRECATED).HasInactiveFields).toBe(true);
    });

    it('CONTROL: without the reset it serves STALE data after a _fields swap', () => {
        const e = makeStatusEntity(ALL_ACTIVE);
        expect(e.HasInactiveFields).toBe(false);          // prime
        internals(e)._fields = HAS_DEPRECATED.map(f => new EntityFieldInfo(f)); // no reset
        expect(e.HasInactiveFields).toBe(false);          // stale: the Deprecated field is invisible
    });

    it('the production cache reset makes it reflect the NEW field set', () => {
        const e = makeStatusEntity(ALL_ACTIVE);
        expect(e.HasInactiveFields).toBe(false);
        internals(e)._fields = HAS_DEPRECATED.map(f => new EntityFieldInfo(f));
        runProductionCacheReset(e);
        expect(e.HasInactiveFields).toBe(true);
    });
});
