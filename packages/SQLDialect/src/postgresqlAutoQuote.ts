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
/**
 * Known tokenization limitations (comments containing an apostrophe, and `E'...'` escape
 * strings) are tracked as **MJ #3775** — pre-existing, unchanged by the consolidation, and now
 * fixable in one place rather than two.
 */

/**
 * NOT the only identifier quoter in MJ, and deliberately so.
 *
 * `PostgreSQLDataProvider` carries a separate, METADATA-DRIVEN quoter
 * (`quoteIdentifiersInSQL` / `quoteFieldNamesInToken`, used by `TransformExternalSQLClause`) which
 * knows the entity's actual field list and can therefore quote precisely, without any keyword
 * heuristic. This module is the fallback for SQL where no entity context exists — hand-authored
 * and stored SQL reaching `ExecuteSQL`.
 *
 * They are not duplicates and this is not an unfinished consolidation: a metadata-driven quoter
 * cannot serve arbitrary SQL, and a heuristic one should not be used where the field list is
 * known. Do not merge them.
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
    // PostgreSQL reserved words the shipped baseline emits that were absent from this set.
    // None is an MJ column name, so adding them costs nothing and closes the gap the reverse
    // guard below measures. `SYSTEM` is the `TABLESAMPLE SYSTEM` sampling method; `VALID` and
    // `DEFERRABLE`/`INITIALLY` are constraint attributes; `CURRENT_USER`/`SESSION_USER` are
    // niladic functions written without parentheses, so rule 3 (word before `(`) never sees them.
    'BOTH', 'CURRENT_USER', 'SESSION_USER', 'DEFERRABLE', 'INITIALLY', 'EXTENSION', 'VALID', 'SYSTEM',
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
    // Predicate vocabulary — a saved `OrderBy` of `Name Desc`, an `ExtraFilter` of `A=1 And B=2`.
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'ILIKE', 'IN', 'BETWEEN', 'EXISTS',
    'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
]);

// A NOTE ON WHAT IS DELIBERATELY ABSENT FROM THE SET ABOVE.
//
// Widening this tier to the whole clause skeleton (`SELECT FROM WHERE JOIN AS ON BY DISTINCT
// HAVING UNION INTERSECT EXCEPT LIMIT OFFSET CASE WHEN THEN ELSE END`) is tempting, because it
// would let a stored `MJ: Queries` body written as `Select … From … Where …` parse. It was tried
// and reverted, for two reasons that only show up when you look at the whole predicate:
//
//   1. This tier is matched case-INsensitively and is evaluated BEFORE the dot-qualification
//      rule, so adding a word makes it unquotable *even as `alias.Column`* — the one form the
//      rest of this module treats as an unambiguous identifier. A customer column named `Case`,
//      `End`, `Limit` or `Offset` would fold, which is precisely the defect class this whole
//      change exists to eliminate, reintroduced for 20 words.
//   2. It does not actually deliver. `Cast(Amount As Decimal)` still fails (the type name quotes),
//      `Insert Into Target (Name)` still fails, `Select Top 10` still fails. Mixed-case SQL needs
//      a real parser, not a bigger denylist — so the widening paid the full price for a fraction
//      of the benefit.
//
// Mixed-case SQL keywords beyond the predicate vocabulary are therefore a KNOWN LIMITATION: a
// stored query body written `Select … From …` does not survive on PostgreSQL. Rewriting it in
// upper case fixes it, and the error is a loud syntax error rather than silently wrong rows.

/**
 * Words that are structural **only when followed by a specific next word**, and ordinary
 * quotable identifiers otherwise.
 *
 * This is how the two-word clause forms are covered without giving up column names. `Order` and
 * `Group` are believable columns; `Order By` and `Group By` are not columns at all.
 * `Left`/`Right`/`Full` are believable columns AND scalar functions; `Left Join` is neither.
 * Gating on the following word separates the cases exactly, rather than trading one breakage for
 * another — which is why this tier is safe to extend and {@link PostgreSQLStructuralKeywords}
 * is not.
 *
 * Matched case-insensitively on both sides.
 */

