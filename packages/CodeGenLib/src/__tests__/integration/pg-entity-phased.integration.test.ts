/**
 * PG phased per-entity execution — integration test.
 *
 * Regression guard for the bug that motivated this whole refactor:
 *   After the non-destructive view regeneration landed, base views survived
 *   but CodeGen's CREATE OR REPLACE VIEW would fail 42P16 in the per-entity
 *   bulk SQL, and pg's simple-query protocol would then skip the CREATE
 *   FUNCTION fn_create_* / fn_update_* / fn_delete_* statements that
 *   followed — so the runtime provider (which now calls fn_*) would resolve
 *   to nothing.
 *
 * The phased executor fixes that by running view → CRUD functions → view
 * permissions in distinct phases, gating phase 2 on phase 1 success, and
 * routing phase 1 through the 42P16 capture/restore fallback.
 *
 * Scenario exercised here:
 *   Given  an entity whose base-view replacement triggers 42P16 (reordered
 *          columns) and whose old view has a dependent view we don't want
 *          to lose
 *   When   `PostgreSQLCodeGenProvider.executeEntityPhased` runs the whole
 *          phased package
 *   Then   - the view is restored with the new shape
 *          - the dependent view still exists (fallback preservation)
 *          - fn_create_<snake_table> exists with RETURNS SETOF the new view
 *          - fn_update_<snake_table> exists
 *          - fn_delete_<snake_table> exists
 *          - all three fn_* names match what the runtime PG data provider's
 *            `fn_<verb>_<toSnakeCase(BaseTable)>` lookup would ask for
 *
 * Gate: skipped when MJ_TEST_PG_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { MJGlobal } from '@memberjunction/global';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { CodeGenDatabaseProvider } from '../../Database/codeGenDatabaseProvider';

const PG_URL = process.env.MJ_TEST_PG_URL;
const SCHEMA = '_mj_phased_entity_test';

const describeIfPG = PG_URL ? describe : describe.skip;

/**
 * Minimal EntityInfo stub — we only need the fields `executeEntityPhased`
 * reads from: `SchemaName`, `BaseView`. The rest are set to defaults that
 * won't be touched by the phased path because we pass pre-built SQL.
 */
function makeEntity(opts: { schema: string; baseTable: string; baseView: string }): EntityInfo {
    // EntityInfo is a complex class; for this test we only touch 2 fields.
    return {
        SchemaName: opts.schema,
        BaseTable: opts.baseTable,
        BaseView: opts.baseView,
    } as unknown as EntityInfo;
}

