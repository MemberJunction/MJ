import {
    removeNPrefix,
    convertIdentifiers,
    convertCommonFunctions,
    convertDateFunctions,
    convertCharIndex,
    convertStuff,
    convertIIF,
    convertConvertFunction,
    convertCastTypes,
    convertTopToLimit,
    convertStringConcat,
    removeCollate,
} from "@memberjunction/sql-converter";

// =============================================================================
// SQL dialect conversion helpers for the query extraction pipeline.
//
// Currently only T-SQL -> PostgreSQL is supported. Each converter function from
// the sql-converter package handles one category of syntax transformation.
// =============================================================================

/**
 * Converts T-SQL to PostgreSQL using the standard sql-converter transform pipeline.
 *
 * This is a **pure function** with no side effects: it takes a T-SQL string and
 * returns the equivalent PostgreSQL string. The caller is responsible for
 * persisting the result (e.g., upserting a QuerySQL record).
 *
 * Transform pipeline (order matters):
 *  1. Remove N'...' prefix (Unicode string literals)
 *  2. Convert [bracket] identifiers to "double-quoted" identifiers
 *  3. Convert common T-SQL functions (ISNULL -> COALESCE, LEN -> LENGTH, etc.)
 *  4. Convert date functions (GETDATE -> NOW, DATEADD/DATEDIFF -> interval arithmetic)
 *  5. Convert CHARINDEX -> POSITION
 *  6. Convert STUFF -> OVERLAY
 *  7. Convert IIF -> CASE WHEN
 *  8. Convert CONVERT() -> CAST()
 *  9. Convert CAST type names (e.g., NVARCHAR -> VARCHAR, DATETIME -> TIMESTAMP)
 * 10. Convert TOP N -> LIMIT N
 * 11. Convert string concatenation (+ -> ||)
 * 12. Remove COLLATE clauses
 */
export function ConvertTSQLToPostgreSQL(sql: string): string {
    let result = sql;
    result = removeNPrefix(result);
    result = convertIdentifiers(result);
    result = convertCommonFunctions(result);
    result = convertDateFunctions(result);
    result = convertCharIndex(result);
    result = convertStuff(result);
    result = convertIIF(result);
    result = convertConvertFunction(result);
    result = convertCastTypes(result);
    result = convertTopToLimit(result);
    result = convertStringConcat(result);
    result = removeCollate(result);
    return result;
}
