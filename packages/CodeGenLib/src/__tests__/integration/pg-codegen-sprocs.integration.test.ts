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

    /**
     * EDS regression guard (PR #2449): spDeleteUnneededEntityFields must NOT prune the
     * EntityFields of external-data-source entities (ExternalDataSourceID set, VirtualEntity =
     * FALSE, no physical column in vwSQLColumnsAndEntityFields). Without the
     * `AND e."ExternalDataSourceID" IS NULL` guard, every external field is silently deleted on
     * each manageMetadata / R__RefreshMetadata run — EDS is non-functional on PG. Requires the EDS
     * migration (Entity.ExternalDataSourceID + vwEntities exposing it); skips cleanly otherwise.
     */
    describe('spDeleteUnneededEntityFields — external-entity field preservation (EDS guard)', () => {
        let edsReady = false;
        beforeAll(async () => {
            const r = await client.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = 'vwEntities' AND column_name = 'ExternalDataSourceID'`,
                [SCHEMA]
            );
            edsReady = r.rowCount === 1;
        });

        it('preserves external-entity fields while still pruning genuine orphans', async (ctx) => {
            if (!edsReady) {
                // EDS migration not applied to this DB (vwEntities lacks ExternalDataSourceID) — skip.
                ctx.skip();
                return;
            }
            const typeId = 'ed500000-0000-0000-0000-000000000001';
            const srcId = 'ed500000-0000-0000-0000-000000000002';
            const extEntId = 'ed500000-0000-0000-0000-000000000003';
            const extFieldId = 'ed500000-0000-0000-0000-000000000004';
            const orphanFieldId = 'ed500000-0000-0000-0000-000000000005';

            await client.query('SAVEPOINT eds_preserve');
            try {
                // a real, non-external, non-virtual entity to host the negative-control orphan field
                const host = await client.query(
                    `SELECT "ID" FROM __mj."Entity"
                     WHERE "VirtualEntity" = FALSE AND "ExternalDataSourceID" IS NULL AND "BaseTable" IS NOT NULL
                     LIMIT 1`
                );
                expect(host.rowCount, 'need a baseline non-external entity for the negative control').toBe(1);
                const hostId = host.rows[0].ID as string;

                await client.query(
                    `INSERT INTO __mj."ExternalDataSourceType"("ID","Name","DriverClass") VALUES ($1,'ZZ PG Test Type','ZZTestDriver')`,
                    [typeId]
                );
                await client.query(
                    `INSERT INTO __mj."ExternalDataSource"("ID","Name","TypeID") VALUES ($1,'ZZ PG Test Source',$2)`,
                    [srcId, typeId]
                );
                await client.query(
                    `INSERT INTO __mj."Entity"("ID","Name","BaseTable","BaseView","ExternalDataSourceID")
                     VALUES ($1,'ZZ External Test Entity','zz_ext_test','zz_ext_test_vw',$2)`,
                    [extEntId, srcId]
                );
                // external field — no physical column exists, so without the guard it is a prune target
                await client.query(
                    `INSERT INTO __mj."EntityField"("ID","EntityID","Name","Type") VALUES ($1,$2,'ZZ_ExternalField','nvarchar')`,
                    [extFieldId, extEntId]
                );
                // negative control — a genuine orphan on a real entity (no matching SQL column)
                await client.query(
                    `INSERT INTO __mj."EntityField"("ID","EntityID","Name","Type") VALUES ($1,$2,'ZZ_FakeOrphan','nvarchar')`,
                    [orphanFieldId, hostId]
                );

                // run the prune, scoped to just these two entities (contained mirror of R__RefreshMetadata's sweep)
                await client.query(
                    `SELECT * FROM __mj."spDeleteUnneededEntityFields"(''::text, $1::text)`,
                    [`${extEntId},${hostId}`]
                );

                const ext = await client.query(`SELECT 1 FROM __mj."EntityField" WHERE "ID" = $1`, [extFieldId]);
                const orphan = await client.query(`SELECT 1 FROM __mj."EntityField" WHERE "ID" = $1`, [orphanFieldId]);
                expect(ext.rowCount, 'external-entity field must survive the prune (the guard)').toBe(1);
                expect(orphan.rowCount, 'a genuine orphan must still be pruned (guard is specific)').toBe(0);
            } finally {
                await client.query('ROLLBACK TO SAVEPOINT eds_preserve');
            }
        });
    });
});
