import { PostgreSQLDialect } from './postgresqlDialect.js';

/**
 * The single PostgreSQL identifier auto-quoting tokenizer.
 *
 * This module exists because there used to be TWO hand-synced copies of it —
 * `PostgreSQLCodeGenProvider.quoteSQLForExecution` (codegen-time SQL) and
 * `PostgreSQLDataProvider.autoQuoteIdentifiers` (every runtime raw-SQL statement) —
 * which drifted apart in both their keyword sets and their quoting predicate.
 * Both now delegate here. Do not reintroduce a private copy in either provider.
 *
 * @module @memberjunction/sql-dialect/postgresqlAutoQuote
 * @see MJ issues #3604, #3590, #3691
 */

const pgDialect = new PostgreSQLDialect();

/**
 * SQL keywords, type names and built-in function names that must NOT be quoted.
 *
 * Matched **case-SENSITIVELY against the ALL-CAPS form only** — see
 * {@link AutoQuotePostgreSQLIdentifiers} for why. This set is the union of the two
 * former per-provider sets plus `TYPE`/`DATA` (previously a separate case-sensitive
 * tier, now subsumed by the all-caps-only rule).
 *
 * Adding a word here only suppresses quoting of its ALL-CAPS spelling, so a word that
 * is also an MJ column name (`NAME`, `TEXT`, `VALUES`, `LENGTH`, …) is safe to include:
 * the mixed-case column form still quotes.
 */
