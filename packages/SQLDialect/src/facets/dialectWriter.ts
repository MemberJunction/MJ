/**
 * Result from a limit clause: some platforms cap rows with a prefix (`TOP n`), others with a
 * suffix (`LIMIT n OFFSET m`, `OFFSET m ROWS FETCH NEXT n ROWS ONLY`).
 */
export interface LimitClauseResult {
    /** SQL placed between SELECT and the column list (e.g., "TOP 10") */
    prefix: string;
    /** SQL placed after the ORDER BY / WHERE clause (e.g., "LIMIT 10 OFFSET 20") */
    suffix: string;
}

/** Time units {@link DialectWriter.DateAddExpression} accepts. */
export type DateAddUnit = 'MINUTE' | 'HOUR' | 'DAY';

/**
 * Writes SQL fragments in a dialect's syntax: quoting, literals, row caps and the common
 * expressions whose spelling differs between databases.
 */
export interface DialectWriter {
    /** Quotes an identifier, escaping the closing quote character inside it. */
    QuoteIdentifier(name: string): string;
    /** Writes a schema-qualified object name. */
    QuoteSchema(schema: string, object: string): string;
    /** Writes a column alias so the result column keeps the alias's case. */
    QuoteColumnAlias(aliasName: string): string;
    /** Writes `value` as a string literal that the dialect reads back as exactly `value`. */
    QuoteStringLiteral(value: string): string;
    /** The prefix a string literal holding `text` needs so no character is lost, or `''`. */
    StringLiteralPrefix(text: string): string;
    /** Escapes the characters a `LIKE` pattern treats specially, for the dialect's default escape rules. */
    EscapeLikePattern(text: string): string;
    /** A boolean literal. */
    BooleanLiteral(value: boolean): string;
    /** The NULL literal. */
    readonly NullLiteral: string;
    /** The row-cap fragments for `limit` rows after skipping `offset`. */
    LimitClause(limit: number, offset?: number): LimitClauseResult;
    /** `CAST(expr AS sqlType)`. */
    Cast(expr: string, sqlType: string): string;
    /** A cast of `expr` to the dialect's unbounded text type. */
    CastToText(expr: string): string;
    /** The n-ary null-coalescing expression. */
    Coalesce(expr: string, fallback: string): string;
    /** The two-argument null-coalescing expression in the dialect's native spelling. */
    IsNull(expr: string, fallback: string): string;
    /** The string concatenation operator, or `null` when the dialect has none (it uses a function). */
    ConcatOperator(): string | null;
    /** Concatenates string expressions. */
    Concat(...parts: string[]): string;
    /** Extracts a scalar value from a JSON column; `path` is in the dialect's own path syntax. */
    JsonExtract(column: string, path: string): string;
    /** Adds `amount` units to a timestamp expression. */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string;
    /** The current UTC timestamp. */
    CurrentTimestampUTC(): string;
    /** Lower-cases an expression. */
    LowerCase(expr: string): string;
    /** A conditional expression. */
    IIF(condition: string, trueVal: string, falseVal: string): string;
}