describeIfPG('PG phased per-entity execution — regression for 42P16-in-main-path', () => {
    let setupClient: Client;
    let provider: PostgreSQLCodeGenProvider;

    const BASE_TABLE = 'Thing';
    const BASE_VIEW = 'vwThings';
    const SNAKE_TABLE = 'thing'; // BaseTable lowercased via toSnakeCase

    beforeAll(async () => {
        setupClient = new Client({ connectionString: PG_URL });
        await setupClient.connect();

        // Point the provider at the same DB via env — its executeEntityPhased
        // creates its own client on every call from env + configInfo.
        const url = new URL(PG_URL!);
        process.env.PG_HOST = url.hostname;
        process.env.PG_PORT = url.port || '5432';
        process.env.PG_DATABASE = url.pathname.replace(/^\//, '');
        process.env.PG_USERNAME = decodeURIComponent(url.username);
        process.env.PG_PASSWORD = decodeURIComponent(url.password);

        // Resolve provider through the MJGlobal class factory — same path
        // sql.ts uses. Fall back to direct construction if registration
        // hasn't been picked up in this test harness.
        provider =
            MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
                CodeGenDatabaseProvider,
                'PostgreSQLCodeGenProvider'
            ) as PostgreSQLCodeGenProvider;
        if (!provider) {
            provider = new PostgreSQLCodeGenProvider();
        }

        await setupClient.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await setupClient.query(`CREATE SCHEMA ${SCHEMA}`);
        await setupClient.query(`
            CREATE TABLE ${SCHEMA}."${BASE_TABLE}" (
                "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "Name" TEXT NOT NULL,
                "Color" TEXT
            )
        `);
    }, 30_000);

    afterAll(async () => {
        if (setupClient) {
            try {
                await setupClient.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
            } catch {
                /* best-effort */
            }
            await setupClient.end();
        }
    });

    beforeEach(async () => {
        // Clean slate inside the scratch schema.
        await setupClient.query(`
            DO $$
            DECLARE r record;
            BEGIN
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

    it('42P16 in phase 1 → fallback recovers view, phase 2 creates fn_*, phase 3 grants', async () => {
        // ── Seed the "before" state ──────────────────────────────────────
        // Initial view with "Name, Color" column order.
        await setupClient.query(`
            CREATE OR REPLACE VIEW ${SCHEMA}."${BASE_VIEW}" AS
            SELECT "ID", "Name", "Color" FROM ${SCHEMA}."${BASE_TABLE}"
        `);
        // Dependent view so the fallback has to preserve something meaningful.
        await setupClient.query(`
            CREATE VIEW ${SCHEMA}."vwThingsShort" AS
            SELECT "ID", "Name" FROM ${SCHEMA}."${BASE_VIEW}"
        `);

        // ── New view: reordered columns → guaranteed 42P16 ───────────────
        const newViewSQL = `
            CREATE OR REPLACE VIEW ${SCHEMA}."${BASE_VIEW}" AS
            SELECT "ID", "Color", "Name" FROM ${SCHEMA}."${BASE_TABLE}"
        `;

        // ── fn_create/fn_update/fn_delete targeting the NEW view ─────────
        // These match what PostgreSQLCodeGenProvider.getCRUDRoutineName would
        // emit (fn_<verb>_<snake_case_table>), which is also what the
        // PostgreSQLDataProvider runtime's getCRUDFunctionName resolves to.
        const crudCreateSQL = `
            CREATE OR REPLACE FUNCTION ${SCHEMA}."fn_create_${SNAKE_TABLE}"(p_name TEXT, p_color TEXT)
            RETURNS SETOF ${SCHEMA}."${BASE_VIEW}" AS $$
                INSERT INTO ${SCHEMA}."${BASE_TABLE}"("Name", "Color") VALUES (p_name, p_color);
                SELECT * FROM ${SCHEMA}."${BASE_VIEW}";
            $$ LANGUAGE sql
        `;
        const crudUpdateSQL = `
            CREATE OR REPLACE FUNCTION ${SCHEMA}."fn_update_${SNAKE_TABLE}"(p_id UUID, p_name TEXT, p_color TEXT)
            RETURNS SETOF ${SCHEMA}."${BASE_VIEW}" AS $$
                UPDATE ${SCHEMA}."${BASE_TABLE}" SET "Name" = p_name, "Color" = p_color WHERE "ID" = p_id;
                SELECT * FROM ${SCHEMA}."${BASE_VIEW}" WHERE "ID" = p_id;
            $$ LANGUAGE sql
        `;
        const crudDeleteSQL = `
            CREATE OR REPLACE FUNCTION ${SCHEMA}."fn_delete_${SNAKE_TABLE}"(p_id UUID)
            RETURNS TABLE(deleted_id UUID) AS $$
                DELETE FROM ${SCHEMA}."${BASE_TABLE}" WHERE "ID" = p_id RETURNING "ID";
            $$ LANGUAGE sql
        `;
        const viewPermSQL = `
            GRANT SELECT ON ${SCHEMA}."${BASE_VIEW}" TO PUBLIC
        `;

        const entity = makeEntity({
            schema: SCHEMA,
            baseTable: BASE_TABLE,
            baseView: BASE_VIEW,
        });

        // ── Run the phased executor ──────────────────────────────────────
        const result = await provider.executeEntityPhased!({
            entity,
            viewSQL: newViewSQL,
            crudCreateSQL,
            crudUpdateSQL,
            crudDeleteSQL,
            viewPermSQL,
        });

        // ── Phase 1 landed: view exists with new column order ────────────
        expect(result.success).toBe(true);
        expect(result.phase).toBeNull();

        const viewCols = await setupClient.query(
            `SELECT attname FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY a.attnum`,
            [SCHEMA, BASE_VIEW]
        );
        expect(viewCols.rows.map(r => r.attname)).toEqual(['ID', 'Color', 'Name']);

        // ── Fallback preserved the dependent view ────────────────────────
        const depExists = await setupClient.query(
            `SELECT 1 FROM pg_views WHERE schemaname = $1 AND viewname = 'vwThingsShort'`,
            [SCHEMA]
        );
        expect(depExists.rowCount).toBe(1);

        // ── Phase 2 landed: fn_create_*, fn_update_*, fn_delete_* all exist ──
        const fnNames = await setupClient.query(
            `SELECT proname FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND proname IN ($2, $3, $4)
             ORDER BY proname`,
            [
                SCHEMA,
                `fn_create_${SNAKE_TABLE}`,
                `fn_update_${SNAKE_TABLE}`,
                `fn_delete_${SNAKE_TABLE}`,
            ]
        );
        expect(fnNames.rows.map(r => r.proname).sort()).toEqual([
            `fn_create_${SNAKE_TABLE}`,
            `fn_delete_${SNAKE_TABLE}`,
            `fn_update_${SNAKE_TABLE}`,
        ]);

        // ── Runtime provider name resolution check ───────────────────────
        // Assert the fn_<verb>_<snake_table> shape matches what
        // PostgreSQLDataProvider.getCRUDFunctionName would ask for at runtime.
        // (Copying the same snake-case transform used on both sides to avoid
        // importing the runtime provider into the CodeGenLib test harness.)
        const toSnakeCase = (name: string) =>
            name
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
                .toLowerCase()
                .replace(/__+/g, '_');
        expect(toSnakeCase(BASE_TABLE)).toBe(SNAKE_TABLE);
        // This is the exact resolver output PostgreSQLDataProvider uses.
        const runtimeResolved = {
            create: `fn_create_${toSnakeCase(BASE_TABLE)}`,
            update: `fn_update_${toSnakeCase(BASE_TABLE)}`,
            delete: `fn_delete_${toSnakeCase(BASE_TABLE)}`,
        };
        const resolvedPresent = await setupClient.query(
            `SELECT proname FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND proname = ANY($2::text[])`,
            [SCHEMA, [runtimeResolved.create, runtimeResolved.update, runtimeResolved.delete]]
        );
        expect(resolvedPresent.rowCount).toBe(3);

        // ── Phase 3 landed: GRANT applied ────────────────────────────────
        const grants = await setupClient.query(
            `SELECT grantee, privilege_type FROM information_schema.role_table_grants
             WHERE table_schema = $1 AND table_name = $2 AND privilege_type = 'SELECT' AND grantee = 'PUBLIC'`,
            [SCHEMA, BASE_VIEW]
        );
        expect(grants.rowCount).toBeGreaterThan(0);
    });

    it('phase 1 failure (non-42P16) halts phase 2 — fn_* NOT created', async () => {
        // Seed a view.
        await setupClient.query(`
            CREATE OR REPLACE VIEW ${SCHEMA}."${BASE_VIEW}" AS
            SELECT "ID", "Name" FROM ${SCHEMA}."${BASE_TABLE}"
        `);

        // Bad SQL for phase 1 — syntax error, NOT 42P16 (so fallback won't help).
        const badViewSQL = `CREATE OR REPLACE VIEW ${SCHEMA}."${BASE_VIEW}" AS SELEKT garbage`;
        const crudCreateSQL = `
            CREATE OR REPLACE FUNCTION ${SCHEMA}."fn_create_${SNAKE_TABLE}"(p_name TEXT)
            RETURNS SETOF ${SCHEMA}."${BASE_VIEW}" AS $$
                INSERT INTO ${SCHEMA}."${BASE_TABLE}"("Name") VALUES (p_name);
                SELECT * FROM ${SCHEMA}."${BASE_VIEW}";
            $$ LANGUAGE sql
        `;

        const result = await provider.executeEntityPhased!({
            entity: makeEntity({ schema: SCHEMA, baseTable: BASE_TABLE, baseView: BASE_VIEW }),
            viewSQL: badViewSQL,
            crudCreateSQL,
            crudUpdateSQL: '',
            crudDeleteSQL: '',
            viewPermSQL: '',
        });

        expect(result.success).toBe(false);
        expect(result.phase).toBe('view');
        expect(result.error).toBeInstanceOf(Error);

        // Critical guarantee: phase 2 must not have run.
        const fnCheck = await setupClient.query(
            `SELECT proname FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND proname = $2`,
            [SCHEMA, `fn_create_${SNAKE_TABLE}`]
        );
        expect(fnCheck.rowCount).toBe(0);
    });
});
