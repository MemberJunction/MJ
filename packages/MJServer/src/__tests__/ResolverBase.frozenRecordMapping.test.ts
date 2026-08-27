// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * `MapFieldNamesToCodeNames` must not write into the rows it is handed
 * (PR #3425 review, finding M2).
 *
 * This is the SINGLE-RECORD half of the transport rename. The RunView half was fixed to
 * copy-then-map, but this one still renamed `__mj_*` → `_mj__*` by writing onto its argument —
 * and its arguments are frequently rows straight out of `findBy`/`RunView`, i.e. the server
 * cache's own objects.
 *
 * On this line the corruption is SILENT: the rename rewrites the cached row's keys in place and
 * later readers are served transport-shaped rows that `BaseEntity.SetMany` rejects. Freezing the
 * fixtures below is how that silent write is turned into a visible failure — the rows are not
 * frozen at runtime here. (Under 6.x freeze-on-write the same bug surfaces directly, as
 * "Cannot add property _mj__CreatedAt, object is not extensible".)
 *
 * It reaches every call, because `MJ: Users` has caching enabled. `UserByID` and
 * `UserByEmployeeID` share the code path, and so does every CodeGen-generated single-record
 * resolver in `generated.ts` (`MapFieldNamesToCodeNames(entity, rows[0], ...)`), which is why
 * the fix belongs in the shared helper rather than at the call sites.
 */

/** Exposes the two protected mappers and supplies metadata without a live provider. */
class MappingProbe extends ResolverBase {
    public MapOne(entityName: string, dataObject: unknown, provider: IMetadataProvider): Promise<unknown> {
        return this.MapFieldNamesToCodeNames(entityName, dataObject, undefined, provider);
    }
    public MapMany(entityName: string, rows: unknown[], provider: IMetadataProvider, contextUser?: UserInfo): Promise<unknown[]> {
        return this.ArrayMapFieldNamesToCodeNames(entityName, rows as Record<string, unknown>[], contextUser, provider);
    }
}

const ENTITY_NAME = 'MJ: Users';

/**
 * Minimal metadata: the field set drives the rename, `EncryptedFields` empty so the
 * EncryptionEngine is never consulted.
 */
function fakeProvider(): IMetadataProvider {
    return {
        EntityByName: (name: string) =>
            name === ENTITY_NAME
                ? {
                      Name: ENTITY_NAME,
                      Fields: [
                          { Name: 'ID', CodeName: 'ID' },
                          { Name: 'Name', CodeName: 'Name' },
                          { Name: '__mj_CreatedAt', CodeName: '__mj_CreatedAt' },
                          { Name: '__mj_UpdatedAt', CodeName: '__mj_UpdatedAt' },
                      ],
                      EncryptedFields: [],
                  }
                : undefined,
    } as unknown as IMetadataProvider;
}

/** A row as the cache hands it out: deep-frozen. */
function frozenCachedRow(): Record<string, unknown> {
    return Object.freeze({
        ID: 'u-1',
        Name: 'Ada',
        __mj_CreatedAt: 'T0',
        __mj_UpdatedAt: 'T1',
    }) as Record<string, unknown>;
}

describe('MapFieldNamesToCodeNames on frozen cache rows', () => {
    it('maps a FROZEN row to transport keys instead of throwing (the live UserByEmail 500)', async () => {
        const row = frozenCachedRow();

        const mapped = (await new MappingProbe().MapOne(ENTITY_NAME, row, fakeProvider())) as Record<string, unknown>;

        expect(mapped._mj__CreatedAt).toBe('T0');
        expect(mapped._mj__UpdatedAt).toBe('T1');
        expect(mapped.ID).toBe('u-1');
        expect(mapped.Name).toBe('Ada');
        // The transport aliases replace the originals in the OUTGOING shape.
        expect(mapped.__mj_CreatedAt).toBeUndefined();
    });

    it('returns a copy — the caller\'s row keeps its entity field names', async () => {
        // Unfrozen input, so a regression to in-place mapping would silently pass the frozen
        // test above only if it also stopped mapping. This one pins non-mutation directly.
        const row: Record<string, unknown> = { ID: 'u-1', Name: 'Ada', __mj_CreatedAt: 'T0', __mj_UpdatedAt: 'T1' };

        const mapped = (await new MappingProbe().MapOne(ENTITY_NAME, row, fakeProvider())) as Record<string, unknown>;

        expect(row.__mj_CreatedAt).toBe('T0');
        expect(row._mj__CreatedAt).toBeUndefined();
        expect(mapped).not.toBe(row);
    });

    it('still returns null for empty/absent input (contract unchanged)', async () => {
        const probe = new MappingProbe();
        expect(await probe.MapOne(ENTITY_NAME, null, fakeProvider())).toBeNull();
        expect(await probe.MapOne(ENTITY_NAME, {}, fakeProvider())).toBeNull();
    });

    it('leaves rows with no __mj_ fields structurally intact', async () => {
        const row = Object.freeze({ ID: 'u-1', Name: 'Ada' }) as Record<string, unknown>;

        const mapped = (await new MappingProbe().MapOne(ENTITY_NAME, row, fakeProvider())) as Record<string, unknown>;

        expect(mapped).toEqual({ ID: 'u-1', Name: 'Ada' });
    });
});

describe('ArrayMapFieldNamesToCodeNames on frozen cache rows', () => {
    it('maps a frozen ARRAY of frozen rows without mutating either', async () => {
        // The array is frozen as well as the rows: returning the caller's array (rather than a
        // new one) is its own hazard, since `results.sort()`/`.push()` downstream would then be
        // mutating cache-owned state. Freezing both is what makes that failure visible here.
        const rows = Object.freeze([frozenCachedRow(), frozenCachedRow()]) as unknown as Record<string, unknown>[];

        const mapped = (await new MappingProbe().MapMany(ENTITY_NAME, rows, fakeProvider())) as Record<string, unknown>[];

        expect(mapped).toHaveLength(2);
        expect(mapped[0]._mj__CreatedAt).toBe('T0');
        expect(mapped[1]._mj__UpdatedAt).toBe('T1');
        // Inputs untouched.
        expect(rows[0].__mj_CreatedAt).toBe('T0');
        expect(rows[0]._mj__CreatedAt).toBeUndefined();
        expect(mapped[0]).not.toBe(rows[0]);
    });

    it('passes an empty array straight through', async () => {
        expect(await new MappingProbe().MapMany(ENTITY_NAME, [], fakeProvider())).toEqual([]);
    });
});