/**
 * Words that are structural **only when followed by a specific next word**, and ordinary
 * quotable identifiers otherwise.
 *
 * This exists so the clause skeleton can be covered without giving up column names that
 * genuinely occur. `Order` and `Group` are believable columns; `Order By` and `Group By` are
 * not columns at all. `Left`/`Right`/`Full` are believable columns AND scalar functions;
 * `Left Join` is neither. Gating on the following word separates the two cases exactly,
 * rather than trading one breakage for another.
 *
 * Matched case-insensitively on both sides, like {@link PostgreSQLStructuralKeywords}.
 */
export const PostgreSQLContextualStructuralKeywords: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ['ORDER', new Set(['BY'])],
    ['GROUP', new Set(['BY'])],
    ['LEFT', new Set(['JOIN', 'OUTER'])],
    ['RIGHT', new Set(['JOIN', 'OUTER'])],
    ['FULL', new Set(['JOIN', 'OUTER'])],
    ['INNER', new Set(['JOIN'])],
    ['CROSS', new Set(['JOIN'])],
    ['OUTER', new Set(['JOIN'])],
]);

/**
 * Every word that appears on the RIGHT of a pair above — the only words for which the reverse
 * lookup can possibly succeed. Gating on this makes the backwards scan run for three words
 * instead of every word in the statement (measured: it is the whole of the tokenizer's ~2x
 * worst-case slowdown on whitespace-heavy input).
 */
const PostgreSQLContextualFollowers: ReadonlySet<string> = new Set(
    [...PostgreSQLContextualStructuralKeywords.values()].flatMap((s) => [...s]),
);

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
 * 2a. In {@link PostgreSQLContextualStructuralKeywords} AND followed by one of its permitted
 *     next words (`Order By`, `Left Join`) → do not quote. Anywhere else, an identifier.
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
 * String literals (with `''` escapes and `E`/`N`/`U&` prefixes), `--` line comments,
 * `/* *\/` block comments (nested, as PostgreSQL specifies), dollar-quoted blocks
 * (`$$`/`$tag$`), already-quoted identifiers (with `""` escapes), square-bracketed
 * SQL-Server-style identifiers, `@`-prefixed parameters, and PG positional parameters (`$1`).
 * Skipping already-quoted identifiers is what makes this function **idempotent** —
 * `f(f(x)) === f(x)`.
 *
 * ## Why comments are skipped rather than tolerated
 *
 * Comment handling is not cosmetic. The scanner is a parity machine: an apostrophe inside an
 * unrecognized comment opens a string-literal scan that runs to the next `'`, which is the
 * OPENING quote of a real literal. From there every literal and every code region swaps roles.
 * Against this repository's own shipped query SQL that rewrote literal VALUES —
 * `WHERE "StepType" = 'Prompt'` became `= '"Prompt"'`, and the `jsonb_build_object` keys in
 * `get-conversation-complete.pg.sql` became `'"ID"'` — because line 10 of
 * `calculate-ai-agent-run-cost.pg.sql` contains the word `doesn't` in a comment. Nothing
 * throws; the query simply returns the wrong rows. `postgresqlAutoQuote.shippedQueries.test.ts`
 * pins that whole file set as a no-op so it cannot come back.
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

        // Comments come FIRST. Every branch below this one is parity-sensitive, and a comment
        // is the one region whose contents are guaranteed not to be SQL — see the module doc.
        if (ch === '-' && sql[i + 1] === '-') {
            i = skipLineComment(sql, i, len, result);
            continue;
        }
        if (ch === '/' && sql[i + 1] === '*') {
            i = skipBlockComment(sql, i, len, result);
            continue;
        }
        if (ch === '{' && (sql[i + 1] === '{' || sql[i + 1] === '%' || sql[i + 1] === '#')) {
            i = skipTemplatePlaceholder(sql, i, len, result);
            continue;
        }
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
            // `E'…'` / `N'…'` / `U&'…'` are one literal, not a word followed by a literal.
            // Tokenizing the prefix as a word emitted `"E"'…'`, which PG rejects.
            const prefix = literalPrefixLength(sql, i, len);
            if (prefix > 0) {
                result.push(sql.substring(i, i + prefix));
                // Only the E-form honours backslash escapes, so only it may treat `\'` as
                // part of the literal rather than its terminator.
                const backslashEscapes = sql[i] === 'E' || sql[i] === 'e';
                i = skipSingleQuotedString(sql, i + prefix, len, result, backslashEscapes);
                continue;
            }
            i = processWord(sql, i, len, result);
            continue;
        }

        result.push(ch);
        i++;
    }

    return result.join('');
}

