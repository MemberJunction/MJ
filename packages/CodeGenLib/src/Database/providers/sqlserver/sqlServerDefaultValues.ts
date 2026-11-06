/**
 * Classification of SQL Server column defaults for the generated create procedure (#4000).
 *
 * A column default reaches CodeGen as `EntityFieldInfo.DefaultValue`, which has already been through
 * `ExtractActualDefaultValue`: wrapping parentheses, an `N'...'` prefix and symmetric single quotes
 * are stripped. What is left is either a literal (a number, a string's content, NULL), a function
 * call that is legal inside `ISNULL(...)` / `CASE`, or a general expression. The raw
 * `sys.default_constraints.definition` form is accepted too.
 *
 * Expressions cannot be inlined. T-SQL rejects `NEXT VALUE FOR` inside `ISNULL`, `CASE`, `COALESCE`,
 * `IIF`, `CHOOSE` and `NULLIF`, and quoting an expression (the old behavior) turns it into a string
 * that does not even parse once it contains its own `N'...'` literals. Expressions are therefore
 * assigned to the parameter before the INSERT: `IF @P IS NULL SET @P = <expr>;`.
 */

/** How a default is emitted into the generated create procedure. */
export type SQLServerDefaultValueKind =
    /** A constant: emitted inline, quoted when the column's type needs quotes. */
    | 'Literal'
    /** A built-in function call that is legal inside ISNULL/CASE: emitted inline, verbatim. */
    | 'InlineFunction'
    /** Anything else: assigned to the parameter before the INSERT. */
    | 'Expression';

export interface SQLServerDefaultValueClassification {
    Kind: SQLServerDefaultValueKind;
    /** The SQL to emit for this default. */
    SQL: string;
}

/**
 * Functions that were always inlined and are legal inside ISNULL/CASE. A default that contains one of
 * them (and none of the forbidden constructs below) keeps its existing inline output, so generated
 * procedures for ordinary `getutcdate()` / `newid()` defaults do not change.
 */
const INLINE_SAFE_FUNCTIONS: readonly string[] = [
    'newid()', 'getdate()', 'getutcdate()',
    'sysdatetime()', 'sysutcdatetime()', 'sysdatetimeoffset()', 'current_timestamp',
    'user_name()', 'suser_name()', 'system_user',
];

/**
 * Built-in functions that mark a string-typed default as an expression. The value has had its
 * quotes stripped, so `format(...)` and a literal whose text happens to be `format(...)` look the
 * same; only names that are real T-SQL built-ins count, which keeps `Draft (1)`-style literals literal.
 */
const EXPRESSION_FUNCTIONS: ReadonlySet<string> = new Set([
    'cast', 'convert', 'try_cast', 'try_convert', 'parse', 'try_parse', 'format', 'concat', 'concat_ws',
    'dateadd', 'datediff', 'datefromparts', 'datetimefromparts', 'datetime2fromparts', 'eomonth',
    'datename', 'datepart', 'year', 'month', 'day', 'switchoffset', 'todatetimeoffset',
    'upper', 'lower', 'left', 'right', 'replace', 'replicate', 'substring', 'stuff', 'trim', 'ltrim',
    'rtrim', 'str', 'char', 'nchar', 'space', 'reverse', 'coalesce', 'isnull', 'iif', 'choose',
    'json_object', 'json_array', 'json_value', 'session_context', 'context_info', 'crypt_gen_random',
    'original_login', 'suser_sname', 'host_name', 'app_name', 'db_name', 'object_name', 'abs', 'round',
    'floor', 'ceiling', 'rand', 'checksum', 'binary_checksum', 'hashbytes',
]);

/** Niladic built-ins that read like bare words. */
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set(['current_user', 'session_user', 'user']);

const NUMERIC_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const STRING_LITERAL = /^N?'(?:[^']|'')*'$/i;
const NEXT_VALUE_FOR = /\bnext\s+value\s+for\b/i;
const NEWSEQUENTIALID_CALL = /\bnewsequentialid\s*\(\s*\)/gi;
const LEADING_FUNCTION_CALL = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

/**
 * Strips every layer of parentheses that wraps the WHOLE value, respecting string literals.
 * `((0))` becomes `0`; `(a) + (b)` is left alone because its first `(` closes before the end.
 */
