/**
 * Source pins for the two ways a long PostgreSQL CodeGen run used to die for reasons
 * that had nothing to do with the schema it was generating.
 *
 *   1. `pg_get_expr()` OPENS the relation it renders, so a relation dropped by CodeGen's
 *      own concurrent regeneration aborted the whole statement with "could not open
 *      relation with OID <n>". Guarded by `fnSafePGGetExpr`, which MUST stay STRICT —
 *      the entire performance argument (no subtransaction for the overwhelming majority
 *      of columns, which have a NULL `adbin`) rests on STRICT.
 *
 *   2. Fixed-name temp tables torn down with `DROP TABLE IF EXISTS` + re-created with
 *      `CREATE TEMP TABLE ... AS` leave PL/pgSQL's session-lifetime plan cache pointing
 *      at a dead relation OID, so the routine dies intermittently depending on whether
 *      the pool hands back a connection it has already run on.
 *
 * These are embedded-SQL changes, so source pins are the right instrument — but every
 * assertion below runs against a COMMENT-STRIPPED copy of the DDL, so prose describing
 * a guard can never satisfy a pin that the guard itself must satisfy.
 */
import { describe, it, expect } from 'vitest';
import { buildMetadataSupportObjectsSQL } from '../Database/providers/postgresql/metadataSupportObjects';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';

/**
 * Removes SQL comments (`--` to end of line, and `/* ... *\/` blocks) while respecting
 * string literals, quoted identifiers and dollar-quoted bodies — and recursing INTO
 * dollar-quoted bodies, which is where every routine's comments actually live.
 *
 * `--` is matched before `/*`, so a line comment that happens to contain `/*` cannot
 * swallow the code after it.
 */
function stripSqlComments(sql: string): string {
    let out = '';
    let i = 0;
    const n = sql.length;
    while (i < n) {
        const ch = sql[i];

        // dollar-quoted body ($$ ... $$, $func$ ... $func$): keep the delimiters, recurse inside
        if (ch === '$') {
            const tagMatch = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
            if (tagMatch) {
                const tag = tagMatch[0];
                const end = sql.indexOf(tag, i + tag.length);
                if (end === -1) {
                    out += sql.slice(i);
                    break;
                }
                out += tag + stripSqlComments(sql.slice(i + tag.length, end)) + tag;
                i = end + tag.length;
                continue;
            }
        }

        // single-quoted literal ('' is an embedded quote)
        if (ch === "'") {
            let j = i + 1;
            while (j < n) {
                if (sql[j] === "'") {
                    if (sql[j + 1] === "'") {
                        j += 2;
                        continue;
                    }
                    j++;
                    break;
                }
                j++;
            }
            out += sql.slice(i, j);
            i = j;
            continue;
        }

        // double-quoted identifier ("" is an embedded quote)
        if (ch === '"') {
            let j = i + 1;
            while (j < n) {
                if (sql[j] === '"') {
                    if (sql[j + 1] === '"') {
                        j += 2;
                        continue;
                    }
                    j++;
                    break;
                }
                j++;
            }
            out += sql.slice(i, j);
            i = j;
            continue;
        }

        // line comment — checked BEFORE block comments so `-- ... /* ...` stays a line comment
        if (ch === '-' && sql[i + 1] === '-') {
            const nl = sql.indexOf('\n', i);
            if (nl === -1) break;
            i = nl; // keep the newline itself
            continue;
        }

        // block comment
        if (ch === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            if (end === -1) break;
            i = end + 2;
            continue;
        }

        out += ch;
        i++;
    }
    return out;
}

const RAW_DDL = buildMetadataSupportObjectsSQL('__mj');
const DDL = stripSqlComments(RAW_DDL);

/** Slices out one CREATE OR REPLACE FUNCTION body, comment-stripped. */
function routine(name: string): string {
    const start = DDL.indexOf(`CREATE OR REPLACE FUNCTION __mj."${name}"`);
    expect(start, `routine ${name} not found in the DDL`).toBeGreaterThan(-1);
    const end = DDL.indexOf('$func$;', start);
    expect(end, `routine ${name} has no $func$ terminator`).toBeGreaterThan(start);
    return DDL.slice(start, end + '$func$;'.length);
}

/** Slices out the vwSQLColumnsAndEntityFields definition, comment-stripped. */
function columnsView(): string {
    const start = DDL.indexOf('CREATE VIEW __mj."vwSQLColumnsAndEntityFields" AS');
    expect(start).toBeGreaterThan(-1);
    const end = DDL.indexOf('DROP FUNCTION IF EXISTS __mj."spUpdateExistingEntityFieldsFromSchema"', start);
    expect(end).toBeGreaterThan(start);
    return DDL.slice(start, end);
}

