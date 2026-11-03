/**
 * What a database server reports about the result set a statement would return, without the
 * statement's rows: each output column's name, position, exact type, nullability and, when the
 * column passes a table or view column through unchanged, that column.
 */

/** The table or view column an output column passes through unchanged. */
export interface DescribedColumnSource {
    /** The schema of the table or view. */
    readonly Schema: string;
    /** The table or view. */
    readonly Object: string;
    /** The column of that table or view. */
    readonly Column: string;
}

/** One output column of a described statement. */
export interface DescribedColumn {
    /** The name the client receives; `''` for a column the statement leaves unnamed. */
    readonly Name: string;
    /** The column's 1-based position in the result. */
    readonly Ordinal: number;
    /** The type without length, precision or scale, such as `nvarchar` or `character varying`. */
    readonly SQLBaseType: string;
    /** The type as the server writes it, such as `nvarchar(100)`, `decimal(18,2)` or `character varying(100)`. */
    readonly SQLFullType: string;
    /** Whether the column can hold NULL; `null` when the server does not say (PostgreSQL). */
    readonly IsNullable: boolean | null;
    /**
     * Whether the column is computed rather than passed through: it has no source column (an
     * expression, aggregate, literal or set-operation output), or its source column is itself a
     * computed column.
     */
    readonly IsComputed: boolean;
    /** The table or view column the value comes from unchanged; `null` when there is none. */
    readonly Source: DescribedColumnSource | null;
}

/** The result of describing a statement. */
export interface DescribeStatementResult {
    /** Whether the server described the statement. */
    readonly Success: boolean;
    /** The output columns, in order. Empty when the description failed. */
    readonly Columns: readonly DescribedColumn[];
    /** The server's error text, one entry per error, when the description failed. */
    readonly Diagnostics: readonly string[];
}

/** A failed description carrying `messages`. */
export function DescribeStatementFailure(...messages: string[]): DescribeStatementResult {
    return Object.freeze({ Success: false, Columns: Object.freeze([]), Diagnostics: Object.freeze(messages.filter(m => m.length > 0)) });
}

/** A successful description of `columns`. */
export function DescribeStatementSuccess(columns: readonly DescribedColumn[]): DescribeStatementResult {
    return Object.freeze({ Success: true, Columns: Object.freeze([...columns]), Diagnostics: Object.freeze([]) });
}

/** The base type of a full type: the text before its first `(`, trimmed (`decimal(18,2)` → `decimal`). */
export function BaseTypeOf(fullType: string): string {
    const open = fullType.indexOf('(');
    return (open < 0 ? fullType : fullType.slice(0, open)).trim();
}
