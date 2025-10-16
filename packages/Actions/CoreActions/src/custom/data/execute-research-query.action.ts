import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { BaseEntity } from "@memberjunction/core";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";

/**
 * Action that executes read-only SQL SELECT queries for research purposes with
 * security validation.
 *
 * Security Features:
 * - SELECT-only enforcement (rejects INSERT, UPDATE, DELETE, DROP, etc.)
 * - Dangerous operation detection (EXEC, xp_, sp_, dynamic SQL, etc.)
 * - Query timeout protection
 * - Audit logging of all queries
 * - Result size limiting
 *
 * Performance Features:
 * - Configurable row limits to prevent overwhelming results
 * - Execution time tracking
 * - Validation warnings for potentially slow queries
 *
 * Note: SQL syntax validation is handled by SQL Server during execution.
 * This provides more accurate error messages than a JavaScript parser.
 *
 * @example
 * ```typescript
 * // Simple SELECT query
 * await runAction({
 *   ActionName: 'Execute Research Query',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'SELECT TOP 100 * FROM Customers WHERE Country = ''USA'''
 *   }]
 * });
 *
 * // Query with timeout
 * await runAction({
 *   ActionName: 'Execute Research Query',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'SELECT COUNT(*) FROM Orders GROUP BY CustomerID'
 *   }, {
 *     Name: 'Timeout',
 *     Value: 60
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Execute Research Query")
export class ExecuteResearchQueryAction extends BaseAction {

    /**
     * List of dangerous SQL keywords and patterns that should be blocked
     */
    private readonly DANGEROUS_PATTERNS = [
        /\bEXEC\b/i,
        /\bEXECUTE\b/i,
        /\bsp_/i,
        /\bxp_/i,
        /\bOPENROWSET\b/i,
        /\bOPENQUERY\b/i,
        /\bOPENDATASOURCE\b/i,
        /\bINSERT\b/i,
        /\bUPDATE\b/i,
        /\bDELETE\b/i,
        /\bDROP\b/i,
        /\bCREATE\b/i,
        /\bALTER\b/i,
        /\bTRUNCATE\b/i,
        /\bGRANT\b/i,
        /\bREVOKE\b/i,
        /\bDENY\b/i,
        /\bBACKUP\b/i,
        /\bRESTORE\b/i,
        /\bSHUTDOWN\b/i,
        /\bDBCC\b/i,
        /--\+/,  // SQL hints
        /\/\*\+/  // Oracle-style hints
    ];

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const startTime = Date.now();

        try {
            // Extract parameters
            const query = this.getStringParam(params, "query");
            if (!query) {
                return {
                    Success: false,
                    ResultCode: "MISSING_QUERY",
                    Message: "Query parameter is required"
                } as ActionResultSimple;
            }

            const maxRows = this.getNumericParam(params, "maxrows", 1000);
            const timeout = this.getNumericParam(params, "timeout", 30);
            const resultFormat = this.getStringParam(params, "resultformat") || 'json';

            // Validate query security
            const securityValidation = this.validateQuerySecurity(query);
            if (!securityValidation.isValid) {
                return {
                    Success: false,
                    ResultCode: securityValidation.resultCode!,
                    Message: securityValidation.message!
                } as ActionResultSimple;
            }

            // Ensure query returns limited results
            const limitedQuery = this.ensureRowLimit(query, maxRows);

            const dataProvider = BaseEntity.Provider as SQLServerDataProvider;

            try {
                // Execute the query with timeout
                const queryStartTime = Date.now();

                const results = await Promise.race([
                    dataProvider.ExecuteSQL(limitedQuery, null, {
                        description: 'Execute Research Query',
                        ignoreLogging: false,
                        isMutation: false
                    }, params.ContextUser),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Query timeout exceeded')), timeout * 1000)
                    )
                ]) as any;

                const executionTimeMs = Date.now() - queryStartTime;

                // Get column metadata
                const columns = results && results.columns
                    ? Object.entries(results.columns).map(([name, col]: [string, any]) => ({
                        ColumnName: name,
                        DataType: col.type?.name || 'unknown',
                        IsNullable: col.nullable !== false
                    }))
                    : [];

                const wasTruncated = results.length >= maxRows;

                // Generate validation warnings
                const warnings = this.generateValidationWarnings(query, results.length, executionTimeMs);

                // Format results based on requested format
                let formattedResults: any = results;
                if (resultFormat === 'csv') {
                    formattedResults = this.formatAsCSV(results);
                } else if (resultFormat === 'table') {
                    formattedResults = this.formatAsTable(results);
                }

                const totalExecutionTime = Date.now() - startTime;

                // Build detailed message with actual results
                const message = this.buildDetailedMessage(
                    results,
                    columns,
                    executionTimeMs,
                    totalExecutionTime,
                    wasTruncated,
                    warnings
                );

                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: message,
                    Results: formattedResults,
                    Columns: columns,
                    RowCount: results.length,
                    ExecutionTimeMs: executionTimeMs,
                    TotalTimeMs: totalExecutionTime,
                    WasTruncated: wasTruncated,
                    ValidationWarnings: warnings,
                    Query: limitedQuery
                } as ActionResultSimple;

            } catch (queryError: any) {
                // Handle query timeout
                if (queryError.message && queryError.message.includes('timeout')) {
                    return {
                        Success: false,
                        ResultCode: "QUERY_TIMEOUT",
                        Message: `Query execution exceeded ${timeout} second timeout. Consider optimizing query or increasing timeout parameter.`
                    } as ActionResultSimple;
                }

                // Handle permission errors
                if (queryError.message &&
                    (queryError.message.toLowerCase().includes('permission') ||
                     queryError.message.toLowerCase().includes('denied'))) {
                    return {
                        Success: false,
                        ResultCode: "PERMISSION_DENIED",
                        Message: `Insufficient permissions to execute query: ${queryError.message}`
                    } as ActionResultSimple;
                }

                // Handle other database errors
                return {
                    Success: false,
                    ResultCode: "DATABASE_ERROR",
                    Message: `Database error occurred: ${queryError.message || String(queryError)}`
                } as ActionResultSimple;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "QUERY_EXECUTION_FAILED",
                Message: `Query execution failed: ${errorMessage}`
            } as ActionResultSimple;
        }
    }

    /**
     * Validates query for security concerns
     */
    private validateQuerySecurity(query: string): { isValid: boolean; message?: string; resultCode?: string } {
        // Check for dangerous patterns
        for (const pattern of this.DANGEROUS_PATTERNS) {
            if (pattern.test(query)) {
                return {
                    isValid: false,
                    message: `Query contains potentially dangerous operation: ${pattern.source}. Only SELECT queries are allowed.`,
                    resultCode: 'DANGEROUS_QUERY'
                };
            }
        }

        // Check if query starts with SELECT (allowing for whitespace and comments)
        const trimmedQuery = query.trim();
        const cleanQuery = trimmedQuery.replace(/^\/\*[\s\S]*?\*\//, '').replace(/^--.*$/gm, '').trim();

        if (!cleanQuery.toUpperCase().startsWith('SELECT') &&
            !cleanQuery.toUpperCase().startsWith('WITH')) {  // Allow CTEs
            return {
                isValid: false,
                message: 'Only SELECT queries are allowed. Query must start with SELECT or WITH (for Common Table Expressions).',
                resultCode: 'NOT_SELECT_STATEMENT'
            };
        }

        return { isValid: true };
    }

    /**
     * Ensures query has a row limit to prevent overwhelming results
     */
    private ensureRowLimit(query: string, maxRows: number): string {
        // Check if query already has TOP clause
        const hasTop = /SELECT\s+TOP\s+\d+/i.test(query);
        if (hasTop) {
            return query;
        }

        // Check if query has OFFSET-FETCH (SQL Server 2012+)
        const hasOffsetFetch = /OFFSET\s+\d+\s+ROWS\s+FETCH/i.test(query);
        if (hasOffsetFetch) {
            return query;
        }

        // Add TOP clause
        return query.replace(/^(\s*SELECT\s+)/i, `$1TOP ${maxRows} `);
    }

    /**
     * Generates validation warnings for potentially problematic queries
     */
    private generateValidationWarnings(query: string, rowCount: number, executionTimeMs: number): string[] {
        const warnings: string[] = [];

        // Warn about slow queries
        if (executionTimeMs > 5000) {
            warnings.push(`Query took ${executionTimeMs}ms to execute. Consider adding indexes or optimizing query.`);
        }

        // Warn about SELECT *
        if (/SELECT\s+\*/i.test(query)) {
            warnings.push('Query uses SELECT *. Specifying explicit columns improves performance and clarity.');
        }

        // Warn about missing WHERE clause on large result sets
        if (rowCount > 100 && !/WHERE/i.test(query)) {
            warnings.push('Query returned many rows without WHERE clause. Consider adding filters for better performance.');
        }

        // Warn about potential Cartesian products
        const fromCount = (query.match(/FROM/gi) || []).length;
        const joinCount = (query.match(/JOIN/gi) || []).length;
        const whereCount = (query.match(/WHERE/gi) || []).length;

        if (fromCount > 1 && joinCount === 0 && whereCount === 0) {
            warnings.push('Query may contain Cartesian product (multiple tables without JOIN or WHERE). This can be very slow.');
        }

        return warnings;
    }

    /**
     * Formats results as CSV string
     */
    private formatAsCSV(results: any[]): string {
        if (results.length === 0) return '';

        const headers = Object.keys(results[0]);
        const csvRows = [headers.join(',')];

        for (const row of results) {
            const values = headers.map(header => {
                const value = row[header];
                if (value == null) return '';
                // Escape quotes and wrap in quotes if contains comma or quote
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * Formats results as ASCII table
     */
    private formatAsTable(results: any[]): string {
        if (results.length === 0) return 'No results';

        const headers = Object.keys(results[0]);

        // Calculate column widths
        const widths = headers.map(header => {
            const valueWidths = results.map(row => String(row[header] ?? '').length);
            return Math.max(header.length, ...valueWidths, 3);
        });

        // Build separator
        const separator = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';

        // Build header row
        const headerRow = '|' + headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join('|') + '|';

        // Build data rows
        const dataRows = results.map(row => {
            return '|' + headers.map((h, i) => {
                const value = String(row[h] ?? '').substring(0, widths[i]);
                return ` ${value.padEnd(widths[i])} `;
            }).join('|') + '|';
        });

        return [separator, headerRow, separator, ...dataRows, separator].join('\n');
    }

    /**
     * Helper to get string parameter value
     */
    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        return param?.Value ? String(param.Value) : undefined;
    }

    /**
     * Helper to get numeric parameter value
     */
    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        if (param?.Value != null) {
            const num = Number(param.Value);
            return isNaN(num) ? defaultValue : num;
        }
        return defaultValue;
    }

    /**
     * Build detailed message with query results for agent consumption
     */
    private buildDetailedMessage(
        results: any[],
        columns: Array<{ ColumnName: string; DataType: string; IsNullable: boolean }>,
        executionTimeMs: number,
        totalTimeMs: number,
        wasTruncated: boolean,
        warnings: string[]
    ): string {
        const lines: string[] = [];

        // Header
        lines.push(`# Query Results`);
        lines.push(`\n**Rows Returned:** ${results.length.toLocaleString()}`);
        lines.push(`**Execution Time:** ${executionTimeMs}ms`);
        lines.push(`**Total Time:** ${totalTimeMs}ms`);

        if (wasTruncated) {
            lines.push(`**Note:** Results were truncated to maximum row limit`);
        }

        lines.push(`\n---\n`);

        // Columns
        if (columns.length > 0) {
            lines.push(`## Columns (${columns.length})\n`);
            for (const col of columns) {
                const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
                lines.push(`- **${col.ColumnName}** \`${col.DataType}\` [${nullable}]`);
            }
            lines.push('');
        }

        // Warnings
        if (warnings.length > 0) {
            lines.push(`## Warnings\n`);
            for (const warning of warnings) {
                lines.push(`⚠️ ${warning}`);
            }
            lines.push('');
        }

        // Results Data
        if (results.length > 0) {
            lines.push(`## Data (${results.length} row${results.length !== 1 ? 's' : ''})\n`);
            lines.push('```json');
            lines.push(JSON.stringify(results, null, 2));
            lines.push('```');
        } else {
            lines.push(`## Data\n*No rows returned*`);
        }

        lines.push(`\n---`);
        lines.push(`\n**The full result set is available in the Results output parameter for further processing.**`);

        return lines.join('\n');
    }

}

/**
 * Load function to ensure the class is registered and not tree-shaken
 */
export function LoadExecuteResearchQueryAction() {
    MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, "Execute Research Query");
}