export function StripWrappingParentheses(value: string): string {
    let v = value.trim();
    while (v.startsWith('(') && v.endsWith(')') && closingParenIndex(v, 0) === v.length - 1) {
        v = v.substring(1, v.length - 1).trim();
    }
    return v;
}

/** Index of the `)` that closes the `(` at `openIndex`, skipping string literals; -1 when unbalanced. */
function closingParenIndex(value: string, openIndex: number): number {
    let depth = 0;
    let inString = false;
    for (let i = openIndex; i < value.length; i++) {
        const ch = value[i];
        if (inString) {
            if (ch === "'") {
                if (value[i + 1] === "'") {
                    i++; // escaped quote inside the literal
                } else {
                    inString = false;
                }
            }
            continue;
        }
        if (ch === "'") {
            inString = true;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * True when the value holds a single quote that is not half of an escaped `''` pair. String content
 * that survived quote-stripping only ever holds escaped pairs, so a lone quote means the value is an
 * expression with its own string literals in it (`N'CTR-'+format(...)`).
 */
function hasUnpairedQuote(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "'") {
            if (value[i + 1] === "'") {
                i++;
            } else {
                return true;
            }
        }
    }
    return false;
}

function looksLikeStringTypedExpression(value: string): boolean {
    if (hasUnpairedQuote(value)) {
        return true;
    }
    const lower = value.toLowerCase();
    if (EXPRESSION_KEYWORDS.has(lower)) {
        return true;
    }
    const call = LEADING_FUNCTION_CALL.exec(value);
    return !!call && EXPRESSION_FUNCTIONS.has(call[1].toLowerCase()) && closingParenIndex(value, value.indexOf('(')) > 0;
}

/**
 * Classifies a SQL Server column default and returns the SQL to emit for it.
 *
 * - Empty or `NULL` → literal `NULL`.
 * - A bare `NEWSEQUENTIALID()` → `NEWID()` inline. `NEWSEQUENTIALID()` is legal only in a DEFAULT
 *   constraint, so the generated procedure substitutes the closest legal equivalent.
 * - Anything containing `NEXT VALUE FOR` → expression.
 * - A value containing one of the long-standing inline-safe functions → inline, verbatim.
 * - A number or a single string literal → literal; `needsQuotes` decides quoting as before.
 * - Anything else on a non-quoted type (number, boolean) → expression.
 * - On a quoted type, an expression is recognized by an unpaired quote, a call to a T-SQL
 *   built-in, or a niladic built-in keyword; otherwise it is a string literal's content.
 */
export function ClassifySQLServerDefaultValue(defaultValue: string, needsQuotes: boolean): SQLServerDefaultValueClassification {
    if (!defaultValue || defaultValue.trim().length === 0) {
        return { Kind: 'Literal', SQL: 'NULL' };
    }

    const value = StripWrappingParentheses(defaultValue);
    const lower = value.toLowerCase();

    if (lower === 'null') {
        return { Kind: 'Literal', SQL: 'NULL' };
    }
    if (/^newsequentialid\s*\(\s*\)$/i.test(value)) {
        return { Kind: 'InlineFunction', SQL: 'NEWID()' };
    }
    if (NEXT_VALUE_FOR.test(value) || /\bnewsequentialid\s*\(/i.test(value)) {
        return { Kind: 'Expression', SQL: value.replace(NEWSEQUENTIALID_CALL, 'NEWID()') };
    }
    if (INLINE_SAFE_FUNCTIONS.some(fn => lower.includes(fn))) {
        return { Kind: 'InlineFunction', SQL: value };
    }
    if (STRING_LITERAL.test(value)) {
        if (/^N/i.test(value)) {
            return { Kind: 'Literal', SQL: value };
        }
        return { Kind: 'Literal', SQL: needsQuotes ? value : value.substring(1, value.length - 1) };
    }
    if (NUMERIC_LITERAL.test(value)) {
        return { Kind: 'Literal', SQL: needsQuotes ? `'${value}'` : value };
    }
    if (!needsQuotes) {
        return { Kind: 'Expression', SQL: value };
    }
    if (looksLikeStringTypedExpression(value)) {
        return { Kind: 'Expression', SQL: value };
    }
    return { Kind: 'Literal', SQL: `'${value}'` };
}
