/**
 * THE POSTGRESQL METADATA SUPPORT OBJECTS — the DDL CodeGen ships itself.
 *
 * These routines are CodeGen's own machinery, emitted and applied on every run rather than shipped
 * through migrations, so their SQL is source in this repo and can be asserted like source. The whole
 * DDL was also installed and exercised against live PostgreSQL 16 while this was written; these
 * assertions are the regression net for the three things that were changed.
 *
 * 1. spUpdateExistingEntitiesFromSchema joined the catalog-introspection view DIRECTLY. That view is
 *    a function-based scan over pg_catalog, so the planner has no statistics for it, estimates every
 *    join against it at rows=1, and nested-loops a re-scan of the catalog per Entity row. Two sibling
 *    routines in this same file were already fixed the same way (materialise once, ANALYZE); this one
 *    was the straggler, and its `_ues_filtered` temp table was never ANALYZEd either.
 *
 * 2. spDeleteUnneededEntityFields gained a protected-field list. Its orphan test is "does this
 *    EntityField have a column in vwSQLColumnsAndEntityFields?", and that view resolves columns
 *    VIEW-FIRST — so deliberately excluding a physical column from a base view makes its EntityField
 *    row look orphaned and it gets DELETED. Verified live on PG 16: deleted without the list,
 *    survives with it, case- and whitespace-insensitively.
 *
 * 3. spRecompileAllViews now exists on PostgreSQL. It cannot do what the SQL Server proc does — PG
 *    freezes a view's targetlist at creation, CREATE OR REPLACE VIEW may only append columns, and
 *    pg_get_viewdef returns the already-expanded definition, so there is no in-place refresh and no
 *    original source to replay. What it closes is the SILENCE: a stale view says nothing until
 *    something reads it and fails with `column "X" does not exist`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMetadataSupportObjectsSQL } from '../metadataSupportObjects';

const ddl = buildMetadataSupportObjectsSQL('__mj');

/** The body of one routine/section, so an assertion cannot be satisfied by a different routine. */
function section(header: string): string {
    const start = ddl.indexOf(header);
    expect(start, `section not found: ${header}`).toBeGreaterThan(-1);
    // Sections are delimited by the numbered banner comments.
    const next = ddl.indexOf('\n-- ----------------------------------------------------------------------------\n-- ', start + header.length);
    return next === -1 ? ddl.slice(start) : ddl.slice(start, next);
}

describe('spUpdateExistingEntitiesFromSchema — planner statistics for its own working tables', () => {
    const body = section('-- 4. spUpdateExistingEntitiesFromSchema');

    it('materialises vwSQLTablesAndEntities into an ANALYZEd temp table', () => {
        expect(body).toContain('CREATE TEMP TABLE _ues_tables AS SELECT * FROM __mj."vwSQLTablesAndEntities"');
        expect(body).toContain('ANALYZE _ues_tables;');
    });

    it('no longer joins the introspection view directly', () => {
        expect(body).not.toContain('INNER JOIN __mj."vwSQLTablesAndEntities"');
        expect(body).toContain('INNER JOIN _ues_tables sq');
    });

    it('ANALYZEs _ues_filtered before the UPDATE ... FROM that reads it', () => {
        expect(body).toContain('ANALYZE _ues_filtered;');
        expect(body.indexOf('ANALYZE _ues_filtered;')).toBeLessThan(body.indexOf('UPDATE __mj."Entity" tgt SET'));
    });

    it('drops every temp table it created', () => {
        for (const t of ['_ues_filtered', '_ues_tables', '_ues_included']) {
            expect(body).toContain(`DROP TABLE IF EXISTS ${t};`);
        }
    });
});

