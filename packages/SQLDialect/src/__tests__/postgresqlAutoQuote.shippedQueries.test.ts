import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoQuotePostgreSQLIdentifiers } from '../postgresqlAutoQuote.js';

/**
 * Runs the tokenizer over the PostgreSQL query SQL this repository actually ships and asserts
 * the three things that must be true of it, against real input rather than fixtures.
 *
 * `metadata/queries/SQL/*.pg.sql` are the bodies stored on `MJ: Queries` for PostgreSQL, and
 * they reach `ExecuteSQL` — which auto-quotes every statement. Some are hand-quoted throughout;
 * others deliberately lean on the tokenizer. So "output equals input" is NOT the invariant.
 * These three are:
 *
 *   1. **String literals are never rewritten.** The tokenizer may quote identifiers; it must
 *      never touch what is inside `'…'`.
 *   2. **Template tags are never rewritten.** The names inside `{{ … }}` / `{% … %}` are
 *      Nunjucks parameter names, matched exactly at render time.
 *   3. **It is idempotent.** Already-quoted SQL passes through unchanged on a second call.
 *
 * All three had live counterexamples in this very file set before comment and template handling
 * existed, and every one of them failed SILENTLY:
 *
 *   - The apostrophe in `calculate-ai-agent-run-cost.pg.sql`'s line-10 comment ("T-SQL doesn't
 *     need it") desynced the string-literal scanner for the remainder of the file, rewriting
 *     `WHERE ars."StepType" = 'Prompt'` to `= '"Prompt"'` (no rows) and the
 *     `jsonb_build_object` keys in `get-conversation-complete.pg.sql` to `'"ID"'` (JSON whose
 *     keys are `"\"ID\""`, so every consumer reading `.ID` gets undefined).
 *   - `{{ ConversationID | sqlString }}` became `{{ "ConversationID" | sqlString }}`, so the
 *     parameter never substituted and the query lost its filter.
 *
 * The literal scanner below is written independently of the implementation on purpose. A test
 * oracle that shares the code under test cannot catch the code under test being wrong.
 */
