import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { BaseEntity, LogError } from "@memberjunction/core";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { AIPromptEntityExtended } from '@memberjunction/core-entities';

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
            const dataFormat = this.getStringParam(params, "dataformat") || 'csv';
            const analysisRequest = this.getStringParam(params, "analysisrequest");
            const returnType = this.getStringParam(params, "returntype") ||
                (analysisRequest ? 'data and analysis' : 'data only');

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

                // Format data based on requested format
                let formattedData: string | undefined;
                if (dataFormat === 'csv') {
                    formattedData = this.formatAsCSV(results);
                } else if (dataFormat === 'json') {
                    formattedData = JSON.stringify(results, null, 2);
                }

                // Perform analysis if requested
                let analysis: string | undefined;
                if (analysisRequest && (returnType === 'analysis only' || returnType === 'data and analysis')) {
                    if (results.length === 0) {
                        // Don't call LLM for empty results - generate immediate response
                        analysis = 'Query returned no results. No data available to analyze.';
                    } else {
                        const analysisResult = await this.analyzeQueryData(
                            results,
                            columns,
                            analysisRequest,
                            params
                        );

                        if (analysisResult.success) {
                            analysis = analysisResult.analysis;
                        } else {
                            LogError(`Failed to analyze query data: ${analysisResult.error}`);
                        }
                    }
                }

                const totalExecutionTime = Date.now() - startTime;

                // Build detailed message based on return type
                const message = this.buildDetailedMessage(
                    results,
                    columns,
                    executionTimeMs,
                    totalExecutionTime,
                    wasTruncated,
                    warnings,
                    returnType,
                    formattedData,
                    analysis
                );

                // Build result object based on return type
                const resultData = {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: message,
                    Columns: columns,
                    RowCount: results.length,
                    ExecutionTimeMs: executionTimeMs,
                    TotalTimeMs: totalExecutionTime,
                    WasTruncated: wasTruncated,
                    ValidationWarnings: warnings,
                    Query: limitedQuery
                } as ActionResultSimple;

                // Add data and/or analysis to results based on returnType
                if (returnType === 'data only' || returnType === 'data and analysis') {
                    (resultData as any).Results = formattedData || results;
                }
                if (returnType === 'analysis only' || returnType === 'data and analysis') {
                    (resultData as any).Analysis = analysis;
                }

                return resultData;

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
     * Formats results as CSV string with proper escaping
     */
    private formatAsCSV(results: any[]): string {
        if (results.length === 0) return '';

        const headers = Object.keys(results[0]);
        const csvRows = [this.formatCSVRow(headers)];

        for (const row of results) {
            const values = headers.map(header => this.formatCSVValue(row[header]));
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * Formats a single CSV row (for headers)
     */
    private formatCSVRow(values: string[]): string {
        return values.map(value => this.formatCSVValue(value)).join(',');
    }

    /**
     * Formats a single CSV value with proper escaping
     * - Null/undefined values become empty strings
     * - All string values are quoted and escaped
     * - Numbers and booleans are converted to strings and quoted
     */
    private formatCSVValue(value: any): string {
        if (value == null) {
            return '""';
        }

        // Convert to string
        const stringValue = String(value);

        // Always quote and escape for maximum compatibility
        // Escape existing double quotes by doubling them
        const escaped = stringValue.replace(/"/g, '""');

        return `"${escaped}"`;
    }

    /**
     * Analyze query data using AI prompt
     */
    private async analyzeQueryData(
        results: any[],
        columns: Array<{ ColumnName: string; DataType: string; IsNullable: boolean }>,
        analysisRequest: string,
        params: RunActionParams
    ): Promise<{ success: boolean; analysis?: string; error?: string }> {
        try {
            // Ensure AIEngine is initialized
            await AIEngine.Instance.Config(false, params.ContextUser);

            // Get the analysis prompt from AIEngine
            const prompt = this.getPromptByNameAndCategory('Analyze Query Data', 'MJ: System');
            if (!prompt) {
                return {
                    success: false,
                    error: "Prompt 'Analyze Query Data' not found. Ensure metadata has been synced."
                };
            }

            // Format data as CSV for more efficient token usage
            const dataCSV = this.formatAsCSV(results);

            // Build prompt parameters with data context
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = {
                data: dataCSV,
                columns: columns,
                rowCount: results.length,
                analysisRequest: analysisRequest
            };
            promptParams.contextUser = params.ContextUser;

            // Execute the prompt
            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<{ analysis: string }>(promptParams);

            if (!result.success) {
                return {
                    success: false,
                    error: result.errorMessage || "Prompt execution failed"
                };
            }

            return {
                success: true,
                analysis: result.result?.analysis || String(result.result)
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get prompt by name and category from AIEngine
     */
    private getPromptByNameAndCategory(name: string, category: string): AIPromptEntityExtended | undefined {
        return AIEngine.Instance.Prompts.find(p =>
            p.Name.trim().toLowerCase() === name.trim().toLowerCase() &&
            p.Category?.trim().toLowerCase() === category?.trim().toLowerCase()
        );
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
        warnings: string[],
        returnType: string,
        formattedData?: string,
        analysis?: string
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

        // Analysis section (if applicable)
        if (analysis && (returnType === 'analysis only' || returnType === 'data and analysis')) {
            lines.push(`## Analysis\n`);
            lines.push(analysis);
            lines.push('');
        }

        // Results Data (if applicable)
        if (returnType === 'data only' || returnType === 'data and analysis') {
            if (results.length > 0) {
                lines.push(`## Data (${results.length} row${results.length !== 1 ? 's' : ''})\n`);
                if (formattedData) {
                    lines.push('```');
                    lines.push(formattedData);
                    lines.push('```');
                } else {
                    lines.push('```json');
                    lines.push(JSON.stringify(results, null, 2));
                    lines.push('```');
                }
            } else {
                lines.push(`## Data\n*No rows returned*`);
            }
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
