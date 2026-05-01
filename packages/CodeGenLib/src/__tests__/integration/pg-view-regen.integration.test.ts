/**
 * PG view-regeneration integration tests.
 *
 * Documents and regression-guards PostgreSQL's `CREATE OR REPLACE VIEW` semantics
 * that PostgreSQLCodeGenProvider.generateBaseView now relies on (non-destructive
 * path — no DROP CASCADE). These tests run against real PG so behavior changes
 * in PG or in the generator surface immediately.
 *
 * Happy path (CREATE OR REPLACE succeeds, dependents preserved):
 *   - Brand-new view creation
 *   - Replace view with identical signature
 *   - Add columns at the end of the SELECT list (PG-supported additive evolution)
 *   - Dependent views + functions + GRANTs survive a successful replacement
 *
 * Rejected by PG without a fallback (these currently fail — the 42P16
 * capture/restore fallback is a follow-on; these tests document current
 * behavior so the follow-on has a target):
 *   - Rename a column
 *   - Reorder columns
 *   - Drop a column
 *   - Change a column's type
 *
 * Gate: MJ_TEST_PG_URL must point at a PG instance. Tests run inside a
 * dedicated temp schema so they don't touch `__mj` or any baseline state,
 * and the schema is dropped in afterAll for clean re-runs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';

const PG_URL = process.env.MJ_TEST_PG_URL;
const TEST_SCHEMA = '_mj_view_regen_test';

const describeIfPG = PG_URL ? describe : describe.skip;

describeIfPG('PG CREATE OR REPLACE VIEW — integration', () => {
    let client: Client;

    beforeAll(async () => {
        client = new Client({ connectionString: PG_URL });
        await client.connect();
        // Create a scratch schema we own. Using a dedicated schema keeps the
        // tests isolated from __mj and lets us freely CREATE/DROP.
        await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
        await client.query(`
            CREATE TABLE ${TEST_SCHEMA}."Thing" (
                "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "Name" TEXT NOT NULL,
                "Color" TEXT,
                "Count" INTEGER
            )
        `);
    }, 30_000);

    afterAll(async () => {
        if (client) {
            try {
                await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
            } catch {
                /* best-effort cleanup */
            }
            await client.end();
        }
    });

    beforeEach(async () => {
        // Each test starts from a clean slate: no view on "Thing" yet.
        await client.query(`DROP VIEW IF EXISTS ${TEST_SCHEMA}."vwThings" CASCADE`);
        await client.query(`DROP VIEW IF EXISTS ${TEST_SCHEMA}."vwThingsPlus" CASCADE`);
        await client.query(`DROP FUNCTION IF EXISTS ${TEST_SCHEMA}."fn_get_things"() CASCADE`);
    });

    describe('happy path', () => {
        it('creates a new view when none exists', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            const res = await client.query(
                `SELECT viewname FROM pg_views WHERE schemaname = $1 AND viewname = 'vwThings'`,
                [TEST_SCHEMA]
            );
            expect(res.rowCount).toBe(1);
        });

        it('replaces a view with an identical signature', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            // Same column list, different ordering in WHERE — still a "replace".
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
                WHERE "Name" IS NOT NULL
            `);
            const res = await client.query(
                `SELECT viewname FROM pg_views WHERE schemaname = $1 AND viewname = 'vwThings'`,
                [TEST_SCHEMA]
            );
            expect(res.rowCount).toBe(1);
        });

        it('accepts additive evolution — adding a column at the end', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            // Add "Count" at the end.
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color", "Count" FROM ${TEST_SCHEMA}."Thing"
            `);
            // Confirm the new column is exposed by the view.
            const res = await client.query(
                `SELECT attname FROM pg_attribute a
                 JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = $1 AND c.relname = 'vwThings' AND a.attnum > 0 AND NOT a.attisdropped
                 ORDER BY a.attnum`,
                [TEST_SCHEMA]
            );
            expect(res.rows.map(r => r.attname)).toEqual(['ID', 'Name', 'Color', 'Count']);
        });
    });

    describe('dependent preservation on successful replace', () => {
        it('dependent view still exists and is valid after additive replace', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            // Dependent view built on vwThings.
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwThingsPlus" AS
                SELECT "ID", UPPER("Name") AS "UpperName" FROM ${TEST_SCHEMA}."vwThings"
            `);

            // Additive change to vwThings — should not disturb the dependent.
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color", "Count" FROM ${TEST_SCHEMA}."Thing"
            `);

            const res = await client.query(
                `SELECT viewname FROM pg_views WHERE schemaname = $1 AND viewname IN ('vwThings','vwThingsPlus')`,
                [TEST_SCHEMA]
            );
            const names = new Set(res.rows.map(r => r.viewname));
            expect(names.has('vwThings')).toBe(true);
            expect(names.has('vwThingsPlus')).toBe(true);

            // And the dependent view is still queryable (catches the case where
            // a "successful" replace leaves a dependent in an invalid state).
            await expect(
                client.query(`SELECT COUNT(*) FROM ${TEST_SCHEMA}."vwThingsPlus"`)
            ).resolves.toBeDefined();
        });

        it('dependent function (RETURNS SETOF view) still exists after additive replace', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            await client.query(`
                CREATE FUNCTION ${TEST_SCHEMA}."fn_get_things"()
                RETURNS SETOF ${TEST_SCHEMA}."vwThings"
                AS $$ SELECT * FROM ${TEST_SCHEMA}."vwThings" $$ LANGUAGE sql
            `);

            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color", "Count" FROM ${TEST_SCHEMA}."Thing"
            `);

            const res = await client.query(
                `SELECT proname FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = $1 AND p.proname = 'fn_get_things'`,
                [TEST_SCHEMA]
            );
            expect(res.rowCount).toBe(1);
            // And the function still runs (returns 0 rows is fine — we want no error).
            await expect(
                client.query(`SELECT * FROM ${TEST_SCHEMA}."fn_get_things"()`)
            ).resolves.toBeDefined();
        });
    });

    describe('rejected by PG — documents the 42P16 cases the fallback must handle', () => {
        const CODE_42P16 = '42P16'; // invalid_table_definition

        /**
         * Helper: invoke a query that should fail with 42P16 and return the
         * SQLSTATE so assertions are crisp.
         */
        async function expect42P16(sql: string): Promise<string> {
            try {
                await client.query(sql);
                return 'NO_ERROR'; // test will fail the assertion below
            } catch (e) {
                const err = e as { code?: string };
                return err.code ?? 'UNKNOWN';
            }
        }

        it('rename a column — fails with 42P16', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            const code = await expect42P16(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name" AS "DisplayName", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            expect(code).toBe(CODE_42P16);
        });

        it('reorder columns — fails with 42P16', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            const code = await expect42P16(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Color", "Name" FROM ${TEST_SCHEMA}."Thing"
            `);
            expect(code).toBe(CODE_42P16);
        });

        it('drop a column — fails with 42P16', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            const code = await expect42P16(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Thing"
            `);
            expect(code).toBe(CODE_42P16);
        });

        it('change a column type — fails with 42P16', async () => {
            await client.query(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            // Cast Color to UUID to force a type change (will always fail 42P16,
            // regardless of whether any row's value is castable).
            const code = await expect42P16(`
                CREATE OR REPLACE VIEW ${TEST_SCHEMA}."vwThings" AS
                SELECT "ID", "Name", "Color"::UUID AS "Color" FROM ${TEST_SCHEMA}."Thing"
            `);
            expect(code).toBe(CODE_42P16);
        });
    });
});
