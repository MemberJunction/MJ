/**
 * Tests for the scoped-entity-regeneration plumbing (Phase A of PR #2342).
 *
 * Covers the pieces that don't require a live database connection:
 *   - Provider getPendingEntityFieldsSQL emits the scope filter only when entityIDs are supplied
 *   - SP wrapper SQL produced by callRoutineSQL passes @EntityIDs as a comma-delimited list
 *     when scoped (one SP call, not one-per-entity)
 *
 * The end-to-end "manageEntityFields fast-exits on empty filter" path is verified
 * indirectly here by asserting the contract its callees honor.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';

describe('Phase A — scoped entity field plumbing', () => {
    describe('SQLServerCodeGenProvider.getPendingEntityFieldsSQL', () => {
        const provider = new SQLServerCodeGenProvider();

        it('omits the entity scope filter when entityIDs is undefined (preserves prior behavior)', () => {
            const sql = provider.getPendingEntityFieldsSQL('__mj');
            expect(sql).not.toMatch(/AND\s+sf\.EntityID\s+IN\b/);
        });

        it('omits the entity scope filter when entityIDs is empty', () => {
            const sql = provider.getPendingEntityFieldsSQL('__mj', []);
            expect(sql).not.toMatch(/AND\s+sf\.EntityID\s+IN\b/);
        });

        it('adds AND sf.EntityID IN (...) when entityIDs is supplied', () => {
            const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
            const sql = provider.getPendingEntityFieldsSQL('__mj', ids);
            expect(sql).toContain("'11111111-1111-1111-1111-111111111111'");
            expect(sql).toContain("'22222222-2222-2222-2222-222222222222'");
            expect(sql).toMatch(/AND\s+sf\.EntityID\s+IN\b/);
        });

        it('still applies EntityFieldID IS NULL filter alongside the scope filter', () => {
            const sql = provider.getPendingEntityFieldsSQL('__mj', ['33333333-3333-3333-3333-333333333333']);
            // Both filters must be present — EntityFieldID null check is the orphan-detection
            // semantic, the scope filter is performance-only and must not displace it
            expect(sql).toContain('EntityFieldID IS NULL');
            expect(sql).toMatch(/AND\s+sf\.EntityID\s+IN\b/);
        });
    });

    describe('PostgreSQLCodeGenProvider.getPendingEntityFieldsSQL', () => {
        const provider = new PostgreSQLCodeGenProvider();

        it('omits the entity scope filter when entityIDs is undefined', () => {
            const sql = provider.getPendingEntityFieldsSQL('__mj');
            expect(sql).not.toMatch(/AND\s+sf\."EntityID"\s+IN\b/);
        });

        it('adds AND sf."EntityID" IN (...) when entityIDs is supplied', () => {
            const ids = ['44444444-4444-4444-4444-444444444444'];
            const sql = provider.getPendingEntityFieldsSQL('__mj', ids);
            expect(sql).toContain("'44444444-4444-4444-4444-444444444444'");
            expect(sql).toMatch(/AND\s+sf\."EntityID"\s+IN\b/);
        });
    });

    describe('SQLServerCodeGenProvider.callRoutineSQL — @EntityIDs list parameter', () => {
        const provider = new SQLServerCodeGenProvider();

        it('emits a single-parameter EXEC for the unscoped case', () => {
            const sql = provider.callRoutineSQL(
                '__mj',
                'spDeleteUnneededEntityFields',
                [`'sys,staging'`],
                ['ExcludedSchemaNames']
            );
            expect(sql).toBe(`EXEC [__mj].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging'`);
        });

        it('emits an EXEC with @EntityIDs as a comma-delimited list when scoped', () => {
            // The SP fans this list out via STRING_SPLIT into a table variable.
            // We pass ALL entity IDs in a single call rather than looping per-entity,
            // because per-call round-trips and (worse) parallel calls would create
            // lock contention on the same EntityField pages.
            const idList = `55555555-5555-5555-5555-555555555555,66666666-6666-6666-6666-666666666666`;
            const sql = provider.callRoutineSQL(
                '__mj',
                'spDeleteUnneededEntityFields',
                [`'sys,staging'`, `'${idList}'`],
                ['ExcludedSchemaNames', 'EntityIDs']
            );
            expect(sql).toBe(
                `EXEC [__mj].[spDeleteUnneededEntityFields] ` +
                `@ExcludedSchemaNames='sys,staging', @EntityIDs='${idList}'`
            );
        });

        it('produces the same shape for spUpdateExistingEntityFieldsFromSchema', () => {
            const idList = `77777777-7777-7777-7777-777777777777,88888888-8888-8888-8888-888888888888,99999999-9999-9999-9999-999999999999`;
            const sql = provider.callRoutineSQL(
                '__mj',
                'spUpdateExistingEntityFieldsFromSchema',
                [`'sys,staging'`, `'${idList}'`],
                ['ExcludedSchemaNames', 'EntityIDs']
            );
            expect(sql).toContain(`@EntityIDs='${idList}'`);
            expect(sql).toContain(`spUpdateExistingEntityFieldsFromSchema`);
        });
    });
});

describe('EDS — external-entity prune guard (PR #2449)', () => {
    // The PG metadata-management SP `spDeleteUnneededEntityFields` is self-ensured
    // (CREATE OR REPLACE on every manageMetadata run), regenerated from
    // metadataSupportObjects.ts. A careless edit dropping the guard would silently delete
    // external entities' EntityField metadata on every PG run (external entities are
    // VirtualEntity = FALSE with no physical column, so the orphan join matches them all).
    // This locks the guard in. The SQL Server analogue lives in migration 1726, which is
    // immutable once applied; the fragile, regenerated-from-code copy is PostgreSQL's — so
    // that's the one a unit test must pin.
    it('PostgreSQLCodeGenProvider excludes external entities from spDeleteUnneededEntityFields', () => {
        const sql = new PostgreSQLCodeGenProvider().getMetadataSupportObjectsSQL('__mj');
        expect(sql).toBeTruthy();
        expect(sql!).toContain('spDeleteUnneededEntityFields');
        expect(sql!).toMatch(/e\."ExternalDataSourceID"\s+IS NULL/);
    });
});
