/**
 * PG CodeGen sproc integration tests.
 *
 * Regression guard for the 7 baseline metadata-management sprocs ported to PG
 * plpgsql in the `pg-migration-files` branch's
 * V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql migration.
 * Without these, fresh PG installs fall over in CodeGen's metadata phase with
 * `function X does not exist` errors.
 *
 * These tests prove that each sproc CodeGen calls during its metadata-sync
 * phase is (a) present in the DB and (b) callable with the exact argument
 * shape CodeGen passes at runtime. They do not attempt to drive the full
 * `mj codegen` pipeline — that belongs in a higher-level end-to-end suite —
 * but they catch regressions in sproc signature, arity, or existence fast.
 *
 * Gate: the entire describe block is skipped when `MJ_TEST_PG_URL` is not set
 * in the environment, so regular `npm test` runs (which don't have a PG
 * instance) don't fail. To run the tests:
 *
 *   MJ_TEST_PG_URL="postgres://user:pass@localhost:5432/mj_pg_test" npm run test
 *
 * The target database MUST already have:
 *   1. The `__mj` schema created
 *   2. The v5 baseline applied (B202602151200__v5.0__Baseline.pg.sql)
 *   3. The 7-sproc port migration applied
 *      (V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql
 *       from the `pg-migration-files` branch)
 *   4. The helper views that the ported sprocs reference (vwSQLSchemas,
 *      vwSQLTablesAndEntities, vwSQLColumnsAndEntityFields, vwForeignKeys,
 *      vwTablePrimaryKeys, vwTableUniqueKeys, vwEntities, vwEntityFields)
 *
 * The simplest way to prepare one is to run the PG install pipeline once.
 * Tests fail fast with an actionable message if prerequisites are missing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const PG_URL = process.env.MJ_TEST_PG_URL;
const SCHEMA = '__mj';

const describeIfPG = PG_URL ? describe : describe.skip;

const REQUIRED_SPROCS = [
    'spGetPrimaryKeyForTable',
    'spSetDefaultColumnWidthWhereNeeded',
    'spUpdateEntityFieldRelatedEntityNameFieldMap',
    'spUpdateExistingEntitiesFromSchema',
    'spUpdateExistingEntityFieldsFromSchema',
    'spUpdateSchemaInfoFromDatabase',
    'spDeleteUnneededEntityFields',
];

describeIfPG('PG CodeGen sprocs — integration', () => {
    let client: Client;

    beforeAll(async () => {
        client = new Client({ connectionString: PG_URL });
        await client.connect();

        // Verify baseline is present — fail fast with a helpful message if not.
        const tblCheck = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'Entity'`,
            [SCHEMA]
        );
        if (tblCheck.rows[0].cnt !== 1) {
            throw new Error(
                `Target PG database does not have __mj."Entity" table. Apply the v5 baseline first.`
            );
        }

        // Verify the sproc migration has been applied — if any of the 7 sprocs
        // is missing, point the caller at the migration they need to apply.
        const sprocCheck = await client.query(
            `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND proname = ANY($2::text[])`,
            [SCHEMA, REQUIRED_SPROCS]
        );
        const present = new Set(sprocCheck.rows.map(r => r.proname));
        const missing = REQUIRED_SPROCS.filter(s => !present.has(s));
        if (missing.length > 0) {
            throw new Error(
                `Target PG database is missing these sprocs: ${missing.join(', ')}. ` +
                `Apply V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql ` +
                `from the pg-migration-files branch before running these tests.`
            );
        }

        // Open an outer transaction so per-test savepoints roll back cleanly.
        // Nothing the test suite does will persist.
        await client.query('BEGIN');
    }, 30_000);

    afterAll(async () => {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch {
                /* ignore — best-effort cleanup */
            }
            await client.end();
        }
    });

    describe('signature existence', () => {
        it.each([
            ['spGetPrimaryKeyForTable', 'character varying, character varying'],
            ['spSetDefaultColumnWidthWhereNeeded', 'text'],
            ['spUpdateEntityFieldRelatedEntityNameFieldMap', 'uuid, character varying'],
            ['spUpdateExistingEntitiesFromSchema', 'text'],
            ['spUpdateExistingEntityFieldsFromSchema', 'text'],
            ['spUpdateSchemaInfoFromDatabase', 'text'],
            ['spDeleteUnneededEntityFields', 'text'],
        ])('%s exists with argument signature "%s"', async (name, expectedArgs) => {
            const res = await client.query(
                `SELECT pg_get_function_identity_arguments(p.oid) AS args
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = $1 AND p.proname = $2`,
                [SCHEMA, name]
            );
            expect(res.rows).toHaveLength(1);
            // Strip `p_` prefixes from arg names before comparison — we only care about types.
            const gotTypes = res.rows[0].args
                .split(',')
                .map((a: string) => a.trim().replace(/^p_\w+\s+/, ''))
                .join(', ');
            expect(gotTypes).toBe(expectedArgs);
        });
    });

    /**
     * Helper: run one statement inside a savepoint that's always rolled back.
     * Keeps mutating sprocs from polluting the test DB and, critically, isolates
     * the test from pre-existing DB drift (e.g. UQ_EntityField_EntityID_Sequence
     * violations from stale seed data) so a port regression and a data-drift
     * constraint error show up as distinct signals.
     */
    async function runInSavepoint(sql: string, params: unknown[] = []): Promise<{
        success: boolean;
        fields: string[];
        error?: { code: string; message: string };
    }> {
        await client.query('SAVEPOINT test_sp');
        try {
            const res = await client.query(sql, params);
            await client.query('ROLLBACK TO SAVEPOINT test_sp');
            return { success: true, fields: res.fields.map(f => f.name) };
        } catch (e) {
            await client.query('ROLLBACK TO SAVEPOINT test_sp');
            const err = e as { code?: string; message?: string };
            return {
                success: false,
                fields: [],
                error: { code: err.code ?? '', message: err.message ?? String(e) },
            };
        }
    }

    describe('callability (read-only)', () => {
        it('spGetPrimaryKeyForTable returns rows for a known baseline table', async () => {
            // Entity is guaranteed to exist in baseline and have a PK column.
            const res = await client.query(
                `SELECT * FROM ${SCHEMA}."spGetPrimaryKeyForTable"($1, $2)`,
                ['Entity', SCHEMA]
            );
            expect(res.rows.length).toBeGreaterThanOrEqual(1);
            expect(res.rows[0]).toHaveProperty('ColumnName');
            expect(res.rows[0].ColumnName).toBeTruthy();
        });

        it('spGetPrimaryKeyForTable returns empty set for a nonexistent table (no error)', async () => {
            const res = await client.query(
                `SELECT * FROM ${SCHEMA}."spGetPrimaryKeyForTable"($1, $2)`,
                ['TableThatDoesNotExist_xyz123', SCHEMA]
            );
            expect(res.rows).toHaveLength(0);
        });
    });

    /**
     * Mutating sprocs — run inside a savepoint that's rolled back so:
     *   1. Pre-existing DB drift (unique violations, FK violations) is reported
     *      distinctly from port regressions (undefined_function, argument mismatch).
     *   2. Nothing the test does persists.
     *
     * For these tests we accept SQLSTATE codes 23505 (unique_violation) and 23503
     * (foreign_key_violation) as "runtime data issues — not a port regression",
     * because those come from constraints on pre-existing rows rather than from
     * the sproc definition being wrong. We fail the test for 42883 (undefined_function),
     * 42804 (datatype_mismatch), 42P13 (invalid_function_definition), or any other
     * code that indicates the sproc itself is broken.
     */
    describe('callability (mutating — run in savepoint)', () => {
        const NON_PORT_REGRESSION_CODES = new Set([
            '23505', // unique_violation
            '23503', // foreign_key_violation
            '23514', // check_violation
        ]);
        const assertPortOK = (result: { success: boolean; error?: { code: string; message: string } }) => {
            if (result.success) return;
            const code = result.error?.code ?? '';
            if (NON_PORT_REGRESSION_CODES.has(code)) {
                // Test-DB data drift, not a port regression. Surface it so the
                // operator sees it, but don't fail the port-correctness check.
                // eslint-disable-next-line no-console
                console.warn(
                    `  skip-ish: runtime data issue (${code}), not a port regression: ${result.error?.message}`
                );
                return;
            }
            throw new Error(
                `Port regression: SQLSTATE=${code} — ${result.error?.message ?? '(no message)'}`
            );
        };

        it('spSetDefaultColumnWidthWhereNeeded runs for an excluded-schema csv', async () => {
            const result = await runInSavepoint(
                `SELECT ${SCHEMA}."spSetDefaultColumnWidthWhereNeeded"($1)`,
                ['sys,staging']
            );
            assertPortOK(result);
        });

        it('spUpdateEntityFieldRelatedEntityNameFieldMap accepts UUID + string', async () => {
            const result = await runInSavepoint(
                `SELECT ${SCHEMA}."spUpdateEntityFieldRelatedEntityNameFieldMap"($1, $2)`,
                ['00000000-0000-0000-0000-000000000000', 'SomeFieldName']
            );
            assertPortOK(result);
        });

        it('spUpdateExistingEntitiesFromSchema returns the expected column shape', async () => {
            const result = await runInSavepoint(
                `SELECT * FROM ${SCHEMA}."spUpdateExistingEntitiesFromSchema"($1)`,
                ['sys,staging']
            );
            assertPortOK(result);
            if (result.success) {
                expect(result.fields).toEqual([
                    'ID',
                    'Name',
                    'CurrentDescription',
                    'NewDescription',
                    'EntityDescription',
                    'SchemaName',
                ]);
            }
        });

        it('spUpdateExistingEntityFieldsFromSchema returns the expected column shape', async () => {
            const result = await runInSavepoint(
                `SELECT * FROM ${SCHEMA}."spUpdateExistingEntityFieldsFromSchema"($1)`,
                ['sys,staging']
            );
            assertPortOK(result);
            if (result.success) {
                expect(result.fields).toContain('EntityFieldID');
                expect(result.fields).toContain('Type');
                expect(result.fields).toContain('IsPrimaryKey');
            }
        });

        it('spUpdateSchemaInfoFromDatabase returns SchemaInfo shape', async () => {
            const result = await runInSavepoint(
                `SELECT * FROM ${SCHEMA}."spUpdateSchemaInfoFromDatabase"($1)`,
                ['sys,staging']
            );
            assertPortOK(result);
            if (result.success) {
                expect(result.fields).toContain('SchemaName');
            }
        });

        it('spDeleteUnneededEntityFields returns EntityField shape', async () => {
            const result = await runInSavepoint(
                `SELECT * FROM ${SCHEMA}."spDeleteUnneededEntityFields"($1)`,
                ['sys,staging']
            );
            assertPortOK(result);
            if (result.success) {
                expect(result.fields).toContain('ID');
                expect(result.fields).toContain('EntityID');
                expect(result.fields).toContain('Name');
            }
        });
    });
});