/**
 * Length of a string-literal prefix starting at `start`, or 0 when this is an ordinary word.
 *
 * Recognizes PostgreSQL's `E'…'` (C-style escapes) and `U&'…'` (Unicode escapes), plus T-SQL's
 * `N'…'` which reaches this tokenizer in raw SQL fragments carried over from SQL Server.
 */
function literalPrefixLength(sql: string, start: number, len: number): number {
    const ch = sql[start];
    if ((ch === 'E' || ch === 'e' || ch === 'N' || ch === 'n') && sql[start + 1] === "'") return 1;
    if ((ch === 'U' || ch === 'u') && sql[start + 1] === '&' && start + 2 < len && sql[start + 2] === "'") return 3;
    return 0;
}

/** Closing delimiter for each Nunjucks opening delimiter. */
const TEMPLATE_DELIMITERS: ReadonlyMap<string, string> = new Map([
    ['{', '}}'],
    ['%', '%}'],
    ['#', '#}'],
]);

/**
 * Skips a Nunjucks template tag — `{{ … }}`, `{% … %}`, `{# … #}`.
 *
 * `MJ: Queries` bodies are Nunjucks templates. `WHERE cd."ConversationID" = {{ ConversationID |
 * sqlString }}` and `{% if AgentID %}` are both shipped shapes. The names inside the delimiters
 * are PARAMETER names, matched exactly at render time; quoting one to `{{ "ConversationID" |
 * sqlString }}` makes the lookup miss and the parameter never substitutes, so the query loses
 * its filter and returns the unfiltered set. Rendering normally happens before `ExecuteSQL`, so
 * this is defence in depth — but the cost is a dozen lines and the failure it prevents is silent.
 */
function skipTemplatePlaceholder(sql: string, start: number, len: number, result: string[]): number {
    const closing = TEMPLATE_DELIMITERS.get(sql[start + 1]);
    const close = closing ? sql.indexOf(closing, start + 2) : -1;
    if (close === -1) {
        // No closing delimiter. Consuming to end-of-input would silently emit every identifier
        // after a stray `{{` unquoted — total, and invisible. Emit the two delimiter characters
        // and resume normal scanning instead, which is the posture the dollar-quote branch
        // already takes for a missing close tag.
        result.push(sql.substring(start, start + 2));
        return start + 2;
    }
    const end = close + 2;
    result.push(sql.substring(start, end));
    return end;
}

/** Skips a `--` line comment through to (but not including) its terminating newline. */
function skipLineComment(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 2;
    while (j < len && sql[j] !== '\n') j++;
    result.push(sql.substring(start, j));
    return j;
}

/**
 * Skips a block comment. PostgreSQL block comments NEST, unlike the SQL standard's: an inner
 * open marker must be matched by its own close marker before the outer comment ends, which is
 * why this tracks depth rather than searching for the first close. An unterminated comment
 * consumes the remainder of the input, which is what PostgreSQL itself does.
 */
function skipBlockComment(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 2;
    let depth = 1;
    while (j < len && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; }
        else j++;
    }
    result.push(sql.substring(start, j));
    return j;
}

/**
 * Skips a single-quoted string literal, handling `''` escapes.
 *
 * @param backslashEscapes true for an `E'…'` literal, where `\'` does not terminate the string.
 */