export const PostgreSQLQuotingKeywords: ReadonlySet<string> = new Set([
    // DML/DDL keywords
    'SELECT', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'ON', 'AS', 'SET',
    'VALUES', 'NULL', 'LIKE', 'IN', 'EXISTS', 'BETWEEN', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION',
    'ALL', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'EXEC', 'DECLARE',
    'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'TRUE', 'FALSE', 'IS', 'ASC', 'DESC',
    'DISTINCT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT',
    'IF', 'OBJECT', 'TOP', 'WITH', 'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK',
    'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'ROWS', 'RANGE',
    'PRECEDING', 'FOLLOWING', 'UNBOUNDED', 'CURRENT', 'ROW', 'FETCH', 'NEXT', 'ONLY',
    'SCHEMA', 'CASCADE', 'RESTRICT', 'NO', 'ACTION', 'TRIGGER', 'FUNCTION', 'PROCEDURE',
    'RETURNS', 'RETURN', 'RETURNING', 'EXECUTE', 'CALL', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM',
    'GRANT', 'REVOKE', 'TO', 'USAGE', 'PRIVILEGES', 'OWNER',
    'WINDOW', 'FILTER', 'EXCEPT', 'INTERSECT', 'COLLATE', 'TABLESAMPLE',
    // DDL sub-keywords
    'ADD', 'COLUMN', 'DO', 'RENAME', 'COMMENT', 'UNIQUE', 'CHECK',
    'CONFLICT', 'NOTHING', 'EXCLUDED', 'ZONE', 'AT', 'FOR', 'EACH', 'OF',
    'BEFORE', 'AFTER', 'INSTEAD', 'USING', 'ANY', 'SOME',
    'ENABLE', 'DISABLE', 'GENERATED', 'ALWAYS', 'IDENTITY',
    'SECURITY', 'DEFINER', 'INVOKER', 'FORCE', 'COPY',
    'TEMPORARY', 'TEMP', 'RECURSIVE', 'MATERIALIZED', 'CONCURRENTLY',
    // Formerly the separate case-sensitive `_SQL_KEYWORDS_UPPERCASE_ONLY` tier. `TYPE` appears in
    // `ALTER COLUMN <c> TYPE <t>` / `CREATE TYPE`, `DATA` in `ALTER COLUMN <c> SET DATA TYPE <t>` —
    // and both are also common MJ column names. They needed case-sensitive matching before the
    // whole set became all-caps-only; now they are ordinary members of it.
    'TYPE', 'DATA',
    // PL/pgSQL control flow
    'NEW', 'OLD', 'FOUND', 'LOOP', 'WHILE', 'EXIT', 'CONTINUE',
    'ELSIF', 'ELSEIF', 'STRICT',
    // Transaction / constraint control (used by SET CONSTRAINTS ALL IMMEDIATE
    // emitted before ALTER TABLE so deferred trigger events flush). Without
    // CONSTRAINTS / IMMEDIATE / DEFERRED in the keyword set, the tokenizer
    // double-quotes them as identifiers and PG rejects the resulting SQL.
    'CONSTRAINTS', 'IMMEDIATE', 'DEFERRED', 'SAVEPOINT', 'RELEASE',
    // SQL Server types (still appear in raw SQL fragments at runtime)
    'NVARCHAR', 'VARCHAR', 'UNIQUEIDENTIFIER', 'DATETIMEOFFSET', 'DATETIME', 'DATETIME2',
    'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'REAL', 'DECIMAL', 'NUMERIC', 'MONEY',
    'BIT', 'INT', 'TEXT', 'NTEXT', 'IMAGE', 'BINARY', 'VARBINARY', 'CHAR', 'NCHAR',
    'XML', 'GEOGRAPHY', 'GEOMETRY', 'HIERARCHYID', 'SQL_VARIANT', 'SYSNAME',
    'NEWSEQUENTIALID', 'NEWID', 'GETUTCDATE', 'GETDATE', 'SYSDATETIMEOFFSET',
    'OBJECT_ID', 'SCOPE_IDENTITY',
    // Aggregate / scalar functions
    'COUNT', 'MAX', 'MIN', 'SUM', 'AVG', 'ROUND', 'NULLIF', 'ABS', 'CEIL', 'CEILING', 'FLOOR',
    'SIGN', 'MOD', 'POWER', 'SQRT', 'LOG', 'EXP', 'RANDOM',
    'COALESCE', 'CAST', 'CONVERT', 'ISNULL',
    'LEN', 'LENGTH', 'DATALENGTH', 'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'REPLACE',
    'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'STUFF', 'CONCAT', 'FORMAT',
    'POSITION', 'OVERLAY', 'EXTRACT', 'GREATEST', 'LEAST',
    'DATEADD', 'DATEDIFF', 'DATEPART', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
    'SECOND', 'NOW', 'CURRENT_TIMESTAMP',
    // PostgreSQL specific
    'BOOLEAN', 'SERIAL', 'BIGSERIAL', 'UUID', 'JSONB', 'JSON', 'ARRAY', 'TIMESTAMPTZ',
    'TIMESTAMP', 'DATE', 'TIME', 'INTERVAL', 'CITEXT', 'INET', 'MACADDR',
    // PG type names that show up in CAST(... AS T) and ::T expressions in
    // hand-written SQL across the codebase. Without these in the keyword
    // set the tokenizer emits "INTEGER" / "DOUBLE" / "BYTEA" as quoted
    // identifiers and PG rejects them as unknown user-defined types.
    'INTEGER', 'DOUBLE', 'PRECISION', 'BYTEA', 'OID', 'REGCLASS', 'REGPROC', 'NAME',
    'GEN_RANDOM_UUID', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TO_NUMBER',
    'STRING_AGG', 'ARRAY_AGG', 'UNNEST', 'LATERAL', 'ILIKE',
    'LANGUAGE', 'PLPGSQL', 'VOLATILE', 'STABLE', 'IMMUTABLE', 'SETOF', 'RECORD',
    'INOUT', 'OUT', 'VARIADIC', 'PARALLEL', 'SAFE', 'UNSAFE',
    // information_schema column names
    'TABLE_SCHEMA', 'TABLE_NAME', 'TABLE_CATALOG', 'COLUMN_NAME', 'DATA_TYPE',
    'IS_NULLABLE', 'COLUMN_DEFAULT', 'CHARACTER_MAXIMUM_LENGTH', 'NUMERIC_PRECISION',
    'NUMERIC_SCALE', 'ORDINAL_POSITION', 'COLUMN_COMMENT',
    // MJ SQL constructs
    'INFORMATION_SCHEMA', 'COLUMNS', 'TABLES', 'ROUTINES',
]);

/**
 * Structural words matched **case-INsensitively**, unlike {@link PostgreSQLQuotingKeywords}.
 *
 * These are the only words exempt from the all-caps-only rule, and the exemption is
 * deliberately tiny: it covers SQL fragments authored OUTSIDE this repo that reach
 * `ExecuteSQL` — a saved `UserView.OrderBy` of `Name Desc`, a GraphQL `ExtraFilter` of
 * `A=1 And B=2`. Those work today (keywords used to match case-insensitively) and would
 * otherwise become `"Name" "Desc"` — a syntax error in stored user data this change
 * cannot reach and fix.
 *
 * Every word here is one that can never legally be an MJ column name. That invariant is
 * not a judgement call — `postgresqlAutoQuote.baseline.test.ts` derives every column name
 * from the shipped PostgreSQL baseline DDL and fails the build if any of them ever matches
 * this set case-insensitively. Do not add a word without keeping that guard green.
 */
export const PostgreSQLStructuralKeywords: ReadonlySet<string> = new Set([
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'IN', 'BETWEEN', 'EXISTS',
    'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
]);