describe('stripSqlComments (the instrument itself)', () => {
    it('removes comments inside dollar-quoted routine bodies but keeps the code', () => {
        const sample = `CREATE FUNCTION f() AS $func$
BEGIN
  -- DROP TABLE IF EXISTS decoy;
  TRUNCATE real_table;
END;
$func$;`;
        const stripped = stripSqlComments(sample);
        expect(stripped).not.toContain('DROP TABLE IF EXISTS decoy');
        expect(stripped).toContain('TRUNCATE real_table');
    });

    it('does not treat a comment marker inside a string literal as a comment', () => {
        expect(stripSqlComments(`SELECT '-- not a comment' AS x; -- gone`)).toContain("'-- not a comment'");
        expect(stripSqlComments(`SELECT '-- not a comment' AS x; -- gone`)).not.toContain('gone');
    });

    it('a line comment containing a block-comment opener does not swallow the code after it', () => {
        const stripped = stripSqlComments(`-- see /* the docs\nSELECT 1;`);
        expect(stripped).toContain('SELECT 1;');
    });

    it('actually strips the real DDL (the pinned prose is present raw, absent stripped)', () => {
        // this exact phrase exists ONLY in a comment in the shipped DDL
        expect(RAW_DDL).toContain('STRICT IS LOAD-BEARING');
        expect(DDL).not.toContain('STRICT IS LOAD-BEARING');
        // ...while real DDL survives
        expect(DDL).toContain('CREATE VIEW __mj."vwSQLColumnsAndEntityFields" AS');
    });
});