describe('spDeleteUnneededEntityFields — the base-view exclusion interlock', () => {
    const body = section('-- 5. spDeleteUnneededEntityFields');

    it('declares p_ProtectedFieldNames as an optional trailing parameter, so existing 1-3 arg calls still bind', () => {
        expect(body).toContain('p_ProtectedFieldNames TEXT DEFAULT NULL');
        expect(body).toContain('DROP FUNCTION IF EXISTS __mj."spDeleteUnneededEntityFields"(TEXT, TEXT, TEXT);');
        expect(body).toContain('DROP FUNCTION IF EXISTS __mj."spDeleteUnneededEntityFields"(TEXT, TEXT, TEXT, TEXT);');
    });

    it('splits the list case-insensitively and trims each entry', () => {
        expect(body).toContain('SELECT LOWER(TRIM(s)) AS field_name');
        expect(body).toContain("unnest(string_to_array(COALESCE(p_ProtectedFieldNames, ''), ','))");
    });

    it('excludes protected names from the candidate set, so they can never reach the DELETE', () => {
        expect(body).toContain('NOT IN (SELECT pr.field_name FROM _del_protected pr)');
        // The filter belongs on the CANDIDATE build (_del_ef), not on the delete — anything that
        // reaches _del_deleted is also returned to the caller as "deleted".
        const candidateBuild = body.slice(body.indexOf('CREATE TEMP TABLE _del_ef AS'), body.indexOf('ANALYZE _del_ef;'));
        expect(candidateBuild).toContain('_del_protected');
    });
});

describe('spRecompileAllViews — PostgreSQL has one now, and it is honest about what it does', () => {
    const body = section('-- 9. spRecompileAllViews');

    it('is created with the same parameter contract as the other R__RefreshMetadata routines', () => {
        expect(body).toContain('CREATE OR REPLACE FUNCTION __mj."spRecompileAllViews"(');
        expect(body).toContain('p_ExcludedSchemaNames TEXT DEFAULT');
        expect(body).toContain('p_IncludedSchemaNames TEXT DEFAULT NULL');
    });

    it('reports drift per view and RAISEs a WARNING, so a migrate log carries it', () => {
        expect(body).toContain('RAISE WARNING');
        expect(body).toContain('is missing base-table column(s)');
        expect(body).toContain('RETURNS TABLE(');
        expect(body).toContain('"MissingColumns" TEXT');
    });

    it('names the repair, because PG cannot perform it here', () => {
        expect(body).toContain('mj codegen');
    });

    it('skips virtual entities and entities with no base view — neither has a view to compare', () => {
        expect(body).toContain('e."VirtualEntity" = FALSE');
        expect(body).toContain('COALESCE(e."BaseView", \'\') <> \'\'');
    });

    it('does NOT pretend to refresh anything: no CREATE OR REPLACE VIEW, no DROP VIEW', () => {
        const afterHeader = body.slice(body.indexOf('$rav$'));
        expect(afterHeader).not.toContain('CREATE OR REPLACE VIEW');
        expect(afterHeader).not.toContain('DROP VIEW');
    });
});

describe('the DDL is a valid TypeScript template literal and a valid schema substitution', () => {
    it('contains no backtick, which would terminate the String.raw template', () => {
        expect(ddl).not.toContain('`');
    });

    it('substitutes the core schema everywhere', () => {
        const custom = buildMetadataSupportObjectsSQL('mj_core');
        expect(custom).not.toContain('__mj."spRecompileAllViews"');
        expect(custom).toContain('mj_core."spRecompileAllViews"');
    });
});

describe('R__RefreshMetadata.pg-only.sql calls the new routine', () => {
    const repeatable = readFileSync(
        join(__dirname, '../../../../../../../migrations-pg/v5/R__RefreshMetadata.pg-only.sql'),
        'utf8'
    );

    it('invokes spRecompileAllViews', () => {
        expect(repeatable).toContain('"spRecompileAllViews"');
    });

    it('no longer claims the routine has no PostgreSQL equivalent', () => {
        expect(repeatable).not.toContain('spRecompileAllViews has no PostgreSQL equivalent');
    });

    it('still invokes the field prune it already had', () => {
        expect(repeatable).toContain('"spDeleteUnneededEntityFields"');
    });
});
