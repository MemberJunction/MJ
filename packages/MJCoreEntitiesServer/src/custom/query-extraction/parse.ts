import { SQLParser } from "@memberjunction/sql-parser";
import type { ParseResult } from "./types";

/**
 * Runs all SQLParser extraction calls in a single pass and returns a unified ParseResult.
 * Downstream pipeline stages consume this result instead of calling the parser individually.
 */
export function parseQuerySQL(sql: string): ParseResult {
    const analysis = SQLParser.Analyze(sql);
    const deterministicParams = SQLParser.ExtractParameterInfo(sql);
    const tableRefs = SQLParser.ExtractTableRefs(sql);
    const selectColumns = SQLParser.ExtractSelectColumns(sql);

    return { analysis, deterministicParams, tableRefs, selectColumns };
}
