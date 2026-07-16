import { SQLParser } from "@memberjunction/sql-parser";
import type { SQLParserDialect } from "@memberjunction/sql-dialect";
import { GetDialect } from "@memberjunction/sql-dialect";
import type { DatabasePlatform } from "@memberjunction/core";
import type { ParseResult } from "./types";

/**
 * Runs all SQLParser extraction calls in a single pass and returns a unified ParseResult.
 * Downstream pipeline stages consume this result instead of calling the parser individually.
 *
 * @param sql - The query SQL to parse
 * @param platform - The database platform to use for dialect selection (defaults to 'sqlserver')
 */
export function parseQuerySQL(sql: string, platform: DatabasePlatform = 'sqlserver'): ParseResult {
    const dialect: SQLParserDialect = GetDialect(platform);
    const analysis = SQLParser.Analyze(sql);
    const deterministicParams = SQLParser.ExtractParameterInfo(sql);
    const tableRefs = SQLParser.ExtractTableRefs(sql, dialect);
    const selectColumns = SQLParser.ExtractSelectColumns(sql, dialect);

    return { analysis, deterministicParams, tableRefs, selectColumns };
}
