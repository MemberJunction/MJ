/**
 * Guards the PostgreSQL identifier-quoting hazard that keeps producing the same bug.
 *
 * CodeGen does not require every identifier to be quoted by hand: `runQuery` and
 * `runQueryWithParams` route SQL through `PostgreSQLCodeGenProvider.quoteSQLForExecution`,
 * a tokenizer that auto-quotes any PascalCase word. That safety net is why thousands of
 * unquoted `Name` / `EntityID` / `IsVirtual` references across manage-metadata.ts work
 * fine on PostgreSQL.
 *
 * The net has a hole. The tokenizer deliberately skips a hardcoded keyword list so it does
 * not mangle SQL functions and types — and several MJ COLUMN names collide with entries on
 * that list. `Length` is the load-bearing one: it is a real column on __mj."EntityField"
 * AND the SQL scalar function LENGTH, so it alone escapes quoting, folds to `length`, and
 * fails with `column "length" does not exist`.
 *
 * That is the actual mechanism behind the IS-A PostgreSQL defect, and it recurred in
 * manageSingleVirtualEntityField's UPDATE arm — where, as in the IS-A case, the sibling
 * INSERT arm quoted correctly and only the UPDATE was missed.
 *
 * These tests assert the property rather than the line, so the next occurrence is caught
 * wherever it appears.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROVIDER_SRC = readFileSync(
    join(__dirname, '..', 'Database', 'providers', 'postgresql', 'PostgreSQLCodeGenProvider.ts'),
    'utf8',
);
const METADATA_SRC = readFileSync(join(__dirname, '..', 'Database', 'manage-metadata.ts'), 'utf8');

/**
 * The exposed set: (MJ column names) ∩ (tokenizer keyword skip-list). Referencing any of
 * these unquoted in SQL is a latent PostgreSQL failure.
 *
 * Derived empirically, not guessed — computed by intersecting every distinct quoted column
 * name in the PostgreSQL baseline DDL (1,413 of them) against the 288-entry `_SQL_KEYWORDS`
 * set. Guessing produces both false positives and false negatives: `Count`, `Format`, `Date`,
 * `Left` and `Right` are all in the keyword list but are NOT MJ columns, while `Values` —
 * which holds the encrypted payload on `__mj."Credential"` — is a real column and is exposed.
 *
 * To re-derive: take every quoted column name declared in the PostgreSQL baseline DDL
 * under migrations-pg, upper-case it, and intersect with the `_SQL_KEYWORDS` literal in
 * PostgreSQLCodeGenProvider.ts.
 */
const COLLIDING_COLUMNS = ['Action', 'Columns', 'Language', 'Length', 'Month', 'Rank', 'Text', 'Values'];

/** Strips comments so prose describing the hazard cannot trip the assertions. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('the hazard is real — these column names are in the skip-list', () => {
    it.each(COLLIDING_COLUMNS)('%s appears in the tokenizer keyword list', (column) => {
        // If this ever fails, the collision was removed upstream and the guards below can
        // relax — but that is a decision, not an accident, so it should fail loudly.
        expect(PROVIDER_SRC).toMatch(new RegExp(`'${column.toUpperCase()}'`));
    });

    it('Length is the one that bites __mj.EntityField, which has all of ID/Type/Length', () => {
        expect(PROVIDER_SRC).toMatch(/'LENGTH'/);
        // Sanity: the columns that do NOT collide are absent, which is why they were never
        // implicated — the bug is specific, not "unquoted identifiers break".
        expect(PROVIDER_SRC).not.toMatch(/'ISVIRTUAL'/);
        expect(PROVIDER_SRC).not.toMatch(/'ALLOWSNULL'/);
        expect(PROVIDER_SRC).not.toMatch(/'ENTITYID'/);
    });

    it('Values is exposed, and it holds the encrypted credential payload', () => {
        // __mj."Credential"."Values" is the single field-level-encrypted column in the
        // platform. Any codegen SQL touching it unquoted would fail on PostgreSQL.
        expect(PROVIDER_SRC).toMatch(/'ARRAY'|'VALUES'/);
    });
});

describe('manage-metadata.ts never references a colliding column unquoted in SQL', () => {
    const source = withoutComments(METADATA_SRC);

    it.each(COLLIDING_COLUMNS)('no bare `%s=` assignment in a SET clause', (column) => {
        // `Length=${...}` — the exact shape of the defect in both the IS-A path and the
        // virtual-entity path. A quoted one reads `${q('Length')}=` / `${this.qi('Length')}=`.
        expect(source).not.toMatch(new RegExp(`\\n\\s*${column}\\s*=`));
    });

    it.each(COLLIDING_COLUMNS)('no bare `%s` in a SELECT column list', (column) => {
        expect(source).not.toMatch(new RegExp(`SELECT[^\`;]*[\\s,]${column}\\s*,`));
    });

    it('the virtual-entity UPDATE quotes every identifier, matching its INSERT sibling', () => {
        // Both arms of manageSingleVirtualEntityField write the same columns; they must agree.
        const updateArm = /UPDATE\s*\n\s*\$\{this\.qs\(mj_core_schema\(\), 'EntityField'\)\}[\s\S]*?WHERE[\s\S]*?`;/.exec(source);
        expect(updateArm, 'virtual-entity UPDATE not found — has it been renamed?').not.toBeNull();
        for (const column of ['Sequence', 'Type', 'AllowsNull', 'Length', 'Precision', 'Scale', 'ID']) {
            expect(updateArm![0]).toMatch(new RegExp(`q\\('${column}'\\)|qi\\('${column}'\\)`));
        }
    });
});

describe('the guard cannot pass vacuously', () => {
    it('detects the defect shape in a synthetic regression', () => {
        const regressed = withoutComments(`
            const sql = \`UPDATE t SET
                Length=\${x},
                Precision=\${y}
              WHERE ID = '1'\`;
        `);
        expect(regressed).toMatch(/\n\s*Length\s*=/);
    });
});
