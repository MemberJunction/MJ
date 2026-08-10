import { describe, it, expect, vi } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg so we can instantiate the provider without a real DB
vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

/**
 * Tests for autoQuoteIdentifiers — the SQL tokenizer that wraps mixed-case
 * identifiers in double quotes before sending to PG, so hand-written SQL using
 * unquoted PascalCase identifiers (`FROM __mj.vwAIAgentRuns`, `WHERE TestRun
 * IS NULL`) works against PG's case-folding identifier rules.
 *
 * The tokenizer itself is shared with PostgreSQLCodeGenProvider and lives in
 * `@memberjunction/sql-dialect` (`AutoQuotePostgreSQLIdentifiers`), which is where
 * the exhaustive rule matrix and the baseline-derived collision guard live. These
 * tests drive the runtime entry point, so they cover both the delegation and the
 * runtime-specific SQL shapes MJ actually emits.
 */
describe('PostgreSQLDataProvider.autoQuoteIdentifiers', () => {
    const provider = new PostgreSQLDataProvider();
    const quote = (sql: string) => provider.autoQuoteIdentifiers(sql);

    describe('basic identifier quoting', () => {
        it('quotes a PascalCase column reference', () => {
            expect(quote('SELECT TestRun FROM x')).toBe('SELECT "TestRun" FROM x');
        });

        it('quotes a PascalCase column reference with table alias', () => {
            // Note: table alias `ar` is lowercase, doesn't get quoted
            expect(quote('SELECT ar.TestRun FROM x ar')).toBe('SELECT ar."TestRun" FROM x ar');
        });

        it('quotes a PascalCase view name in a FROM clause', () => {
            expect(quote('SELECT * FROM __mj.vwAIAgentRuns'))
                .toBe('SELECT * FROM __mj."vwAIAgentRuns"');
        });

        it('quotes both schema and view name when both are PascalCase', () => {
            // __mj is lowercase → not quoted; if the schema were "Schema" it would be
            expect(quote('FROM Foo.Bar')).toBe('FROM "Foo"."Bar"');
        });

        it('does not quote all-lowercase identifiers', () => {
            expect(quote('SELECT col FROM tbl')).toBe('SELECT col FROM tbl');
        });

        it('does not quote bare camelCase aliases (lowercase-first, no dot prefix)', () => {
            // `myAlias` is a column alias — no dot in front, starts with lowercase.
            // We leave it bare so PG case-folds it to `myalias`, preserving
            // existing client-code expectations about how aliases come back.
            expect(quote('SELECT count(*) AS myAlias FROM x'))
                .toBe('SELECT count(*) AS myAlias FROM x');
        });

        it('quotes lowercase-first identifier when preceded by a dot (vw* views)', () => {
            // The `.` prefix tells us this is an object reference, not an alias.
            // MJ's view convention `vwXxx` lives here.
            expect(quote('SELECT * FROM __mj.vwAIAgentRuns'))
                .toBe('SELECT * FROM __mj."vwAIAgentRuns"');
            expect(quote('SELECT ar.someColumn FROM x ar'))
                .toBe('SELECT ar."someColumn" FROM x ar');
        });

        it('does not quote SQL keywords', () => {
            expect(quote('SELECT FROM WHERE AND OR')).toBe('SELECT FROM WHERE AND OR');
        });

        it('does not quote the __mj_ prefixed timestamp columns', () => {
            expect(quote('WHERE __mj_CreatedAt > now()'))
                .toBe('WHERE __mj_CreatedAt > now()');
        });
    });

    describe('idempotency', () => {
        it('leaves already-double-quoted identifiers untouched', () => {
            expect(quote('SELECT "TestRun" FROM "vwAIAgentRuns"'))
                .toBe('SELECT "TestRun" FROM "vwAIAgentRuns"');
        });

        it('mixed quoted + unquoted: only the unquoted ones get quoted', () => {
            expect(quote('SELECT "TestRun", ScheduledJobRun FROM x'))
                .toBe('SELECT "TestRun", "ScheduledJobRun" FROM x');
        });

        it('repeated application is a no-op (idempotent)', () => {
            const once = quote('FROM __mj.vwAIAgentRuns ar WHERE ar.TestRun = \'x\'');
            const twice = quote(once);
            expect(twice).toBe(once);
        });
    });

    describe('string literal preservation', () => {
        it('does not touch identifiers inside single-quoted strings', () => {
            expect(quote("WHERE x = 'TestRun'")).toBe("WHERE x = 'TestRun'");
        });

        it('handles escaped single quotes in strings', () => {
            expect(quote("WHERE x = 'It''s a TestRun'"))
                .toBe("WHERE x = 'It''s a TestRun'");
        });

        it('preserves literal column-like text inside strings', () => {
            // INTO and VALUES are in the keyword list, vwAIAgentRuns is inside
            // a string literal so it's passed through verbatim.
            expect(quote("INSERT INTO x VALUES ('vwAIAgentRuns')"))
                .toBe("INSERT INTO x VALUES ('vwAIAgentRuns')");
        });
    });

    describe('PG positional params (the critical compatibility case)', () => {
        it('preserves $1 positional param', () => {
            expect(quote('WHERE id = $1')).toBe('WHERE id = $1');
        });

        it('preserves multiple positional params', () => {
            expect(quote('WHERE x = $1 AND y = $2 AND z = $3'))
                .toBe('WHERE x = $1 AND y = $2 AND z = $3');
        });

        it('preserves positional params alongside PascalCase identifiers', () => {
            expect(quote('SELECT TestRun FROM x WHERE id = $1'))
                .toBe('SELECT "TestRun" FROM x WHERE id = $1');
        });
    });

    describe('dollar-quoted blocks', () => {
        it('preserves $$ block contents verbatim', () => {
            const sql = 'DO $$ BEGIN SELECT TestRun FROM x; END $$';
            // TestRun inside $$...$$ should NOT be auto-quoted
            expect(quote(sql)).toBe(sql);
        });

        it('preserves $tag$ block contents verbatim', () => {
            const sql = 'CREATE FUNCTION f() RETURNS void AS $func$ SELECT TestRun FROM x; $func$ LANGUAGE plpgsql';
            expect(quote(sql)).toBe(sql);
        });
    });

    describe('regression cases from MJ runtime', () => {
        it('Memory Manager agent: unquoted vwAIAgentRuns FROM clause (Finding 4)', () => {
            const input = 'SELECT DISTINCT ar.ID FROM __mj.vwAIAgentRuns ar INNER JOIN __mj.vwConversations c ON ar.ConversationID = c.ID';
            const output = quote(input);
            expect(output).toContain('__mj."vwAIAgentRuns"');
            expect(output).toContain('__mj."vwConversations"');
            expect(output).toContain('ar."ConversationID"');
        });

        it('ConversationEngine filter: TestRun reference (Finding 3)', () => {
            const input = "EnvironmentID='abc' AND UserID='def' AND TestRun IS NULL";
            const output = quote(input);
            expect(output).toBe('"EnvironmentID"=\'abc\' AND "UserID"=\'def\' AND "TestRun" IS NULL');
        });

        it('typical RunView filter expression', () => {
            const input = "Status='Active' AND CreatedByUserID='abc'";
            const output = quote(input);
            expect(output).toBe('"Status"=\'Active\' AND "CreatedByUserID"=\'abc\'');
        });

        it('GenerateSaveSQL CTE pattern: RETURNING is a keyword (regression: Save MJ: Workspaces)', () => {
            // The Save flow generates a multi-CTE SQL with INSERT … RETURNING.
            // RETURNING must be recognized as a keyword and left bare; otherwise
            // PG sees `"RETURNING" "ID"` (two adjacent quoted identifiers) and
            // throws a syntax error.
            const input = `WITH save_result AS (
    SELECT * FROM __mj."spCreateMJWorkspace"($1, $2)
),
record_change AS (
    INSERT INTO __mj."RecordChange" ("EntityID", "RecordID")
    SELECT $3::uuid, 'ID' || '|' || save_result."ID"::text
    FROM save_result
    RETURNING "ID"
)
SELECT * FROM save_result`;
            const output = quote(input);
            // RETURNING must NOT be wrapped in quotes
            expect(output).not.toContain('"RETURNING"');
            expect(output).toContain('RETURNING "ID"');
            // Idempotency check
            expect(quote(output)).toBe(output);
        });

        it('handles other PG keywords: WINDOW, FILTER, EXCEPT, INTERSECT', () => {
            expect(quote('SELECT * FROM a EXCEPT SELECT * FROM b'))
                .toBe('SELECT * FROM a EXCEPT SELECT * FROM b');
            expect(quote('SELECT count(*) FILTER (WHERE x > 1) FROM t'))
                .toBe('SELECT count(*) FILTER (WHERE x > 1) FROM t');
        });
    });

    describe('edge cases', () => {
        it('handles empty string', () => {
            expect(quote('')).toBe('');
        });

        it('handles whitespace-only string', () => {
            expect(quote('   ')).toBe('   ');
        });

        it('handles SQL with only keywords and operators', () => {
            expect(quote('SELECT * FROM tbl WHERE 1 = 1'))
                .toBe('SELECT * FROM tbl WHERE 1 = 1');
        });

        it('preserves @-prefixed parameters (legacy SQL Server style)', () => {
            expect(quote('WHERE id = @userId')).toBe('WHERE id = @userId');
        });

        it('preserves [bracketed] identifiers verbatim (passes through, does not translate)', () => {
            // We don't translate brackets to PG quotes here — runtime SQL
            // shouldn't be using brackets. If it does, the tokenizer just
            // leaves them alone (PG would still error, but at least we don't
            // make it worse).
            expect(quote('SELECT [Length] FROM x')).toBe('SELECT [Length] FROM x');
        });
    });

    describe('PG type names in CAST/:: expressions', () => {
        // Regression: hand-written runtime SQL like CAST(x AS INTEGER) used to
        // emit "INTEGER" (quoted), which PG resolves as a user-defined type
        // name and rejects with `type "INTEGER" does not exist`. INTEGER and
        // related PG type keywords must pass through unquoted.
        it('does not quote INTEGER in a CAST expression', () => {
            expect(quote('SELECT CAST(x AS INTEGER) FROM t'))
                .toBe('SELECT CAST(x AS INTEGER) FROM t');
        });

        it('does not quote INTEGER in a :: cast', () => {
            expect(quote("SELECT '5'::INTEGER FROM t"))
                .toBe("SELECT '5'::INTEGER FROM t");
        });

        it('does not quote DOUBLE PRECISION', () => {
            expect(quote('SELECT CAST(x AS DOUBLE PRECISION) FROM t'))
                .toBe('SELECT CAST(x AS DOUBLE PRECISION) FROM t');
        });

        it('does not quote BYTEA', () => {
            expect(quote("SELECT 'x'::BYTEA FROM t"))
                .toBe("SELECT 'x'::BYTEA FROM t");
        });
    });

    describe('uppercase-only keywords (TYPE / DATA) — DDL vs column name', () => {
        // Regression: a runtime ALTER like `ALTER COLUMN "x" TYPE boolean` used to
        // emit `ALTER COLUMN "x" "TYPE" boolean` (TYPE quoted as an identifier),
        // which PG rejects with `syntax error at or near "TYPE"`. The all-caps
        // keyword form must pass through unquoted.
        it('leaves the all-caps TYPE keyword bare in an ALTER COLUMN', () => {
            expect(quote('ALTER TABLE hubspot."Contacts" ALTER COLUMN "Active" TYPE boolean'))
                .toBe('ALTER TABLE hubspot."Contacts" ALTER COLUMN "Active" TYPE boolean');
        });

        it('leaves the all-caps DATA keyword bare in SET DATA TYPE', () => {
            expect(quote('ALTER TABLE x ALTER COLUMN "c" SET DATA TYPE integer'))
                .toBe('ALTER TABLE x ALTER COLUMN "c" SET DATA TYPE integer');
        });

        // The other half of the fix: a PascalCase column literally named `Type`
        // or `Data` (very common in MJ — RecordChange.Type, etc.) must STILL be
        // quoted, because matching is case-SENSITIVE for these two words.
        it('still quotes a PascalCase Type column reference', () => {
            expect(quote('SELECT Type FROM x')).toBe('SELECT "Type" FROM x');
        });

        it('still quotes a PascalCase Data column reference', () => {
            expect(quote('SELECT t.Data FROM x t')).toBe('SELECT t."Data" FROM x t');
        });

        it('still quotes Type when dot-qualified', () => {
            expect(quote('SELECT rc.Type FROM __mj.vwRecordChanges rc'))
                .toBe('SELECT rc."Type" FROM __mj."vwRecordChanges" rc');
        });
    });

    /**
     * Case-sensitive keyword matching (MJ #3604, #3590, #3691). Before this, a column whose
     * name collided with a SQL keyword — `Name` is on nearly every MJ entity, `Values` is the
     * field-level-encrypted column on __mj."Credential" — was emitted unquoted, folded to
     * lowercase on PG, and failed with `column "..." does not exist`.
     */
    describe('keyword-colliding column names', () => {
        const COLLIDING_COLUMNS = [
            'Action', 'Columns', 'Language', 'Length', 'Log',
            'Month', 'Name', 'Precision', 'Rank', 'Text', 'Values',
        ] as const;

        it.each(COLLIDING_COLUMNS)('quotes %s in a SELECT list', (col) => {
            expect(quote(`SELECT ${col} FROM x`)).toBe(`SELECT "${col}" FROM x`);
        });

        it.each(COLLIDING_COLUMNS)('quotes %s in a WHERE clause', (col) => {
            expect(quote(`SELECT 1 FROM x WHERE ${col} = $1`)).toBe(`SELECT 1 FROM x WHERE "${col}" = $1`);
        });

        it.each(COLLIDING_COLUMNS)('quotes %s in an UPDATE SET clause', (col) => {
            expect(quote(`UPDATE x SET ${col} = $1`)).toBe(`UPDATE x SET "${col}" = $1`);
        });

        it('quotes the column list while leaving the VALUES keyword bare', () => {
            expect(quote(`INSERT INTO __mj."Credential" (Name, Values) VALUES ($1, $2)`))
                .toBe(`INSERT INTO __mj."Credential" ("Name", "Values") VALUES ($1, $2)`);
        });

        it('distinguishes the Length column from the LENGTH function in one statement', () => {
            expect(quote('SELECT Length, LENGTH(Name) FROM x')).toBe('SELECT "Length", LENGTH("Name") FROM x');
        });
    });

    describe('ALL-CAPS words that are not keywords', () => {
        it('quotes the ID and URL acronym columns rather than folding them', () => {
            expect(quote('SELECT ID, URL FROM x')).toBe('SELECT "ID", "URL" FROM x');
        });
    });

    describe('function calls', () => {
        it('leaves a mixed-case function name bare while quoting its arguments', () => {
            expect(quote("SELECT Coalesce(Name, 'x') FROM x")).toBe(`SELECT Coalesce("Name", 'x') FROM x`);
        });

        it('quotes a dot-qualified stored procedure written without quotes', () => {
            expect(quote('SELECT * FROM __mj.spCreateMJWorkspace($1)'))
                .toBe('SELECT * FROM __mj."spCreateMJWorkspace"($1)');
        });
    });

    /**
     * Fragments authored outside this repo — stored `UserView.OrderBy` values and GraphQL
     * `ExtraFilter` strings — predate case-sensitive keyword matching and can spell structural
     * words in mixed case. Those words stay case-insensitive so existing stored data keeps working.
     */
    describe('externally authored SQL fragments', () => {
        it('leaves a mixed-case sort direction bare while quoting the column', () => {
            expect(quote('ORDER BY Name Desc')).toBe('ORDER BY "Name" Desc');
        });

        it('leaves mixed-case boolean operators bare', () => {
            expect(quote('Length = 1 And Rank = 2 Or Name Is Null'))
                .toBe('"Length" = 1 And "Rank" = 2 Or "Name" Is Null');
        });
    });

    describe('idempotency through the provider entry point', () => {
        it('produces the same output when applied twice', () => {
            const sql = `SELECT ID, Name, LENGTH(Values), rc.Type FROM __mj.vwRecordChanges rc WHERE Log Is Null ORDER BY Name Desc`;
            const once = quote(sql);
            expect(quote(once)).toBe(once);
        });
    });
});
