/**
 * 42P16 fallback — integration tests.
 *
 * End-to-end round-trip for `executeWithFallback` from
 * packages/CodeGenLib/src/Database/providers/postgresql/viewFallback.ts.
 * Each scenario builds a known dependency graph, requests a view change that
 * trips PG's 42P16, and asserts the fallback path rebuilds the target while
 * preserving every captured dependent + piece of metadata.
 *
 * Scope covers each reason 42P16 fires plus each capture domain:
 *   - happy path (no 42P16 → plain CREATE OR REPLACE succeeds, no transaction)
 *   - rename / reorder / drop-column / type-change → fallback path
 *   - transitive dependent view chain A → B → C
 *   - materialized-view dependent
 *   - dependent function (RETURNS SETOF target view)
 *   - GRANTs and WITH GRANT OPTION round-trip
 *   - COMMENT preservation
 *   - owner preservation
 *   - willRegenerate skip — dependent in the set is NOT restored
 *   - hard-fail: restore blows up → transaction rolls back, original state
 *     left intact (pre-drop data accessible, no partial destruction)
 *
 * Gate: skipped when MJ_TEST_PG_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import {
    executeWithFallback,
    ViewFallbackRestoreError,
} from '../../Database/providers/postgresql/viewFallback';

const PG_URL = process.env.MJ_TEST_PG_URL;
const SCHEMA = '_mj_view_fallback_test';
const TEST_ROLE = '_mj_view_fallback_test_role';

const describeIfPG = PG_URL ? describe : describe.skip;

describeIfPG('PG 42P16 fallback — integration', () => {
    let client: Client;

    beforeAll(async () => {
        client = new Client({ connectionString: PG_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`
            CREATE TABLE ${SCHEMA}."Widget" (
                "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "Name" TEXT NOT NULL,
                "Color" TEXT,
                "Count" INTEGER
            )
        `);
        // Named role for GRANT OPTION tests.
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
                    EXECUTE 'DROP ROLE ${TEST_ROLE}';
                END IF;
                EXECUTE 'CREATE ROLE ${TEST_ROLE}';
            END $$;
        `);
    }, 30_000);

    afterAll(async () => {
        if (client) {
            try {
                await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
                await client.query(`REASSIGN OWNED BY ${TEST_ROLE} TO CURRENT_USER`);
                await client.query(`DROP OWNED BY ${TEST_ROLE}`);
                await client.query(`DROP ROLE IF EXISTS ${TEST_ROLE}`);
            } catch {
                /* best-effort */
            }
            await client.end();
        }
    });

    beforeEach(async () => {
        await client.query(`
            DO $$
            DECLARE r record;
            BEGIN
                FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = '${SCHEMA}' LOOP
                    EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS ${SCHEMA}.%I CASCADE', r.matviewname);
                END LOOP;
                FOR r IN SELECT viewname FROM pg_views WHERE schemaname = '${SCHEMA}' LOOP
                    EXECUTE format('DROP VIEW IF EXISTS ${SCHEMA}.%I CASCADE', r.viewname);
                END LOOP;
                FOR r IN SELECT proname, oidvectortypes(proargtypes) AS args
                         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = '${SCHEMA}' LOOP
                    EXECUTE format('DROP FUNCTION IF EXISTS ${SCHEMA}.%I(%s) CASCADE', r.proname, r.args);
                END LOOP;
            END $$;
        `);
    });

    // ─── Happy path ──────────────────────────────────────────────────

    describe('happy path (no 42P16)', () => {
        it('runs plain CREATE OR REPLACE without opening a transaction', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            // Additive change — PG accepts this natively.
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Name", "Color", "Count" FROM ${SCHEMA}."Widget"
                `,
            });
            const cols = await client.query(
                `SELECT attname FROM pg_attribute a
                 JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = $1 AND c.relname = 'vwWidgets' AND a.attnum > 0 AND NOT a.attisdropped
                 ORDER BY a.attnum`,
                [SCHEMA]
            );
            expect(cols.rows.map(r => r.attname)).toEqual(['ID', 'Name', 'Color', 'Count']);
        });
    });

    // ─── Rename / reorder / drop / type change via fallback ──────────

    describe('fallback triggers on each 42P16 cause', () => {
        beforeEach(async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
        });

        it('rename a column → fallback rebuilds, column renamed', async () => {
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Name" AS "DisplayName", "Color" FROM ${SCHEMA}."Widget"
                `,
            });
            const cols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(cols).toEqual(['ID', 'DisplayName', 'Color']);
        });

        it('drop a column → fallback rebuilds, column gone', async () => {
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const cols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(cols).toEqual(['ID', 'Name']);
        });

        it('reorder columns → fallback rebuilds, new order applied', async () => {
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const cols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(cols).toEqual(['ID', 'Color', 'Name']);
        });

        it('type change → fallback rebuilds, new type applied', async () => {
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Name", "Color"::VARCHAR(3) AS "Color" FROM ${SCHEMA}."Widget"
                `,
            });
            // Verify the view rebuilt without error and type changed.
            const res = await client.query(
                `SELECT atttypmod FROM pg_attribute a
                 JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = $1 AND c.relname = 'vwWidgets' AND a.attname = 'Color'`,
                [SCHEMA]
            );
            // atttypmod for varchar is (length + 4); 3 -> 7.
            expect(res.rows[0].atttypmod).toBe(7);
        });
    });

    // ─── Dependents preserved through fallback ───────────────────────

    describe('dependents preserved when fallback fires', () => {
        it('direct dependent view survives + still queryable', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgetsUpper" AS
                SELECT "ID", UPPER("Name") AS "U" FROM ${SCHEMA}."vwWidgets"
            `);
            // 42P16 change to vwWidgets (reorder).
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            // Dependent should still exist and be queryable.
            const stillExists = await client.query(
                `SELECT 1 FROM pg_views WHERE schemaname = $1 AND viewname = 'vwWidgetsUpper'`,
                [SCHEMA]
            );
            expect(stillExists.rowCount).toBe(1);
            await expect(
                client.query(`SELECT COUNT(*) FROM ${SCHEMA}."vwWidgetsUpper"`)
            ).resolves.toBeDefined();
        });

        it('transitive chain A → B → C all restored', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwB" AS SELECT "ID" FROM ${SCHEMA}."vwWidgets"
            `);
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwC" AS SELECT "ID" FROM ${SCHEMA}."vwB"
            `);
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const res = await client.query(
                `SELECT viewname FROM pg_views WHERE schemaname = $1 AND viewname IN ('vwB','vwC')`,
                [SCHEMA]
            );
            expect(new Set(res.rows.map(r => r.viewname))).toEqual(new Set(['vwB', 'vwC']));
        });

        it('materialized view dependent restored', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE MATERIALIZED VIEW ${SCHEMA}."mvWidgets" AS
                SELECT "ID" FROM ${SCHEMA}."vwWidgets"
            `);
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const res = await client.query(
                `SELECT matviewname FROM pg_matviews WHERE schemaname = $1 AND matviewname = 'mvWidgets'`,
                [SCHEMA]
            );
            expect(res.rowCount).toBe(1);
        });

        it('dependent function (RETURNS SETOF view) restored and callable', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE FUNCTION ${SCHEMA}."fn_widgets"()
                RETURNS SETOF ${SCHEMA}."vwWidgets"
                AS $$ SELECT * FROM ${SCHEMA}."vwWidgets" $$ LANGUAGE sql
            `);
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const res = await client.query(
                `SELECT proname FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = $1 AND p.proname = 'fn_widgets'`,
                [SCHEMA]
            );
            expect(res.rowCount).toBe(1);
            await expect(
                client.query(`SELECT * FROM ${SCHEMA}."fn_widgets"()`)
            ).resolves.toBeDefined();
        });
    });

    // ─── Metadata preserved ──────────────────────────────────────────

    describe('metadata preserved when fallback fires', () => {
        it('GRANT SELECT to role + WITH GRANT OPTION round-trip', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(
                `GRANT SELECT ON ${SCHEMA}."vwWidgets" TO ${TEST_ROLE} WITH GRANT OPTION`
            );
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const res = await client.query(
                `SELECT privilege_type, is_grantable
                 FROM information_schema.role_table_grants
                 WHERE table_schema = $1 AND table_name = 'vwWidgets' AND grantee = $2`,
                [SCHEMA, TEST_ROLE]
            );
            const selectGrant = res.rows.find(r => r.privilege_type === 'SELECT');
            expect(selectGrant).toBeDefined();
            expect(selectGrant.is_grantable).toBe('YES');
        });

        it('COMMENT preserved across fallback', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(
                `COMMENT ON VIEW ${SCHEMA}."vwWidgets" IS 'important notes about widgets'`
            );
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const res = await client.query(
                `SELECT description FROM pg_description d
                 JOIN pg_class c ON c.oid = d.objoid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = $1 AND c.relname = 'vwWidgets' AND d.objsubid = 0`,
                [SCHEMA]
            );
            expect(res.rows[0]?.description).toBe('important notes about widgets');
        });

        it('owner preserved across fallback', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            // Get the current owner.
            const ownerBefore = (
                await client.query(
                    `SELECT pg_get_userbyid(c.relowner) AS owner
                     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = $1 AND c.relname = 'vwWidgets'`,
                    [SCHEMA]
                )
            ).rows[0].owner;
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
            });
            const ownerAfter = (
                await client.query(
                    `SELECT pg_get_userbyid(c.relowner) AS owner
                     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = $1 AND c.relname = 'vwWidgets'`,
                    [SCHEMA]
                )
            ).rows[0].owner;
            expect(ownerAfter).toBe(ownerBefore);
        });
    });

    // ─── willRegenerate skip ─────────────────────────────────────────

    describe('willRegenerate skip', () => {
        it('dependents listed in willRegenerate are NOT restored', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgetsUpper" AS
                SELECT "ID", UPPER("Name") AS "U" FROM ${SCHEMA}."vwWidgets"
            `);
            await executeWithFallback({
                client,
                schema: SCHEMA,
                viewName: 'vwWidgets',
                createOrReplaceSQL: `
                    CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                    SELECT "ID", "Color", "Name" FROM ${SCHEMA}."Widget"
                `,
                willRegenerate: new Set([`${SCHEMA}.vwWidgetsUpper`]),
            });
            const res = await client.query(
                `SELECT 1 FROM pg_views WHERE schemaname = $1 AND viewname = 'vwWidgetsUpper'`,
                [SCHEMA]
            );
            // Skipped: CodeGen was expected to regenerate it, so fallback left it dropped.
            expect(res.rowCount).toBe(0);
            // But the target itself rebuilt.
            const target = await client.query(
                `SELECT 1 FROM pg_views WHERE schemaname = $1 AND viewname = 'vwWidgets'`,
                [SCHEMA]
            );
            expect(target.rowCount).toBe(1);
        });
    });

    // ─── Hard-fail on restore ───────────────────────────────────────

    describe('hard-fail on restore', () => {
        it('dependent references a column the new view drops → transaction rolls back, original view preserved', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name", "Color" FROM ${SCHEMA}."Widget"
            `);
            // Dependent explicitly references Color.
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwUsesColor" AS
                SELECT "ID", "Color" FROM ${SCHEMA}."vwWidgets"
            `);
            // Ask to drop Color from vwWidgets — fallback captures vwUsesColor's
            // old definition, DROP CASCADEs both, then tries to restore
            // vwUsesColor which references the now-gone Color → restore fails,
            // transaction rolls back.
            await expect(
                executeWithFallback({
                    client,
                    schema: SCHEMA,
                    viewName: 'vwWidgets',
                    createOrReplaceSQL: `
                        CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                        SELECT "ID", "Name" FROM ${SCHEMA}."Widget"
                    `,
                })
            ).rejects.toThrow(ViewFallbackRestoreError);

            // After rollback, both views are back in their pre-fallback state:
            // vwWidgets still has Color, vwUsesColor still exists.
            const widgetsCols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(widgetsCols).toEqual(['ID', 'Name', 'Color']);
            const usesColor = await client.query(
                `SELECT 1 FROM pg_views WHERE schemaname = $1 AND viewname = 'vwUsesColor'`,
                [SCHEMA]
            );
            expect(usesColor.rowCount).toBe(1);
        });
    });

    // ─── Non-42P16 errors propagate ──────────────────────────────────

    describe('non-42P16 errors propagate without fallback', () => {
        it('syntax error does NOT trigger fallback', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${SCHEMA}."Widget"
            `);
            await expect(
                executeWithFallback({
                    client,
                    schema: SCHEMA,
                    viewName: 'vwWidgets',
                    createOrReplaceSQL: `CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS SELEKT garbage`,
                })
            ).rejects.toThrow();
            // Original view preserved.
            const cols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(cols).toEqual(['ID', 'Name']);
        });

        it('undefined column (42703) in new def does NOT trigger fallback', async () => {
            await client.query(`
                CREATE VIEW ${SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${SCHEMA}."Widget"
            `);
            await expect(
                executeWithFallback({
                    client,
                    schema: SCHEMA,
                    viewName: 'vwWidgets',
                    createOrReplaceSQL: `
                        CREATE OR REPLACE VIEW ${SCHEMA}."vwWidgets" AS
                        SELECT "ID", "NonExistentColumn" FROM ${SCHEMA}."Widget"
                    `,
                })
            ).rejects.toThrow();
            const cols = await colsOf(client, SCHEMA, 'vwWidgets');
            expect(cols).toEqual(['ID', 'Name']);
        });
    });
});

// ─── Helpers ────────────────────────────────────────────────────────────

async function colsOf(client: Client, schema: string, viewName: string): Promise<string[]> {
    const res = await client.query(
        `SELECT attname FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [schema, viewName]
    );
    return res.rows.map(r => r.attname as string);
}
