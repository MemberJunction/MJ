import { describe, it, expect } from 'vitest';
import {
    AutoQuotePostgreSQLIdentifiers,
    PostgreSQLQuotingKeywords,
    PostgreSQLStructuralKeywords,
} from '../postgresqlAutoQuote.js';

/**
 * Tests for the shared PostgreSQL identifier auto-quoting tokenizer.
 *
 * The defining property under test: a keyword is recognized ONLY in its ALL-CAPS form,
 * so column names that collide with SQL keywords (`Name`, `Values`, `Length`, …) are
 * quoted and survive PG's lowercase folding, while the keyword spelling stays bare.
 *
 * Both providers delegate here — see the delegation tests in
 * `packages/PostgreSQLDataProvider/src/__tests__/autoQuoteIdentifiers.test.ts` and
 * `packages/CodeGenLib/src/__tests__/PostgreSQLCodeGenProvider.test.ts`.
 */
describe('AutoQuotePostgreSQLIdentifiers', () => {
    /**
     * The eleven column names present in the shipped PG baseline that are also members of
     * the keyword set. Every one of these was emitted unquoted before this change.
     * The exhaustive, self-updating version of this list lives in
     * `postgresqlAutoQuote.baseline.test.ts`, which derives it from the baseline DDL.
     */
    const COLLIDING_COLUMNS = [
        'Action', 'Columns', 'Language', 'Length', 'Log',
        'Month', 'Name', 'Precision', 'Rank', 'Text', 'Values',
    ] as const;

    describe('keyword-colliding column names (the defect being fixed)', () => {
        it.each(COLLIDING_COLUMNS)('quotes %s in a SELECT list', (col) => {
            expect(AutoQuotePostgreSQLIdentifiers(`SELECT ${col} FROM t`)).toBe(`SELECT "${col}" FROM t`);
        });

        it.each(COLLIDING_COLUMNS)('quotes %s in a WHERE clause', (col) => {
            expect(AutoQuotePostgreSQLIdentifiers(`SELECT 1 FROM t WHERE ${col} = 'x'`)).toBe(
                `SELECT 1 FROM t WHERE "${col}" = 'x'`
            );
        });

        it.each(COLLIDING_COLUMNS)('quotes %s in an UPDATE SET clause', (col) => {
            expect(AutoQuotePostgreSQLIdentifiers(`UPDATE t SET ${col} = $1`)).toBe(`UPDATE t SET "${col}" = $1`);
        });

        it('quotes several colliding columns in one statement', () => {
            expect(AutoQuotePostgreSQLIdentifiers(`UPDATE t SET Log = 'x', Rank = 2 WHERE Month = 'Jan'`)).toBe(
                `UPDATE t SET "Log" = 'x', "Rank" = 2 WHERE "Month" = 'Jan'`
            );
        });

        it('quotes Values (the field-level-encrypted Credential column) but not the VALUES keyword', () => {
            expect(AutoQuotePostgreSQLIdentifiers(`INSERT INTO t (Name, Values) VALUES ('a', 'b')`)).toBe(
                `INSERT INTO t ("Name", "Values") VALUES ('a', 'b')`
            );
        });

        it('keeps VALUES bare when written with no space before the paren', () => {
            expect(AutoQuotePostgreSQLIdentifiers(`INSERT INTO t (Name) VALUES('a')`)).toBe(
                `INSERT INTO t ("Name") VALUES('a')`
            );
        });
    });

    describe('ALL-CAPS words that are not keywords are still identifiers', () => {
        it('quotes the ID and URL acronym columns', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT ID, URL FROM t')).toBe('SELECT "ID", "URL" FROM t');
        });

        it('quotes an all-caps identifier in a WHERE clause', () => {
            expect(AutoQuotePostgreSQLIdentifiers("SELECT 1 FROM t WHERE ID = '5'")).toBe(
                `SELECT 1 FROM t WHERE "ID" = '5'`
            );
        });

        it('quotes a mixed acronym identifier', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT UserID FROM t')).toBe('SELECT "UserID" FROM t');
        });
    });

    describe('one word, both meanings, one statement', () => {
        it('quotes Length the column while leaving LENGTH the function bare', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT Length, LENGTH(Name) FROM t')).toBe(
                'SELECT "Length", LENGTH("Name") FROM t'
            );
        });

        it('distinguishes the TEXT type from the Text column', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT CAST(Text AS TEXT) FROM t')).toBe(
                'SELECT CAST("Text" AS TEXT) FROM t'
            );
        });
    });

    describe('keywords stay bare in their ALL-CAPS form', () => {
        it('leaves a fully upper-cased statement untouched', () => {
            const sql = 'SELECT * FROM t WHERE x IS NOT NULL ORDER BY 1 DESC LIMIT 10';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves RETURNING bare (was runtime-only before the sets were unioned)', () => {
            expect(AutoQuotePostgreSQLIdentifiers('INSERT INTO t (a) VALUES (1) RETURNING "ID"')).toBe(
                'INSERT INTO t (a) VALUES (1) RETURNING "ID"'
            );
        });

        it('leaves EXCEPT and INTERSECT bare (was runtime-only)', () => {
            const sql = 'SELECT a FROM t EXCEPT SELECT b FROM u INTERSECT SELECT c FROM v';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves SET CONSTRAINTS ALL IMMEDIATE bare (was codegen-only)', () => {
            const sql = 'SET CONSTRAINTS ALL IMMEDIATE';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves SAVEPOINT / RELEASE / DEFERRED bare (was codegen-only)', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SAVEPOINT sp1')).toBe('SAVEPOINT sp1');
            expect(AutoQuotePostgreSQLIdentifiers('RELEASE SAVEPOINT sp1')).toBe('RELEASE SAVEPOINT sp1');
            expect(AutoQuotePostgreSQLIdentifiers('SET CONSTRAINTS ALL DEFERRED')).toBe('SET CONSTRAINTS ALL DEFERRED');
        });
    });

    describe('TYPE and DATA — DDL keyword vs column name', () => {
        it('leaves TYPE bare in ALTER COLUMN ... TYPE', () => {
            const sql = 'ALTER TABLE __mj."Foo" ALTER COLUMN "Bar" TYPE boolean';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves SET DATA TYPE bare', () => {
            const sql = 'ALTER TABLE __mj."Foo" ALTER COLUMN "Bar" SET DATA TYPE integer';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('quotes the Type and Data columns', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT Type, Data FROM t')).toBe('SELECT "Type", "Data" FROM t');
        });

        it('quotes a Type column reached through an alias', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT rc.Type FROM __mj.vwRecordChanges rc')).toBe(
                'SELECT rc."Type" FROM __mj."vwRecordChanges" rc'
            );
        });
    });

    describe('casts', () => {
        it('leaves CAST(x AS TEXT) untouched', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT CAST(x AS TEXT) FROM t')).toBe('SELECT CAST(x AS TEXT) FROM t');
        });

        it('leaves lowercase :: casts untouched', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT x::text, y::jsonb FROM t')).toBe(
                'SELECT x::text, y::jsonb FROM t'
            );
        });

        it('leaves ALL-CAPS :: casts untouched', () => {
            expect(AutoQuotePostgreSQLIdentifiers("SELECT '5'::INTEGER, x::TEXT FROM t")).toBe(
                "SELECT '5'::INTEGER, x::TEXT FROM t"
            );
        });

        it('quotes a mixed-case cast type — the documented tradeoff, since Text is a real column', () => {
            // `Text`/`Date`/`Name` are MJ columns, so the mixed-case spelling must quote. Write casts
            // as `::text` or `::TEXT`. Verified in-repo: no mixed-case casts exist on either PG path.
            expect(AutoQuotePostgreSQLIdentifiers('SELECT x::Text FROM t')).toBe('SELECT x::"Text" FROM t');
        });
    });

    describe('words that are left alone', () => {
        it('leaves an all-lowercase statement untouched', () => {
            const sql = 'select col from tbl where other_col = 1';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves a camelCase alias untouched when not preceded by a dot', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT count(*) AS myAlias FROM t')).toBe(
                'SELECT count(*) AS myAlias FROM t'
            );
        });

        it('QUOTES the mixed-case framework columns, and leaves the lowercase internals bare', () => {
            // This assertion used to run the other way, pinning the `__mj_` carve-out that made
            // the five mixed-case framework columns fold to lowercase and fail — the exact defect
            // this module exists to fix, left standing under a heading about words left alone.
            expect(AutoQuotePostgreSQLIdentifiers('SELECT 1 FROM t WHERE __mj_CreatedAt > now()'))
                .toBe('SELECT 1 FROM t WHERE "__mj_CreatedAt" > now()');
            // Unqualified, which is the shape the Query entity's CacheValidationSQL documents.
            expect(AutoQuotePostgreSQLIdentifiers('SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt FROM t'))
                .toBe('SELECT MAX("__mj_UpdatedAt") AS "MaxUpdatedAt" FROM t');
            // Dot-qualified, which the carve-out also escaped because it ran before the dot rule.
            expect(AutoQuotePostgreSQLIdentifiers('SELECT t.__mj_UpdatedAt FROM __mj.Entity t'))
                .toBe('SELECT t."__mj_UpdatedAt" FROM __mj."Entity" t');
            // All-lowercase internals are untouched by the ordinary lowercase rule, as before.
            const lower = 'SELECT 1 FROM t WHERE __mj_deleted_at IS NULL';
            expect(AutoQuotePostgreSQLIdentifiers(lower)).toBe(lower);
        });

        it('leaves the __mj schema name untouched while quoting the object', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT * FROM __mj.vwAIAgentRuns')).toBe(
                'SELECT * FROM __mj."vwAIAgentRuns"'
            );
        });
    });

    describe('dot-qualified references', () => {
        it('quotes a lowercase-first view name after a dot (MJ vwXxx convention)', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT * FROM __mj.vwAIAgentRuns ar')).toBe(
                'SELECT * FROM __mj."vwAIAgentRuns" ar'
            );
        });

        it('quotes a camelCase column reached through an alias', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT ar.someColumn FROM t ar')).toBe(
                'SELECT ar."someColumn" FROM t ar'
            );
        });
    });

    describe('function calls', () => {
        it('leaves a mixed-case function name bare while quoting its arguments', () => {
            expect(AutoQuotePostgreSQLIdentifiers("SELECT Coalesce(Name, 'x') FROM t")).toBe(
                `SELECT Coalesce("Name", 'x') FROM t`
            );
        });

        it('leaves IsNull bare while quoting the colliding column argument', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT IsNull(Length, 0) FROM t')).toBe(
                'SELECT IsNull("Length", 0) FROM t'
            );
        });

        it('leaves an ALL-CAPS function missing from the keyword set bare', () => {
            expect(AutoQuotePostgreSQLIdentifiers("SELECT JSONB_BUILD_OBJECT('a', Name) FROM t")).toBe(
                `SELECT JSONB_BUILD_OBJECT('a', "Name") FROM t`
            );
        });

        it('quotes a dot-qualified stored procedure — the dot guard beats the paren rule', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT * FROM __mj.spCreateMJWorkspace($1)')).toBe(
                'SELECT * FROM __mj."spCreateMJWorkspace"($1)'
            );
        });

        it('leaves a bare table immediately followed by a paren unquoted — the documented caveat', () => {
            expect(AutoQuotePostgreSQLIdentifiers('INSERT INTO Target(Name) VALUES (1)')).toBe(
                'INSERT INTO Target("Name") VALUES (1)'
            );
        });

        it('quotes the same table when a space separates it from the paren', () => {
            expect(AutoQuotePostgreSQLIdentifiers('INSERT INTO Target (Name) VALUES (1)')).toBe(
                'INSERT INTO "Target" ("Name") VALUES (1)'
            );
        });
    });

    describe('structural keyword compatibility tier', () => {
        // Covers SQL fragments authored outside this repo — stored UserView.OrderBy values and
        // GraphQL ExtraFilter strings — which predate case-sensitive keyword matching.
        it('leaves a mixed-case sort direction bare while quoting the column', () => {
            expect(AutoQuotePostgreSQLIdentifiers('ORDER BY Name Desc')).toBe('ORDER BY "Name" Desc');
        });

        it('leaves mixed-case boolean operators bare', () => {
            expect(AutoQuotePostgreSQLIdentifiers('WHERE Length = 1 And Rank = 2 Or Name Is Null')).toBe(
                'WHERE "Length" = 1 And "Rank" = 2 Or "Name" Is Null'
            );
        });

        it('leaves Nulls Last bare', () => {
            expect(AutoQuotePostgreSQLIdentifiers('ORDER BY Name Desc Nulls Last')).toBe(
                'ORDER BY "Name" Desc Nulls Last'
            );
        });

        it('leaves mixed-case membership and range operators bare', () => {
            expect(AutoQuotePostgreSQLIdentifiers("WHERE Name In ('a') And Rank Between 1 And 2")).toBe(
                `WHERE "Name" In ('a') And "Rank" Between 1 And 2`
            );
        });

        it('contains no word that is also a known colliding column name', () => {
            const identifiers = [...COLLIDING_COLUMNS, 'Type', 'Data', 'ID', 'URL'];
            const overlap = identifiers.filter((c) => PostgreSQLStructuralKeywords.has(c.toUpperCase()));
            expect(overlap).toEqual([]);
        });
    });

    describe('constructs the tokenizer skips', () => {
        it('leaves string literals untouched, including escaped quotes', () => {
            const sql = `SELECT 1 FROM t WHERE x = 'It''s a TestRun with Name inside'`;
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves identifier-looking text inside a literal untouched', () => {
            const sql = `INSERT INTO t (a) VALUES ('vwAIAgentRuns')`;
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(`INSERT INTO t (a) VALUES ('vwAIAgentRuns')`);
        });

        it('leaves dollar-quoted blocks untouched', () => {
            const sql = 'DO $$ BEGIN PERFORM TestRun; END $$';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('leaves tagged dollar-quoted blocks untouched', () => {
            const sql = '$body$ SELECT Name FROM t $body$';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });

        it('preserves positional parameters while quoting surrounding identifiers', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT 1 FROM t WHERE id = $1 AND Name = $2')).toBe(
                'SELECT 1 FROM t WHERE id = $1 AND "Name" = $2'
            );
        });

        it('leaves already-quoted identifiers, brackets and @params untouched', () => {
            const sql = 'SELECT "TestRun", [Length] FROM x WHERE id = @userId';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });
    });

    describe('idempotency', () => {
        const kitchenSink = [
            'SELECT ID, URL, Name, Length, LENGTH(Name), Coalesce(Text, \'x\'), rc.Type',
            'FROM __mj.vwRecordChanges rc',
            'JOIN __mj.spCreateMJWorkspace($1) w ON w."ID" = rc."ID"',
            `WHERE Values = 'v' And Rank Is Not Null`,
            'ORDER BY Name Desc',
        ].join(' ');

        it('produces the same output when applied twice', () => {
            const once = AutoQuotePostgreSQLIdentifiers(kitchenSink);
            expect(AutoQuotePostgreSQLIdentifiers(once)).toBe(once);
        });

        it('is a no-op on already fully-quoted SQL', () => {
            const sql = 'SELECT "Name", "Values" FROM __mj."Credential" WHERE "ID" = $1';
            expect(AutoQuotePostgreSQLIdentifiers(sql)).toBe(sql);
        });
    });

    describe('edge cases', () => {
        it('handles an empty string', () => {
            expect(AutoQuotePostgreSQLIdentifiers('')).toBe('');
        });

        it('handles whitespace-only input', () => {
            expect(AutoQuotePostgreSQLIdentifiers('   \n\t ')).toBe('   \n\t ');
        });

        it('handles SQL with no identifiers at all', () => {
            expect(AutoQuotePostgreSQLIdentifiers('SELECT 1 WHERE 1 = 1')).toBe('SELECT 1 WHERE 1 = 1');
        });

        it('still quotes ORDINALITY, so the dialect workaround that avoids it remains required', () => {
            // ORDINALITY is ALL-CAPS, not in the keyword set, and not followed by `(` — so it quotes.
            // PostgreSQLDialect.ForeignKeyGraphSQL deliberately avoids WITH ORDINALITY for this reason
            // (asserted in crossDialect.test.ts). If ORDINALITY is ever added to the keyword set, that
            // workaround can be revisited — but not before.
            expect(AutoQuotePostgreSQLIdentifiers('SELECT * FROM unnest(a) WITH ORDINALITY')).toBe(
                'SELECT * FROM unnest(a) WITH "ORDINALITY"'
            );
        });
    });

    describe('keyword set contents', () => {
        it('carries the formerly uppercase-only TYPE and DATA entries', () => {
            expect(PostgreSQLQuotingKeywords.has('TYPE')).toBe(true);
            expect(PostgreSQLQuotingKeywords.has('DATA')).toBe(true);
        });

        it('carries entries that were previously in only one of the two copies', () => {
            expect(PostgreSQLQuotingKeywords.has('RETURNING')).toBe(true);
            expect(PostgreSQLQuotingKeywords.has('CONSTRAINTS')).toBe(true);
        });

        it('is the union of both former sets, not a truncation of either', () => {
            expect(PostgreSQLQuotingKeywords.size).toBeGreaterThanOrEqual(300);
        });

        it('stores every keyword in ALL-CAPS, since matching is case-sensitive', () => {
            const nonUpper = [...PostgreSQLQuotingKeywords].filter((k) => k !== k.toUpperCase());
            expect(nonUpper).toEqual([]);
        });
    });
});
