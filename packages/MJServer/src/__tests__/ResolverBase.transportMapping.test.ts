import { describe, it, expect } from 'vitest';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';

/**
 * Regression guard for the server-cache corruption behind
 * "Field _mj__CreatedAt does not exist on MJ: Template Categories".
 *
 * GraphQL reserves the `__` prefix, so MJ renames `__mj_*` columns to the
 * transport alias `_mj__*` on the way out. `ResolverBase` used to apply that
 * rename IN PLACE over `result.Results` — but those are the data provider's own
 * row objects, and the server's cache holds them BY REFERENCE. Preparing one
 * GraphQL response therefore rewrote the keys inside the live cache, and every
 * subsequent read served from it handed the client transport-shaped rows that
 * `BaseEntity.SetMany` rejects. Process-wide cache ⇒ one response poisoned every
 * later request, across all workers.
 *
 * The fix is copy-then-map. These tests pin the two invariants that make it
 * correct, at the `FieldMapper` boundary the resolver depends on.
 */
describe('FieldMapper transport mapping — cache safety', () => {
    it('MapFields MUTATES its argument (the hazard the resolver must not expose the cache to)', () => {
        // Documents WHY the resolver must copy. If this ever becomes non-mutating,
        // the copy in ResolverBase is redundant rather than load-bearing — and this
        // test failing is the signal to revisit it.
        const row: Record<string, unknown> = { ID: 'a1', Name: 'Cat', __mj_CreatedAt: 'T0' };

        new FieldMapper().MapFields(row);

        expect(row.__mj_CreatedAt).toBeUndefined();
        expect(row._mj__CreatedAt).toBe('T0');
    });

    it('copy-then-map leaves the source row untouched while returning transport keys', () => {
        // This is exactly what ResolverBase now does: `Results.map(r => mapper.MapFields({ ...r }))`.
        const mapper = new FieldMapper();
        const cachedRow: Record<string, unknown> = { ID: 'a1', Name: 'Cat', __mj_CreatedAt: 'T0', __mj_UpdatedAt: 'T1' };
        const cachedRows = [cachedRow];

        const wireRows = cachedRows.map(r => mapper.MapFields({ ...r }));

        // The cached row still carries entity field names — safe to hydrate later.
        expect(cachedRow.__mj_CreatedAt).toBe('T0');
        expect(cachedRow.__mj_UpdatedAt).toBe('T1');
        expect(cachedRow._mj__CreatedAt).toBeUndefined();

        // The outgoing copy carries the GraphQL-legal aliases.
        expect(wireRows[0]?._mj__CreatedAt).toBe('T0');
        expect(wireRows[0]?._mj__UpdatedAt).toBe('T1');
        expect(wireRows[0]?.__mj_CreatedAt).toBeUndefined();

        // Identity must differ, or nothing was actually copied.
        expect(wireRows[0]).not.toBe(cachedRow);
    });

    it('post-map mutation of the copy cannot reach the cached row', () => {
        // ArrayFilterEncryptedFieldsForAPI redacts in place after mapping; on the
        // pre-fix code that stripped secrets out of the CACHED row too.
        const mapper = new FieldMapper();
        const cachedRow: Record<string, unknown> = { ID: 'a1', Secret: 'plaintext', __mj_CreatedAt: 'T0' };

        const wireRow = mapper.MapFields({ ...cachedRow });
        wireRow.Secret = null; // stand-in for the encrypted-field filter

        expect(cachedRow.Secret).toBe('plaintext');
        expect(wireRow.Secret).toBeNull();
    });

    it('round-trips a mapped copy back to entity field names', () => {
        // The client's ConvertBackToMJFields must undo exactly what the server did.
        const mapper = new FieldMapper();
        const original: Record<string, unknown> = { ID: 'a1', __mj_CreatedAt: 'T0', __mj_UpdatedAt: 'T1' };

        const wire = mapper.MapFields({ ...original });
        const back = mapper.ReverseMapFields({ ...wire });

        expect(back).toEqual(original);
    });

    it('leaves rows without __mj_ fields structurally unchanged', () => {
        const mapper = new FieldMapper();
        const row = { ID: 'a1', Name: 'Cat' };

        expect(mapper.MapFields({ ...row })).toEqual(row);
    });
});