function skipSingleQuotedString(
    sql: string,
    start: number,
    len: number,
    result: string[],
    backslashEscapes = false,
): number {
    let j = start + 1;
    while (j < len) {
        if (backslashEscapes && sql[j] === '\\' && j + 1 < len) {
            j += 2;
        } else if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
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

/**
 * Skips an already double-quoted identifier — this is what makes the tokenizer idempotent.
 * A `""` pair inside the identifier is an escaped quote, not the close, so stopping at the
 * first `"` would resume mid-identifier and quote the remainder as if it were code.
 */
function skipDoubleQuotedIdentifier(sql: string, start: number, len: number, result: string[]): number {
    let j = start + 1;
    while (j < len) {
        if (sql[j] === '"' && sql[j + 1] === '"') { j += 2; continue; }
        if (sql[j] === '"') { j++; break; }
        j++;
    }
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

/**
 * The next bare word after `from`, skipping whitespace only — an empty string when the next
 * non-space character is not a word character. Deliberately does NOT skip comments: a word
 * separated from its partner by a comment is not the two-word construct being matched.
 */
function nextWord(sql: string, from: number): string {
    let i = from;
    while (i < sql.length && /\s/.test(sql[i])) i++;
    const start = i;
    while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) i++;
    return sql.substring(start, i);
}

/**
 * The bare word immediately before `to`, skipping whitespace only — the mirror of
 * {@link nextWord}. Empty when the preceding non-space character is not a word character, which
 * is what keeps `t.Order` and `(Order` from pairing with whatever came before them.
 *
 * Empty in two further cases, both of which exist to make this the true mirror of the forward
 * lookup rather than an approximation of it:
 *
 *   - **The word found is itself dot-qualified or already quoted** (`t.Order By`, `"Order" By`).
 *     Those keys do not match forward — a dot-qualified key never reaches the contextual tier,
 *     and a quoted one is not a word at all — so pairing backwards against them makes the two
 *     directions disagree and breaks `f(f(x)) === f(x)`: pass 1 emits `t."Order" By`, pass 2 then
 *     sees a quoted key, declines to pair, and emits `t."Order" "By"`.
 *   - **The scan would cross into a `--` comment.** `nextWord` gets this for free (it starts on
 *     the `-` and returns empty); backwards there is no such guard, so a line comment ending in
 *     the word `order` would leave a real column named `By` on the next line unquoted — a fresh
 *     instance of exactly the case-folding failure this module exists to prevent.
 */
function previousWord(sql: string, to: number): string {
    let i = to - 1;
    while (i >= 0 && /\s/.test(sql[i])) i--;
    const end = i + 1;
    while (i >= 0 && /[a-zA-Z0-9_]/.test(sql[i])) i--;
    const before = i >= 0 ? sql[i] : '';
    if (before === '.' || before === '"') return '';
    // A newline between the found word and `to` means the word sits on an earlier line; if that
    // line has an unclosed `--`, the word is comment text, not SQL.
    const gap = sql.substring(end, to);
    if (gap.includes('\n')) {
        const lineStart = sql.lastIndexOf('\n', i) + 1;
        if (sql.substring(lineStart, end).includes('--')) return '';
    }
    return sql.substring(i + 1, end);
}

/** True when a word must be emitted verbatim rather than quoted as an identifier. */
function isBareWord(word: string, sql: string, start: number, end: number): boolean {
    const precededByDot = start > 0 && sql[start - 1] === '.';

    // 1. Keywords, recognized ONLY in their ALL-CAPS form. An ALL-CAPS word that is not a
    //    keyword (`ID`, `URL`) falls through and is quoted as the identifier it is.
    //
    //    This tier runs BEFORE the dot rule below, and the ordering is load-bearing in one
    //    direction only. Some entries in the keyword set exist *specifically* for their
    //    dot-qualified form — `INFORMATION_SCHEMA.COLUMNS`, `.TABLES`, `.ROUTINES` — and the
    //    catalog's real relation names are lower case, so quoting the right-hand half emits
    //    `INFORMATION_SCHEMA."COLUMNS"`, which does not resolve. CodeGen executes that exact
    //    SQL through `qsql()` on every PostgreSQL run (`manage-metadata.ts`, three call sites,
    //    two of them unconditional), so quoting it turns a working run into a hard failure.
    //    Because this tier is case-SENSITIVE it cannot swallow a mixed-case column: `Case` is
    //    not `CASE`, so `e.Case` still reaches the dot rule and quotes.
    if (word === word.toUpperCase() && PostgreSQLQuotingKeywords.has(word)) {
        return true;
    }
    // 2. A dot-qualified word is a MEMBER REFERENCE — `alias.Column`, `schema.object`. No tier
    //    BELOW this one may override that, because no SQL dialect has a structural keyword in
    //    that position. Checking it ahead of the remaining tiers is what stops any word added to
    //    the structural or contextual sets from making a legitimate column unquotable, which is
    //    the failure mode this module exists to prevent and the one a widened structural tier
    //    reintroduced.
    if (precededByDot) {
        return false;
    }
    // 3. Structural words, any case — the compatibility tier for externally authored SQL.
    if (PostgreSQLStructuralKeywords.has(word.toUpperCase())) {
        return true;
    }
    // 2a. Structural only in front of a specific next word (`Order By`, `Left Join`). Anywhere
    //     else these are ordinary identifiers and fall through to be quoted.
    const followers = PostgreSQLContextualStructuralKeywords.get(word.toUpperCase());
    if (followers && followers.has(nextWord(sql, end).toUpperCase())) {
        return true;
    }
    // 2b. …and the FOLLOWER of such a pair is structural too. Leaving `Order` bare while quoting
    //     `By` produces `Order "By" "Name"`, which is no more valid than the form it replaced —
    //     the pair is one construct and both halves have to be recognized. This is the reverse
    //     lookup: is the immediately preceding word a contextual key that permits this one?
    //     It chains correctly through `Full Outer Join`, where `Outer` is both a follower of
    //     `Full` and a key whose follower is `Join`.
    const upper = word.toUpperCase();
    if (PostgreSQLContextualFollowers.has(upper)) {
        const precedingFollowers = PostgreSQLContextualStructuralKeywords.get(previousWord(sql, start).toUpperCase());
        if (precedingFollowers && precedingFollowers.has(upper)) {
            return true;
        }
    }
    // 3. Function call: immediately followed by `(`, and not dot-qualified (MJ's own stored
    //    procedures are dot-qualified with quoted mixed-case names and must stay quoted).
    if (sql[end] === '(' && !precededByDot) {
        return true;
    }
    // 4. Anything all-lowercase is left alone; otherwise a word is an identifier if it starts
    //    uppercase or is a member reference after a `.`.
    //
    //    There is NO `__mj_` carve-out here, and its removal is the point. Both prior tokenizer
    //    copies returned bare for any word starting `__mj_`, evaluated ahead of the dot rule, so
    //    even the qualified form escaped:
    //
    //        SELECT t.__mj_UpdatedAt FROM __mj.Entity t   =>   ... t.__mj_UpdatedAt ...
    //
    //    which folds to `__mj_updatedat` and fails with `column "__mj_updatedat" does not exist`
    //    — verbatim the defect this module exists to fix. The clause was also redundant for the
    //    purpose it was written for: all-lowercase `__mj_*` names are already covered by
    //    `isAllLower` on the line below, so the ONLY words it ever affected were the mixed-case
    //    real columns — `__mj_CreatedAt`, `__mj_UpdatedAt`, `__mj_Latitude`, `__mj_Longitude`,
    //    `__mj_UDT` — i.e. exactly the five it broke. Do not reintroduce it.
    //    The framework columns need one positive rule rather than merely the absence of the old
    //    carve-out. Dropping the exemption alone fixes only the dot-qualified form, because
    //    `__mj_UpdatedAt` does not START with an uppercase letter — so a bare
    //    `SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt` (the shape the Query entity's own
    //    CacheValidationSQL field description documents) would still fold and fail. A `__mj_` word
    //    carrying any uppercase is unambiguously one of MJ's five framework columns: the prefix is
    //    MJ's namespace and no SQL keyword lives there, so there is nothing for this to collide
    //    with. All-lowercase `__mj_*` names remain bare via `isAllLower` below, unchanged.
    const isFrameworkColumn = word.startsWith('__mj_') && word !== word.toLowerCase();
    if (isFrameworkColumn) {
        return false;
    }
    const isAllLower = word === word.toLowerCase();
    const startsUpper = /^[A-Z]/.test(word);
    return isAllLower || !(startsUpper || precededByDot);
}
