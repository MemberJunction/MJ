/**
 * View dependency capture — integration tests.
 *
 * Tests the read-side helpers in
 * `packages/CodeGenLib/src/Database/providers/postgresql/viewDependencyCapture.ts`
 * against a real PG instance. Each test stands up a known dependency graph in
 * an isolated schema, runs a capture function, and asserts the captured
 * metadata matches reality. These tests are the prerequisite for the 42P16
 * capture-and-restore fallback in PostgreSQLCodeGenProvider — the restore
 * step is only as correct as the capture step it consumes.
 *
 * Scope: purely the read side. No drop/restore exercised here.
 *
 * Isolation: each test uses a fresh temp schema (`_mj_dep_capture_test`) that's
 * dropped and recreated in beforeAll, so state from prior runs can't leak.
 * Individual tests rely on fresh setup in each `it` rather than sharing state.
 *
 * Gate: skipped when `MJ_TEST_PG_URL` is not set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import {
    resolveViewOid,
    captureDependentViews,
    captureDependentFunctions,
    captureGrants,
    captureMetadata,
} from '../../Database/providers/postgresql/viewDependencyCapture';

const PG_URL = process.env.MJ_TEST_PG_URL;
const TEST_SCHEMA = '_mj_dep_capture_test';

const describeIfPG = PG_URL ? describe : describe.skip;

describeIfPG('PG view dependency capture — integration', () => {
    let client: Client;

    const TEST_ROLE = '_mj_dep_capture_test_role';

    beforeAll(async () => {
        client = new Client({ connectionString: PG_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
        await client.query(`
            CREATE TABLE ${TEST_SCHEMA}."Widget" (
                "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "Name" TEXT NOT NULL,
                "Color" TEXT,
                "Count" INTEGER
            )
        `);
        // Create a named role so we can test WITH GRANT OPTION — PG rejects
        // grant-option on PUBLIC, so we need a real role. DROP then CREATE in
        // case a previous failed run left it around.
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
                await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
                // Revoke any lingering grants to the test role before dropping it —
                // PG blocks DROP ROLE if the role still has objects or privileges.
                await client.query(`REASSIGN OWNED BY ${TEST_ROLE} TO CURRENT_USER`);
                await client.query(`DROP OWNED BY ${TEST_ROLE}`);
                await client.query(`DROP ROLE IF EXISTS ${TEST_ROLE}`);
            } catch {
                /* best-effort cleanup */
            }
            await client.end();
        }
    });

    beforeEach(async () => {
        // Each test rebuilds its own view graph from a clean slate. Drop
        // materialized views first (they share the pg_class relkind namespace
        // but have their own metadata catalog), then regular views, then any
        // functions left behind. CASCADE handles cross-object dependencies.
        await client.query(`
            DO $$
            DECLARE r record;
            BEGIN
                FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = '${TEST_SCHEMA}' LOOP
                    EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS ${TEST_SCHEMA}.%I CASCADE', r.matviewname);
                END LOOP;
                FOR r IN SELECT viewname FROM pg_views WHERE schemaname = '${TEST_SCHEMA}' LOOP
                    EXECUTE format('DROP VIEW IF EXISTS ${TEST_SCHEMA}.%I CASCADE', r.viewname);
                END LOOP;
                FOR r IN SELECT proname, oidvectortypes(proargtypes) AS args
                         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = '${TEST_SCHEMA}' LOOP
                    EXECUTE format('DROP FUNCTION IF EXISTS ${TEST_SCHEMA}.%I(%s) CASCADE', r.proname, r.args);
                END LOOP;
            END $$;
        `);
    });

    describe('resolveViewOid', () => {
        it('returns null for a nonexistent view', async () => {
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'NoSuchView');
            expect(oid).toBeNull();
        });

        it('returns an oid for an existing view', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            expect(oid).toBeTypeOf('number');
            expect(oid).toBeGreaterThan(0);
        });

        it('returns an oid for a materialized view', async () => {
            await client.query(`
                CREATE MATERIALIZED VIEW ${TEST_SCHEMA}."mvWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'mvWidgets');
            expect(oid).toBeTypeOf('number');
        });
    });

    describe('captureDependentViews', () => {
        it('returns empty array for a view with no dependents', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const deps = await captureDependentViews(client, oid!);
            expect(deps).toEqual([]);
        });

        it('captures a single direct dependent view', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgetsUpper" AS
                SELECT "ID", UPPER("Name") AS "U" FROM ${TEST_SCHEMA}."vwWidgets"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const deps = await captureDependentViews(client, oid!);
            expect(deps).toHaveLength(1);
            expect(deps[0].schema).toBe(TEST_SCHEMA);
            expect(deps[0].name).toBe('vwWidgetsUpper');
            expect(deps[0].depth).toBe(1);
            expect(deps[0].relkind).toBe('v');
            // pg_get_viewdef lowercases built-in function names
            expect(deps[0].definition.toLowerCase()).toContain('upper');
        });

        it('captures transitive chain A -> B -> C in dependency order (shallowest first)', async () => {
            // Base: vwWidgets. Depends on it: vwB. Depends on vwB: vwC.
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwB" AS
                SELECT "ID" FROM ${TEST_SCHEMA}."vwWidgets"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwC" AS
                SELECT "ID" FROM ${TEST_SCHEMA}."vwB"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const deps = await captureDependentViews(client, oid!);
            // Both dependents present, ordered by depth.
            const byName = new Map(deps.map(d => [d.name, d]));
            expect(byName.has('vwB')).toBe(true);
            expect(byName.has('vwC')).toBe(true);
            expect(byName.get('vwB')!.depth).toBe(1);
            expect(byName.get('vwC')!.depth).toBe(2);
            // Shallowest-first ordering so replay order is safe.
            const depths = deps.map(d => d.depth);
            for (let i = 1; i < depths.length; i++) {
                expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
            }
        });

        it('captures a materialized view dependent with relkind = m', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE MATERIALIZED VIEW ${TEST_SCHEMA}."mvWidgets" AS
                SELECT "ID" FROM ${TEST_SCHEMA}."vwWidgets"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const deps = await captureDependentViews(client, oid!);
            const mv = deps.find(d => d.name === 'mvWidgets');
            expect(mv).toBeDefined();
            expect(mv!.relkind).toBe('m');
        });

        it('dedupes a view reached through multiple paths — keeps deepest', async () => {
            // Diamond: vwWidgets -> vwLeft, vwWidgets -> vwRight, both -> vwDiamond.
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwLeft" AS
                SELECT "ID" FROM ${TEST_SCHEMA}."vwWidgets"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwRight" AS
                SELECT "ID" FROM ${TEST_SCHEMA}."vwWidgets"
            `);
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwDiamond" AS
                SELECT l."ID" FROM ${TEST_SCHEMA}."vwLeft" l
                JOIN ${TEST_SCHEMA}."vwRight" r ON l."ID" = r."ID"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const deps = await captureDependentViews(client, oid!);
            const diamondCount = deps.filter(d => d.name === 'vwDiamond').length;
            expect(diamondCount).toBe(1);
            expect(deps.find(d => d.name === 'vwDiamond')!.depth).toBe(2);
        });
    });

    describe('captureDependentFunctions', () => {
        it('returns empty array for a view with no dependent functions', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const fns = await captureDependentFunctions(client, oid!);
            expect(fns).toEqual([]);
        });

        it('captures a RETURNS SETOF view function with full definition + signature', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE FUNCTION ${TEST_SCHEMA}."fn_get_widgets"(p_name TEXT)
                RETURNS SETOF ${TEST_SCHEMA}."vwWidgets"
                AS $$ SELECT * FROM ${TEST_SCHEMA}."vwWidgets" WHERE "Name" = p_name $$
                LANGUAGE sql
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const fns = await captureDependentFunctions(client, oid!);
            expect(fns).toHaveLength(1);
            expect(fns[0].schema).toBe(TEST_SCHEMA);
            expect(fns[0].name).toBe('fn_get_widgets');
            expect(fns[0].argTypes).toBe('p_name text');
            // Definition should include enough to recreate it.
            expect(fns[0].definition).toContain('CREATE OR REPLACE FUNCTION');
            expect(fns[0].definition).toContain('RETURNS SETOF');
            expect(fns[0].definition).toContain('vwWidgets');
        });

        it('captures multiple dependent functions deterministically', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(`
                CREATE FUNCTION ${TEST_SCHEMA}."fn_a"()
                RETURNS SETOF ${TEST_SCHEMA}."vwWidgets"
                AS $$ SELECT * FROM ${TEST_SCHEMA}."vwWidgets" $$ LANGUAGE sql
            `);
            await client.query(`
                CREATE FUNCTION ${TEST_SCHEMA}."fn_b"()
                RETURNS SETOF ${TEST_SCHEMA}."vwWidgets"
                AS $$ SELECT * FROM ${TEST_SCHEMA}."vwWidgets" $$ LANGUAGE sql
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const fns = await captureDependentFunctions(client, oid!);
            expect(fns).toHaveLength(2);
            // Sorted by (schema, name) for deterministic ordering.
            expect(fns.map(f => f.name)).toEqual(['fn_a', 'fn_b']);
        });
    });

    describe('captureGrants', () => {
        it('returns empty array for a view with no grants beyond the owner', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const grants = await captureGrants(client, TEST_SCHEMA, 'vwWidgets');
            expect(grants).toEqual([]);
        });

        it('captures explicit SELECT grants to other roles', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            // Use PUBLIC as a built-in grantee so we don't need to create roles.
            await client.query(`GRANT SELECT ON ${TEST_SCHEMA}."vwWidgets" TO PUBLIC`);
            const grants = await captureGrants(client, TEST_SCHEMA, 'vwWidgets');
            const selectToPublic = grants.find(
                g => g.grantee === 'PUBLIC' && g.privilege === 'SELECT'
            );
            expect(selectToPublic).toBeDefined();
            expect(selectToPublic!.withGrantOption).toBe(false);
        });

        it('captures WITH GRANT OPTION flag', async () => {
            // PG requires a named role for WITH GRANT OPTION (rejects PUBLIC).
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(
                `GRANT SELECT ON ${TEST_SCHEMA}."vwWidgets" TO ${TEST_ROLE} WITH GRANT OPTION`
            );
            const grants = await captureGrants(client, TEST_SCHEMA, 'vwWidgets');
            const grant = grants.find(
                g => g.grantee === TEST_ROLE && g.privilege === 'SELECT'
            );
            expect(grant).toBeDefined();
            expect(grant!.withGrantOption).toBe(true);
        });
    });

    describe('captureMetadata', () => {
        it('captures owner and null comment for a freshly-created view', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const meta = await captureMetadata(client, oid!);
            expect(meta.owner).toBeTruthy();
            expect(typeof meta.owner).toBe('string');
            expect(meta.comment).toBeNull();
        });

        it('captures the COMMENT ON VIEW text', async () => {
            await client.query(`
                CREATE VIEW ${TEST_SCHEMA}."vwWidgets" AS
                SELECT "ID", "Name" FROM ${TEST_SCHEMA}."Widget"
            `);
            await client.query(
                `COMMENT ON VIEW ${TEST_SCHEMA}."vwWidgets" IS 'a test view'`
            );
            const oid = await resolveViewOid(client, TEST_SCHEMA, 'vwWidgets');
            const meta = await captureMetadata(client, oid!);
            expect(meta.comment).toBe('a test view');
        });

        it('throws for a nonexistent oid', async () => {
            await expect(captureMetadata(client, 999_999_999)).rejects.toThrow(/not found/);
        });
    });
});
