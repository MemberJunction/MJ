import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoQuotePostgreSQLIdentifiers, PostgreSQLStructuralKeywords } from '../postgresqlAutoQuote.js';

/**
 * Derives the keyword/column collision set from the shipped PostgreSQL baseline DDL at test
 * time, instead of enumerating it by hand.
 *
 * The original defect was structural: the keyword set and the set of MJ column names overlap,
 * and every name in the intersection shipped broken. A hand-written list of the eleven known
 * colliders would go stale the moment a new column joins the intersection — which is exactly
 * how the defect got here. This test recomputes the intersection from the real schema on every
 * run, so a newly added colliding column fails CI rather than shipping.
 *
 * Note on caching: turbo's `test` task inputs are `src/**`, so editing a baseline SQL file does
 * not by itself invalidate this test's cache. Baseline changes are release events that run full
 * CI anyway; a targeted `pnpm test` in this package always re-reads the file.
 */
describe('PostgreSQL auto-quoting vs. the shipped baseline schema', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(thisDir, '..', '..', '..', '..');
    const migrationsRoot = join(repoRoot, 'migrations-pg');

    /** Newest `B*__Baseline.pg.sql` across all `migrations-pg/v*` folders. */
    function findNewestBaseline(): string {
        expect(existsSync(migrationsRoot), `migrations-pg not found at ${migrationsRoot}`).toBe(true);
        const candidates: string[] = [];
        for (const folder of readdirSync(migrationsRoot, { withFileTypes: true })) {
            if (!folder.isDirectory()) continue;
            const folderPath = join(migrationsRoot, folder.name);
            for (const file of readdirSync(folderPath)) {
                if (/__Baseline\.pg\.sql$/.test(file)) candidates.push(join(folderPath, file));
            }
        }
        expect(candidates.length, `no *__Baseline.pg.sql found under ${migrationsRoot}`).toBeGreaterThan(0);
        return candidates.sort()[candidates.length - 1];
    }

    interface ColumnDefinition {
        Table: string;
        Column: string;
    }

    /**
     * Extracts column definitions from `CREATE TABLE __mj."X" (...)` blocks.
     *
     * Block-scoped on purpose: a file-wide scan for indented quoted identifiers also matches
     * view column aliases and function-body fragments (~1,500 of them), which are not columns.
     */
    function extractColumnDefinitions(sql: string): ColumnDefinition[] {
        const columns: ColumnDefinition[] = [];
        let currentTable: string | null = null;

        for (const line of sql.split('\n')) {
            if (currentTable === null) {
                const open = /^CREATE TABLE __mj\."([^"]+)" \(/.exec(line);
                if (open) currentTable = open[1];
                continue;
            }
            if (/^\);/.test(line)) {
                currentTable = null;
                continue;
            }
            if (/^\s+CONSTRAINT\b/.test(line)) continue;
            const column = /^\s+"([^"]+)"\s/.exec(line);
            if (column) columns.push({ Table: currentTable, Column: column[1] });
        }
        return columns;
    }

    const baselinePath = findNewestBaseline();
    const definitions = extractColumnDefinitions(readFileSync(baselinePath, 'utf8'));
    const distinctTables = new Set(definitions.map((d) => d.Table));

    const distinctColumns = [...new Set(definitions.map((d) => d.Column))].sort();

    /**
     * Columns this module is responsible for: uppercase-first names, which is every MJ column
     * except the handful of camelCase ones below and the `__mj_` internals the tokenizer skips
     * by design. This is the population where a keyword collision can occur.
     */
    const pascalCaseColumns = distinctColumns.filter((c) => /^[A-Z]/.test(c));

    /**
     * Known camelCase columns, which the tokenizer leaves bare unless they are dot-qualified.
     *
     * This is a separate, pre-existing gap — not a keyword collision. A bare `SELECT spCreate`
     * folds to `spcreate` on PG, while the normal `e.spCreate` form quotes correctly via the
     * dot rule. Quoting camelCase unconditionally is not a safe fix here: it would also quote
     * camelCase result aliases (`SELECT count(*) AS myCount`), changing the casing of result
     * keys that existing consumers read. Recorded rather than fixed, and asserted exactly so
     * that a NEW camelCase column trips this test instead of joining the gap silently.
     */
    const KNOWN_CAMEL_CASE_COLUMNS = [
        'spCreate', 'spCreateGenerated', 'spDelete', 'spDeleteGenerated',
        'spMatch', 'spUpdate', 'spUpdateGenerated',
    ];

    describe('baseline extraction', () => {
        it('found a baseline file', () => {
            expect(baselinePath).toMatch(/__Baseline\.pg\.sql$/);
        });

        it('parsed a plausible number of tables', () => {
            expect(distinctTables.size).toBeGreaterThanOrEqual(300);
        });

        it('parsed a plausible number of column definitions', () => {
            expect(definitions.length).toBeGreaterThanOrEqual(4000);
        });

        it('found the known keyword-colliding columns, proving the extractor sees real columns', () => {
            const found = new Set(definitions.map((d) => d.Column));
            for (const col of ['Name', 'Type', 'Values', 'Log', 'Precision', 'Length', 'Rank']) {
                expect(found.has(col), `expected a "${col}" column in ${baselinePath}`).toBe(true);
            }
        });
    });

    describe('every real column survives auto-quoting', () => {
        it('quotes each PascalCase column name in a SELECT', () => {
            const unquoted = pascalCaseColumns.filter(
                (col) => !AutoQuotePostgreSQLIdentifiers(`SELECT ${col} FROM t`).includes(`"${col}"`)
            );
            const detail = unquoted
                .map((col) => {
                    const tables = definitions.filter((d) => d.Column === col).map((d) => d.Table);
                    return `  - ${col} (on ${tables.slice(0, 3).join(', ')}${tables.length > 3 ? ', …' : ''})`;
                })
                .join('\n');

            expect(
                unquoted,
                unquoted.length === 0
                    ? ''
                    : `These baseline columns are NOT quoted by the shared PostgreSQL tokenizer:\n${detail}\n\n` +
                          `Unquoted identifiers fold to lowercase on PostgreSQL, so any SQL referencing such a ` +
                          `column without quotes fails with 'column "..." does not exist'. This happens when a ` +
                          `column name is spelled exactly like an ALL-CAPS entry in PostgreSQLQuotingKeywords ` +
                          `(e.g. a column literally named TYPE), or is all-lowercase-ambiguous.\n\n` +
                          `Fix by renaming the column, or by changing the rule in postgresqlAutoQuote.ts. Do NOT ` +
                          `"fix" this by adding the word to PostgreSQLQuotingKeywords — that is what caused the ` +
                          `original defect (MJ #3604, #3590, #3691).`
            ).toEqual([]);
        });

        it('quotes every column, PascalCase or camelCase, when it is dot-qualified', () => {
            const unquoted = distinctColumns
                .filter((c) => !c.startsWith('__mj_'))
                .filter((col) => !AutoQuotePostgreSQLIdentifiers(`SELECT e.${col} FROM t e`).includes(`"${col}"`));
            expect(unquoted).toEqual([]);
        });

        it('leaves exactly the known camelCase columns bare when they are not dot-qualified', () => {
            const bare = distinctColumns
                .filter((c) => !c.startsWith('__mj_'))
                .filter((col) => !AutoQuotePostgreSQLIdentifiers(`SELECT ${col} FROM t`).includes(`"${col}"`));

            expect(
                bare,
                `The set of columns left bare by the tokenizer changed. Expected only the known ` +
                    `camelCase columns (${KNOWN_CAMEL_CASE_COLUMNS.join(', ')}), which are safe in practice ` +
                    `because MJ SQL references columns as \`alias.Column\`. A NEW name here means either a new ` +
                    `camelCase column was added — reference it dot-qualified, or rename it PascalCase — or the ` +
                    `quoting rule regressed.`
            ).toEqual(KNOWN_CAMEL_CASE_COLUMNS);
        });
    });

    describe('structural compatibility tier stays disjoint from real columns', () => {
        it('matches no baseline column, in any casing', () => {
            const colliding = [...new Set(definitions.map((d) => d.Column))].filter((col) =>
                PostgreSQLStructuralKeywords.has(col.toUpperCase())
            );

            expect(
                colliding,
                colliding.length === 0
                    ? ''
                    : `These baseline columns collide with PostgreSQLStructuralKeywords: ${colliding.join(', ')}.\n\n` +
                          `That tier is matched case-INsensitively, so such a column would be emitted unquoted and ` +
                          `fold to lowercase on PostgreSQL — recreating the exact defect this module fixes. Either ` +
                          `rename the column, or remove the word from PostgreSQLStructuralKeywords and accept that ` +
                          `externally authored SQL fragments using its mixed-case form will need updating.`
            ).toEqual([]);
        });
    });
});
