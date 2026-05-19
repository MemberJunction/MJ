import { SQLParser } from "@memberjunction/sql-parser";
import type { SQLParserDialect } from "@memberjunction/sql-dialect";
import { SQLServerDialect } from "@memberjunction/sql-dialect";
import type { ParseResult } from "./types";

/** Default dialect for the extraction pipeline (primary SQL is T-SQL) */
const defaultDialect = new SQLServerDialect();

/**
 * Runs all SQLParser extraction calls in a single pass and returns a unified ParseResult.
 * Downstream pipeline stages consume this result instead of calling the parser individually.
 *
 * @param sql - The query SQL to parse
 * @param dialect - SQL dialect (defaults to T-SQL for backward compatibility)
 */
export function parseQuerySQL(sql: string, dialect: SQLParserDialect = defaultDialect): ParseResult {
    const analysis = SQLParser.Analyze(sql);
    const deterministicParams = SQLParser.ExtractParameterInfo(sql);
    const tableRefs = SQLParser.ExtractTableRefs(sql);
    const selectColumns = SQLParser.ExtractSelectColumns(sql, dialect);

    return { analysis, deterministicParams, tableRefs, selectColumns };
}