/**
 * Quotes mixed-case identifiers in a raw SQL string so PostgreSQL preserves their case.
 *
 * MJ has a great deal of hand-written SQL — in resolvers, engines, dashboard components,
 * and codegen templates — that references PascalCase columns and views unquoted
 * (`FROM __mj.vwAIAgentRuns`, `WHERE TestRun IS NULL`). SQL Server resolves those
 * case-insensitively; PostgreSQL folds an unquoted identifier to lowercase and then fails
 * to find the mixed-case column codegen actually created. This function bridges that gap.
 *
 * ## Keywords are recognized ONLY in ALL-CAPS
 *
 * The keyword set is matched case-SENSITIVELY. This is the crux of the design, and it
 * replaces a case-insensitive denylist that was wrong by construction: the set of SQL
 * keywords and the set of MJ column names overlap (`Name`, `Values`, `Length`, `Precision`,
 * `Log`, `Rank`, `Action`, `Columns`, `Language`, `Month`, `Text` are all real columns AND
 * all keywords/type names/functions). Under case-insensitive matching every name in that
 * intersection was emitted unquoted, folded to lowercase on PG, and failed with
 * `column "..." does not exist` — while SQL Server, being case-insensitive, hid the defect
 * from T-SQL-first authoring entirely.
 *
 * Case-sensitive matching resolves the overlap cleanly because SQL dialects always emit
 * keywords in upper case, so the keyword form and the column form are textually distinct:
 * `TEXT` is the type, `Text` is the column.
 *
 * **An ALL-CAPS word that is NOT a keyword is still an identifier.** `ID` and `URL` are
 * all-caps by nature, so the predicate is `!(isAllUpper && isKeyword)` rather than a pure
 * case rule — a pure case rule would fold them to `id`/`url`.
 *
 * ## The rule
 *
 * Applied to each bare word, in this order (order is load-bearing — the keyword branch
 * runs before the function-call branch so `VALUES(` stays a keyword):
 *
 * 1. ALL-CAPS and in {@link PostgreSQLQuotingKeywords} → keyword/type → do not quote
 * 2. In {@link PostgreSQLStructuralKeywords} (any case) → do not quote
 * 3. Immediately followed by `(` and not preceded by `.` → function call → do not quote
 * 4. All-lowercase, or `__mj_`-prefixed → unchanged → do not quote
 * 5. Starts uppercase, or is preceded by `.` → identifier → QUOTE
 *
 * Rule 3 keeps mixed-case function spellings (`Coalesce(`, `IsNull(`) working now that
 * keyword matching is case-sensitive, and additionally fixes ALL-CAPS functions that were
 * simply missing from the set (`JSONB_BUILD_OBJECT(` used to be quoted, and broke). The
 * `.`-guard exists because MJ creates its stored procedures with quoted mixed-case names,
 * so hand-written `__mj.spCreateFoo(...)` must still be quoted — a dot-qualified callable
 * is far more likely to be an MJ object than a built-in. Rule 5's `.` clause is what makes
 * `__mj.vwAIAgentRuns` work (MJ's `vwXxx` view convention starts lowercase).
 *
 * Known caveat of rule 3: `INSERT INTO Target(Name)` with no space leaves `Target` bare,
 * because a bare word before `(` is indistinguishable from a call. There are no such
 * occurrences in this repo, and the spaced form `INSERT INTO Target (Name)` quotes
 * correctly. Related: `x::Text` now yields `x::"Text"`; write the cast as `::text` or
 * `::TEXT`.
 *
 * ## What is skipped
 *
 * String literals (with `''` escapes), dollar-quoted blocks (`$$`/`$tag$`), already-quoted
 * identifiers, square-bracketed SQL-Server-style identifiers, `@`-prefixed parameters, and
 * PG positional parameters (`$1`). Skipping already-quoted identifiers is what makes this
 * function **idempotent** — `f(f(x)) === f(x)`.
 *
 * ## Known limitations (pre-existing; unchanged by the consolidation)
 *
 * - `--` line comments and `/* *\/` block comments are not recognized, so PascalCase words
 *   inside a comment get quoted, and an apostrophe in a comment starts a string-literal scan.
 * - `E'...'` / `N'...'` prefixed literals tokenize the prefix as a word, yielding `"E"'...'`.
 * - `""` escapes inside an already-quoted identifier are not handled.
 *
 * These now live in exactly one place, which is the point — fix them here, not per provider.
 *
 * @param sql Raw SQL text.
 * @returns The same SQL with mixed-case identifiers double-quoted.
 */