describe('Fix 1 — pg_get_expr cannot abort the run on a retired OID', () => {
    it('no raw pg_get_expr(ad.adbin, ...) call survives anywhere in the DDL', () => {
        expect(DDL).not.toMatch(/(?<!")pg_get_expr\s*\(\s*ad\.adbin/);
    });

    it('no raw pg_get_expr(ad.adbin, ...) call survives in the columns view specifically', () => {
        expect(columnsView()).not.toContain('pg_get_expr(ad.adbin');
    });

    it('declares fnSafePGGetExpr as STABLE STRICT — STRICT is the whole performance argument', () => {
        // STRICT short-circuits the NULL adbin of every column with no default, so the
        // EXCEPTION block (and its per-call subtransaction) is never entered on the hot path.
        expect(DDL).toMatch(
            /CREATE OR REPLACE FUNCTION __mj\."fnSafePGGetExpr"\(p_expr pg_node_tree, p_relid oid\)\s*RETURNS TEXT\s*LANGUAGE plpgsql STABLE STRICT AS/
        );
    });

    it('the wrapper actually calls pg_get_expr and swallows the error by returning NULL', () => {
        const start = DDL.indexOf('CREATE OR REPLACE FUNCTION __mj."fnSafePGGetExpr"');
        const body = DDL.slice(start, DDL.indexOf('$$;', start));
        expect(body).toContain('RETURN pg_get_expr(p_expr, p_relid);');
        expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s*RETURN NULL;/);
    });

    it('creates the wrapper BEFORE the view that depends on it', () => {
        const fnAt = DDL.indexOf('CREATE OR REPLACE FUNCTION __mj."fnSafePGGetExpr"');
        const viewAt = DDL.indexOf('CREATE VIEW __mj."vwSQLColumnsAndEntityFields" AS');
        expect(fnAt).toBeGreaterThan(-1);
        expect(viewAt).toBeGreaterThan(fnAt);
    });

    it('drops the dependent view before dropping the wrapper, so re-apply is idempotent', () => {
        const viewDrop = DDL.indexOf('DROP VIEW IF EXISTS __mj."vwSQLColumnsAndEntityFields"');
        const fnDrop = DDL.indexOf('DROP FUNCTION IF EXISTS __mj."fnSafePGGetExpr"');
        expect(viewDrop).toBeGreaterThan(-1);
        expect(fnDrop).toBeGreaterThan(viewDrop);
    });

    it('the view still produces BOTH DefaultValue and ComputedColumnDefinition through the wrapper', () => {
        const view = columnsView();
        // the guard must not blank out legitimate defaults: both columns still render an expression
        expect(view).toContain('__mj."fnMapPGDefaultToMJ"(__mj."fnSafePGGetExpr"(ad.adbin, ad.adrelid)) AS "DefaultValue"');
        expect(view).toMatch(
            /THEN __mj\."fnSafePGGetExpr"\(ad\.adbin, ad\.adrelid\) ELSE NULL END AS "ComputedColumnDefinition"/
        );
    });

    it('is schema-parameterized like every other object in this file', () => {
        const custom = stripSqlComments(buildMetadataSupportObjectsSQL('mj_core'));
        expect(custom).toContain('CREATE OR REPLACE FUNCTION mj_core."fnSafePGGetExpr"');
        expect(custom).toContain('mj_core."fnSafePGGetExpr"(ad.adbin, ad.adrelid)');
        expect(custom).not.toContain('__mj."fnSafePGGetExpr"');
    });

    it('is reachable through the provider the CodeGen run actually calls', () => {
        const sql = new PostgreSQLCodeGenProvider().getMetadataSupportObjectsSQL('__mj');
        expect(sql).toBeTruthy();
        expect(stripSqlComments(sql!)).toContain('fnSafePGGetExpr');
    });
});

describe('Fix 2 — fixed-name temp tables cannot pick up a stale cached plan', () => {
    it('NO routine drops and re-creates a fixed-name temp table anywhere in the DDL', () => {
        expect(DDL).not.toContain('DROP TABLE IF EXISTS');
        expect(DDL).not.toMatch(/CREATE TEMP TABLE (?!IF NOT EXISTS)/);
    });

    it.each([
        ['spUpdateExistingEntityFieldsFromSchema'],
        ['spUpdateExistingEntitiesFromSchema'],
        ['spDeleteUnneededEntityFields'],
        ['spUpdateSchemaInfoFromDatabase'],
    ])('%s does no DROP TABLE IF EXISTS + CREATE TEMP TABLE on a fixed name', (name) => {
        const body = routine(name);
        expect(body).not.toContain('DROP TABLE IF EXISTS');
        expect(body).not.toMatch(/CREATE TEMP TABLE (?!IF NOT EXISTS)/);
    });

    describe('spUpdateExistingEntityFieldsFromSchema — create-once + TRUNCATE', () => {
        const body = routine('spUpdateExistingEntityFieldsFromSchema');
        const tempTables = [
            '_uef_excluded',
            '_uef_included',
            '_uef_scope',
            '_uef_cols',
            '_uef_fk',
            '_uef_pk',
            '_uef_uk',
            '_uef_filtered',
        ];

        it.each(tempTables)('%s is created once with IF NOT EXISTS and TRUNCATEd, never dropped', (t) => {
            expect(body).toContain(`CREATE TEMP TABLE IF NOT EXISTS ${t}`);
            expect(body).toContain(`TRUNCATE ${t};`);
            expect(body).not.toContain(`DROP TABLE IF EXISTS ${t}`);
        });

        it('keeps every ANALYZE — the statistics are load-bearing for an already-O(N^2) routine', () => {
            for (const t of ['_uef_cols', '_uef_fk', '_uef_pk', '_uef_uk']) {
                expect(body).toContain(`ANALYZE ${t};`);
            }
        });

        it('ANALYZEs each materialized view snapshot AFTER it is populated, not before', () => {
            for (const t of ['_uef_cols', '_uef_fk', '_uef_pk', '_uef_uk']) {
                const insertAt = body.indexOf(`INSERT INTO ${t} SELECT`);
                const analyzeAt = body.indexOf(`ANALYZE ${t};`);
                expect(insertAt, `${t} is never populated`).toBeGreaterThan(-1);
                expect(analyzeAt, `${t} is ANALYZEd before it is populated`).toBeGreaterThan(insertAt);
            }
        });

        it('still materializes all four catalog views (the reason the temp tables exist at all)', () => {
            expect(body).toContain('INSERT INTO _uef_cols SELECT * FROM __mj."vwSQLColumnsAndEntityFields";');
            expect(body).toContain('INSERT INTO _uef_fk SELECT * FROM __mj."vwForeignKeys";');
            expect(body).toContain('INSERT INTO _uef_pk SELECT * FROM __mj."vwTablePrimaryKeys";');
            expect(body).toContain('INSERT INTO _uef_uk SELECT * FROM __mj."vwTableUniqueKeys";');
        });

        it('releases storage at the end by TRUNCATE, keeping the relations (and OIDs) alive', () => {
            const tail = body.slice(body.lastIndexOf('WHERE fr.is_material_change;'));
            for (const t of tempTables) {
                expect(tail, `${t} storage is not released at the end`).toContain(`TRUNCATE ${t};`);
            }
            expect(tail).not.toContain('DROP TABLE');
        });

        it("_uef_filtered's explicit DDL matches the projection that populates it, positionally", () => {
            // the one temp table whose shape cannot come from a view, so it is hand-declared —
            // a drift between the two lists is a silent-corruption hazard, pin it.
            const ddlStart = body.indexOf('CREATE TEMP TABLE IF NOT EXISTS _uef_filtered (');
            const ddlEnd = body.indexOf('\n  );', ddlStart);
            const declared = body
                .slice(body.indexOf('(', ddlStart) + 1, ddlEnd)
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => l.split(/\s+/)[0]);

            const projStart = body.indexOf('INSERT INTO _uef_filtered');
            const projEnd = body.indexOf('\n  ) chg', projStart);
            const projected = [...body.slice(projStart, projEnd).matchAll(/\bAS\s+([a-z_]+),?\s*$/gm)].map((m) => m[1]);

            expect(declared.length).toBe(24);
            expect(declared).toEqual(projected);
        });

        it('leaves the reconciliation statements that consume the temp tables untouched', () => {
            // the point of create-once + TRUNCATE over dynamic SQL: all of this stays static SQL
            expect(body).toContain('FROM _uef_filtered fr');
            expect(body).toContain('INNER JOIN _uef_cols sq');
            expect(body).toContain('SET LOCAL enable_nestloop = off;');
        });
    });

    describe('spUpdateExistingEntitiesFromSchema — temp tables removed outright', () => {
        const body = routine('spUpdateExistingEntitiesFromSchema');

        it('references no temp table at all', () => {
            expect(body).not.toContain('CREATE TEMP TABLE');
            expect(body).not.toContain('_ues_filtered');
            expect(body).not.toContain('_ues_included');
        });

        it('uses a single data-modifying CTE that both UPDATEs and returns the same snapshot', () => {
            expect(body).toMatch(/RETURN QUERY\s*WITH filtered AS MATERIALIZED \(/);
            expect(body).toMatch(/upd AS \(\s*UPDATE __mj\."Entity" tgt SET/);
            expect(body).toContain('FROM filtered fr');
        });

        it('still writes Description and __mj_UpdatedAt, and still returns the pre-UPDATE description', () => {
            expect(body).toContain('"Description" = fr.new_description');
            expect(body).toContain('"__mj_UpdatedAt" = now()');
            expect(body).toContain('fr.current_description::text');
        });

        it('preserves the included/excluded schema filters inline', () => {
            expect(body).toContain('p_ExcludedSchemaNames');
            expect(body).toContain('p_IncludedSchemaNames');
            expect(body).toContain('NOT v_has_include OR');
        });
    });

    describe('spDeleteUnneededEntityFields — create-once + TRUNCATE, ANALYZE preserved', () => {
        const body = routine('spDeleteUnneededEntityFields');

        it.each(['_del_scope', '_del_included', '_del_ext_entities', '_del_ef', '_del_actual', '_del_deleted'])(
            '%s is created once with IF NOT EXISTS and TRUNCATEd, never dropped',
            (t) => {
                expect(body).toContain(`CREATE TEMP TABLE IF NOT EXISTS ${t}`);
                expect(body).toContain(`TRUNCATE ${t};`);
                expect(body).not.toContain(`DROP TABLE IF EXISTS ${t}`);
            }
        );

        it('keeps both ANALYZE calls, after their tables are populated', () => {
            for (const t of ['_del_ef', '_del_actual']) {
                expect(body).toContain(`ANALYZE ${t};`);
                expect(body.indexOf(`ANALYZE ${t};`)).toBeGreaterThan(body.indexOf(`INSERT INTO ${t} (`));
            }
        });
    });

    describe('spUpdateSchemaInfoFromDatabase — create-once + TRUNCATE', () => {
        const body = routine('spUpdateSchemaInfoFromDatabase');

        it.each(['_usi_excluded', '_usi_included'])('%s is created once and TRUNCATEd, never dropped', (t) => {
            expect(body).toContain(`CREATE TEMP TABLE IF NOT EXISTS ${t}`);
            expect(body).toContain(`TRUNCATE ${t};`);
            expect(body).not.toContain(`DROP TABLE IF EXISTS ${t}`);
        });
    });

    it('every ANALYZE in the file still survives the rewrite (6 total)', () => {
        expect([...DDL.matchAll(/^\s*ANALYZE\s+_\w+;/gm)].length).toBe(6);
    });
});