describe('PostgreSQL auto-quoting vs. the shipped .pg.sql query bodies', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(thisDir, '..', '..', '..', '..');
    const queryDir = join(repoRoot, 'metadata', 'queries', 'SQL');

    /** Every `.pg.sql` under metadata/queries/SQL, recursively — some live in sub-folders. */
    function findPgQueryFiles(dir: string): string[] {
        if (!existsSync(dir)) return [];
        const found: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) found.push(...findPgQueryFiles(full));
            else if (entry.name.endsWith('.pg.sql')) found.push(full);
        }
        return found;
    }

    /**
     * Every single-quoted literal body, in document order — independent scanner.
     *
     * Comment- and dollar-quote-aware, because those are exactly the regions where an
     * apostrophe is not a literal delimiter, which is the whole failure this pins.
     */
    function extractStringLiterals(sql: string): string[] {
        const literals: string[] = [];
        let i = 0;
        while (i < sql.length) {
            if (sql[i] === '-' && sql[i + 1] === '-') {
                while (i < sql.length && sql[i] !== '\n') i++;
            } else if (sql[i] === '/' && sql[i + 1] === '*') {
                let depth = 1;
                i += 2;
                while (i < sql.length && depth > 0) {
                    if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
                    else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
                    else i++;
                }
            } else if (sql[i] === '$' && sql[i + 1] === '$') {
                const close = sql.indexOf('$$', i + 2);
                i = close === -1 ? sql.length : close + 2;
            } else if (sql[i] === "'") {
                const start = ++i;
                while (i < sql.length) {
                    if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
                    else if (sql[i] === "'") break;
                    else i++;
                }
                literals.push(sql.substring(start, i));
                i++;
            } else {
                i++;
            }
        }
        return literals;
    }

    /** Every Nunjucks tag, in document order. */
    function extractTemplateTags(sql: string): string[] {
        return sql.match(/\{[{%#][\s\S]*?[}%#]\}/g) ?? [];
    }

    const files = findPgQueryFiles(queryDir);

    it('finds the shipped PostgreSQL query bodies', () => {
        expect(files.length, `no *.pg.sql found under ${queryDir}`).toBeGreaterThan(0);
    });

    describe.each(files.map((f) => [f.slice(queryDir.length + 1), f] as const))('%s', (_name, path) => {
        const source = readFileSync(path, 'utf-8');
        const quoted = AutoQuotePostgreSQLIdentifiers(source);

        it('leaves every string literal byte-identical', () => {
            expect(extractStringLiterals(quoted)).toEqual(extractStringLiterals(source));
        });

        it('leaves every template tag byte-identical', () => {
            expect(extractTemplateTags(quoted)).toEqual(extractTemplateTags(source));
        });

        it('is idempotent', () => {
            expect(AutoQuotePostgreSQLIdentifiers(quoted)).toBe(quoted);
        });
    });

    /**
     * The hand-quoted variants say so in their own header, and for those "no-op" IS the
     * invariant — a human already resolved every identifier, so any rewrite is the tokenizer
     * second-guessing correct SQL. Files without that header deliberately rely on the
     * tokenizer and are covered by the three invariants above instead.
     */
    describe('files documented as already fully quoted', () => {
        const handQuoted = files.filter((f) =>
            /double-quoted to survive PG's case-folding|Bare PascalCase column refs double-quoted/i.test(
                readFileSync(f, 'utf-8'),
            ),
        );

        it('has at least one such file to check', () => {
            expect(handQuoted.length).toBeGreaterThan(0);
        });

        it.each(handQuoted.map((f) => [f.slice(queryDir.length + 1), f] as const))(
            '%s passes through untouched',
            (_name, path) => {
                const source = readFileSync(path, 'utf-8');
                const quoted = AutoQuotePostgreSQLIdentifiers(source);
                const before = source.split('\n');
                const after = quoted.split('\n');
                const firstDiff = before.findIndex((line, i) => line !== after[i]);
                expect(
                    firstDiff,
                    firstDiff < 0
                        ? ''
                        : `line ${firstDiff + 1} was rewritten\n  before: ${before[firstDiff]}\n  after:  ${after[firstDiff]}`,
                ).toBe(-1);
            },
        );
    });
});

/**
 * The quoting-policy tiers, which had no coverage at all until the review that found the
 * dot-qualified regression.
 *
 * Everything in the sibling suites exercises region SKIPPING (comments, literals, template tags).
 * These cover the two tiers that decide whether a word is a keyword or an identifier — the only
 * ones that can make a legitimate column unquotable, and therefore the only ones whose mistakes
 * are silent-ish rather than obviously malformed.
 */
describe('quoting-policy tiers', () => {
    const q = AutoQuotePostgreSQLIdentifiers;

    describe('dot-qualified words are always identifiers', () => {
        // The invariant that makes every keyword tier safe to extend. No SQL dialect has a
        // keyword after a `.`, so nothing added to a keyword set may ever fold `alias.Column`.
        // A widened structural tier evaluated before this check is exactly what broke it.
        it.each(['Case', 'End', 'Limit', 'Offset', 'Union', 'Order', 'Group', 'Left', 'Name', 'Type'])(
            'quotes e.%s',
            (col) => expect(q(`SELECT e.${col} FROM t e`)).toBe(`SELECT e."${col}" FROM t e`),
        );

        it('leaves an ALL-CAPS keyword bare even when dot-qualified', () => {
            // The one tier that outranks the dot rule, and it has to. Several keyword-set
            // entries exist ONLY for their dot-qualified form: `INFORMATION_SCHEMA.COLUMNS` is
            // executed through `qsql()` on every PostgreSQL CodeGen run, and the catalog's real
            // relation name is lower case, so quoting the right-hand half makes it unresolvable.
            expect(q('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS')).toBe(
                'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS',
            );
            expect(q('SELECT e.SELECT FROM t e')).toBe('SELECT e.SELECT FROM t e');
        });

        it('still quotes a dot-qualified word whose keyword spelling differs in case', () => {
            // Tier 1 is case-SENSITIVE, which is what keeps it from swallowing real columns —
            // `Case` is not `CASE`, so it falls through to the dot rule.
            expect(q('SELECT e.Case, e.Columns FROM t e')).toBe('SELECT e."Case", e."Columns" FROM t e');
        });
    });

    describe('contextual keywords', () => {
        it.each([
            ['ORDER BY', 'SELECT * FROM t Order By Name', 'SELECT * FROM t Order By "Name"'],
            ['GROUP BY', 'SELECT * FROM t Group By Name', 'SELECT * FROM t Group By "Name"'],
            ['LEFT JOIN', 'SELECT * FROM a Left Join b ON x', 'SELECT * FROM a Left Join b ON x'],
            ['INNER JOIN', 'SELECT * FROM a Inner Join b ON x', 'SELECT * FROM a Inner Join b ON x'],
            ['FULL OUTER JOIN', 'SELECT * FROM a Full Outer Join b ON x', 'SELECT * FROM a Full Outer Join b ON x'],
        ])('leaves %s bare', (_label, input, expected) => expect(q(input)).toBe(expected));

        it.each([
            ['Order', 'SELECT Order FROM t', 'SELECT "Order" FROM t'],
            ['Group', 'SELECT Group FROM t', 'SELECT "Group" FROM t'],
            ['Left', 'SELECT Left FROM t', 'SELECT "Left" FROM t'],
            ['Right', 'SELECT Right, Other FROM t', 'SELECT "Right", "Other" FROM t'],
        ])('quotes %s when it is NOT followed by its partner', (_l, input, expected) =>
            expect(q(input)).toBe(expected));

        it('quotes a contextual word at end of input', () => {
            expect(q('SELECT Order')).toBe('SELECT "Order"');
        });

        it('does not pair across a comment', () => {
            // `Order /* c */ By` is not the two-word construct; treating it as one would mean the
            // lookahead skips comments, which is a different (and wrong) reading of the SQL.
            expect(q('SELECT * FROM t Order /* c */ By')).toContain('"Order"');
        });

        it('leaves Left(...) bare via the function-call rule, not the contextual one', () => {
            expect(q('SELECT Left(Name, 3) FROM t')).toBe('SELECT Left("Name", 3) FROM t');
        });

        it('does not pair a follower with a dot-qualified or already-quoted key', () => {
            // The reverse lookup has to agree with the forward one. A dot-qualified key never
            // reaches the contextual tier, so pairing backwards against it makes the two passes
            // disagree: pass 1 gives `o."Order" By`, pass 2 gives `o."Order" "By"`.
            for (const input of ['SELECT o.Order By Name FROM t o', 'FROM a.Left Join b', 'SELECT "Order" By Name']) {
                expect(q(q(input)), `not idempotent: ${input}`).toBe(q(input));
            }
        });

        it('does not pair across a line comment', () => {
            // `nextWord` gets this free — it starts on the `-` and returns empty. Backwards there
            // is no such guard, so a comment ending in "reverse order" would leave a real column
            // named `By` on the next line unquoted, which is the exact case-folding failure this
            // module exists to prevent.
            expect(q('-- newest first, reverse order\nBy = 1')).toBe('-- newest first, reverse order\n"By" = 1');
            expect(q('-- LEFT\nJoin = 1')).toBe('-- LEFT\n"Join" = 1');
            // A block comment is not a line comment: the scan may cross it, and `order` inside it
            // is still not a SQL word — but `previousWord` stops at the `/` either way.
            expect(q('/* reverse order */\nBy = 1')).toBe('/* reverse order */\n"By" = 1');
            // …and a genuine pair split across a newline must STILL pair.
            expect(q('SELECT * FROM t Order\nBy Name')).toBe('SELECT * FROM t Order\nBy "Name"');
        });
    });

    describe('structural keywords stay case-insensitive for externally authored fragments', () => {
        it.each([
            ['Name Desc', 'ORDER BY Name Desc', 'ORDER BY "Name" Desc'],
            ['And/Or', 'WHERE A=1 And B=2 Or C=3', 'WHERE "A"=1 And "B"=2 Or "C"=3'],
            ['Is Null', 'WHERE Name Is Null', 'WHERE "Name" Is Null'],
            ['In', "WHERE Status In ('a')", `WHERE "Status" In ('a')`],
        ])('handles %s', (_l, input, expected) => expect(q(input)).toBe(expected));

        it('does NOT cover mixed-case clause keywords — a documented limitation', () => {
            // Pinned so the limitation is visible rather than folklore. Widening the tier to fix
            // this made `alias.Case` unquotable and still did not fix `Cast(x As T)`, so the
            // limitation is the deliberate choice. The failure is a loud syntax error.
            expect(q('Select Name From t')).toBe('"Select" "Name" "From" t');
        });
    });

    describe('literal prefixes and quoted-identifier escapes', () => {
        it('keeps E/N/U& prefixes attached to their literal', () => {
            expect(q("SELECT E'a', N'b', U&'c' FROM t")).toBe("SELECT E'a', N'b', U&'c' FROM t");
        });

        it('honours backslash escapes only in the E form', () => {
            expect(q("SELECT E'a\\'b', Name FROM t")).toBe("SELECT E'a\\'b', \"Name\" FROM t");
        });

        it('treats "" inside a quoted identifier as an escape, not the close', () => {
            expect(q('SELECT "We""ird", Name FROM t')).toBe('SELECT "We""ird", "Name" FROM t');
        });
    });

    describe('unterminated constructs do not swallow the rest of the statement', () => {
        it.each([
            ['{{', 'SELECT Name FROM t WHERE x = {{ p AND y = Other'],
            ['{%', 'SELECT Name FROM t WHERE x = {% p AND y = Other'],
        ])('resumes scanning after an unclosed %s', (_l, input) => {
            // Consuming to end-of-input would leave every later identifier unquoted — total, and
            // invisible. `Other` must still be quoted.
            expect(q(input)).toContain('"Other"');
        });
    });
});