export function AutoQuotePostgreSQLIdentifiers(sql: string): string {
    const result: string[] = [];
    let i = 0;
    const len = sql.length;

    while (i < len) {
        const ch = sql[i];

        if (ch === "'") {
            i = skipSingleQuotedString(sql, i, len, result);
            continue;
        }
        if (ch === '$') {
            i = skipDollarQuotedBlock(sql, i, len, result);
            continue;
        }
        if (ch === '"') {
            i = skipDoubleQuotedIdentifier(sql, i, len, result);
            continue;
        }
        if (ch === '[') {
            i = skipBracketedIdentifier(sql, i, len, result);
            continue;
        }
        if (ch === '@') {
            i = skipAtParameter(sql, i, len, result);
            continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
            i = processWord(sql, i, len, result);
            continue;
        }

        result.push(ch);
        i++;
    }

    return result.join('');
}

/** Skips a single-quoted string literal, handling escaped quotes ('') */
function skipSingleQuotedString(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len) {
        if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
            j += 2;
        } else if (sql[j] === "'") {
            j++;
            break;
        } else {
            j++;
        }
    }
    result.push(sql.substring(start, j));
    return j;
}

/**
 * Skips a dollar-quoted block ($$ ... $$ or $tag$ ... $tag$).
 * Falls through to literal `$` for PG positional params ($1, $2, etc.):
 * those start with `$` followed by a digit then a non-`$` character, so
 * the tag-detection scan finds no closing `$` and we push the lone `$`.
 */
function skipDollarQuotedBlock(sql: string, start: number, len: number, result: string[]): number {
    let tagEnd = start + 1;
    if (tagEnd < len && sql[tagEnd] === '$') {
        // Simple $$ tag
        tagEnd = start + 2;
    } else {
        // Look for $identifier$ pattern
        while (tagEnd < len && /[a-zA-Z0-9_]/.test(sql[tagEnd])) tagEnd++;
        if (tagEnd < len && sql[tagEnd] === '$') {
            tagEnd++;
        } else {
            // Not a dollar-quote, just a $ character (e.g. PG positional param $1)
            result.push(sql[start]);
            return start + 1;
        }
    }
    const tag = sql.substring(start, tagEnd);
    const closePos = sql.indexOf(tag, tagEnd);
    if (closePos !== -1) {
        const blockEnd = closePos + tag.length;
        result.push(sql.substring(start, blockEnd));
        return blockEnd;
    }
    // No closing tag found, pass through rest of string
    result.push(sql.substring(start));
    return len;
}

/** Skips an already double-quoted identifier — this is what makes the tokenizer idempotent */
function skipDoubleQuotedIdentifier(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len && sql[j] !== '"') j++;
    if (j < len) j++;
    result.push(sql.substring(start, j));
    return j;
}

/** Skips a square-bracketed identifier (SQL Server style; passed through verbatim) */
function skipBracketedIdentifier(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len && sql[j] !== ']') j++;
    if (j < len) j++;
    result.push(sql.substring(start, j));
    return j;
}

/** Skips an @-prefixed parameter (e.g. @userId for legacy SQL Server-style params) */
function skipAtParameter(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
    result.push(sql.substring(start, j));
    return j;
}

/**
 * Processes a word token, quoting it when it is an identifier rather than a keyword
 * or a function name. See {@link AutoQuotePostgreSQLIdentifiers} for the full rule and
 * the reasoning behind each branch; the branch order here matches it exactly.
 */
function processWord(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
    const word = sql.substring(start, j);

    if (isBareWord(word, sql, start, j)) {
        result.push(word);
    } else {
        result.push(pgDialect.QuoteIdentifier(word));
    }
    return j;
}

/** True when a word must be emitted verbatim rather than quoted as an identifier. */
function isBareWord(word: string, sql: string, start: number, end: number): boolean {
    // 1. Keywords, recognized ONLY in their ALL-CAPS form. An ALL-CAPS word that is not a
    //    keyword (`ID`, `URL`) falls through and is quoted as the identifier it is.
    if (word === word.toUpperCase() && PostgreSQLQuotingKeywords.has(word)) {
        return true;
    }
    // 2. Structural words, any case — the compatibility tier for externally authored SQL.
    if (PostgreSQLStructuralKeywords.has(word.toUpperCase())) {
        return true;
    }
    const precededByDot = start > 0 && sql[start - 1] === '.';
    // 3. Function call: immediately followed by `(`, and not dot-qualified (MJ's own stored
    //    procedures are dot-qualified with quoted mixed-case names and must stay quoted).
    if (sql[end] === '(' && !precededByDot) {
        return true;
    }
    // 4/5. Anything all-lowercase or MJ-internal is left alone; otherwise a word is an
    //      identifier if it starts uppercase or is a member reference after a `.`.
    const isAllLower = word === word.toLowerCase();
    const isMJInternal = word.startsWith('__mj_');
    const startsUpper = /^[A-Z]/.test(word);
    return isAllLower || isMJInternal || !(startsUpper || precededByDot);
}
