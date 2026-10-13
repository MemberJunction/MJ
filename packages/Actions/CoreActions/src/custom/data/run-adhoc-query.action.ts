import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, SQLExpressionValidator } from "@memberjunction/global";
import { ActionEngineServer, BaseAction } from "@memberjunction/actions";
import { LogError, type UserInfo } from "@memberjunction/core";
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Action that executes read-only SQL SELECT queries for research purposes with
 * security validation.
 *
 * Security — the same gates as the ExecuteAdhocQuery resolver:
 * - Scope-limited sessions (magic-link and widget guests, resource-scoped links) are refused: raw SQL
 *   never applies the row-level filters that confine them.
 * - The SQL runs only on the host's read-only database login
 *   ({@link ActionEngineServer.GetReadOnlyProvider}), never on the read-write pool; with no read-only
 *   login configured the action refuses.
 * - The host's ad-hoc SQL checks ({@link ActionEngineServer.AdhocSQLAuthorizer}) must accept the SQL:
 *   MJServer registers ExecuteAdhocQuery's own check, so the SQL must be one read statement and every
 *   table it reads an entity view the caller may read in full. The host also limits the timeout.
 * - It runs through the provider's ad-hoc read path (`RunQuery` with `SQL`), which accepts one read
 *   statement only, refuses functions that read outside the query, and enforces the timeout and row
 *   limit in the database.
 * - The dangerous-keyword screen (SQLExpressionValidator) runs first.
 *
 * Performance Features:
 * - Configurable row limits to prevent overwhelming results
 * - Execution time tracking
 * - Validation warnings for potentially slow queries
 *
 * @example
 * ```typescript
 * // Simple SELECT query
 * await runAction({
 *   ActionName: 'Run Ad-hoc Query',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'SELECT TOP 100 * FROM Customers WHERE Country = ''USA'''
 *   }]
 * });
 *
 * // Query with timeout
 * await runAction({
 *   ActionName: 'Run Ad-hoc Query',
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
@RegisterClass(BaseAction, "Run Ad-hoc Query")
export class RunAdhocQueryAction extends BaseAction {

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

            // Raw SQL never applies the row-level filters that confine a scope-limited session, so
            // there is no narrower read to fall back to, only refusal.
            if (this.isScopeLimitedPrincipal(params.ContextUser)) {
                return this.permissionDenied('Run Ad-hoc Query is not permitted for scope-limited sessions.');
            }
            const authorizer = ActionEngineServer.Instance.AdhocSQLAuthorizer;
            if (!authorizer) {
                return this.permissionDenied('Ad-hoc query execution is not configured on this server: no ad-hoc SQL authorizer is registered.');
            }
            const readOnlyProvider = await ActionEngineServer.Instance.GetReadOnlyProvider();
            if (!readOnlyProvider) {
                return this.permissionDenied('No read-only data source is available for ad-hoc query execution: the read-only database login is not configured on this server.');
            }

            const maxRows = this.positiveOrDefault(this.getNumericParam(params, "maxrows", 1000), 1000);
            const requestedTimeout = this.getNumericParam(params, "timeout", 0);
            const timeout = authorizer.ClampTimeoutSeconds(requestedTimeout > 0 ? requestedTimeout : undefined);
            const dataFormat = this.getStringParam(params, "dataformat") || 'csv';
            const analysisRequest = this.getStringParam(params, "analysisrequest");
            const returnType = this.getStringParam(params, "returntype") ||
                (analysisRequest ? 'data and analysis' : 'data only');
            const columnMaxLength = this.getNumericParam(params, "columnmaxlength", 50); // Default: 50 chars, 0 = no limit

            // Normalize literal escape sequences — agent-generated SQL may have
            // literal \n instead of real newlines from double-escaped JSON
            const normalizedQuery = this.normalizeSQLWhitespace(query);

            // Validate query security using centralized SQLExpressionValidator
            const validator = SQLExpressionValidator.Instance;
            const securityValidation = validator.validateFullQuery(normalizedQuery);
            if (!securityValidation.valid) {
                return {
                    Success: false,
                    ResultCode: 'DANGEROUS_QUERY',
                    Message: securityValidation.error || 'SQL validation failed'
                } as ActionResultSimple;
            }

            // The host's checks for caller SQL, on the SQL as it will run.
            const refusal = authorizer.Authorize(normalizedQuery, readOnlyProvider, params.ContextUser);
            if (refusal) {
                return this.authorizationRefusal(refusal);
            }

            try {
                // Execute on the read-only login through the provider's ad-hoc read path, which renders
                // the SQL, requires a single read statement, and applies the row limit and timeout in
                // the database.
                const queryStartTime = Date.now();

                const queryResult = await readOnlyProvider.RunQuery({
                    SQL: normalizedQuery,
                    MaxRows: maxRows,
                    TimeoutSeconds: timeout
                }, params.ContextUser);
                if (!queryResult.Success) {
                    return this.queryFailure(queryResult.ErrorMessage, timeout);
                }
                const results = queryResult.Results;

                const executionTimeMs = Date.now() - queryStartTime;

                // Get column metadata
                const columns = this.describeColumns(results);

                const wasTruncated = queryResult.TotalRowCount > results.length || results.length >= maxRows;

                // Generate validation warnings
                const warnings = this.generateValidationWarnings(query, results.length, executionTimeMs);

                // Format data based on requested format
                let formattedData: string | undefined;
                if (dataFormat === 'csv') {
                    formattedData = this.formatAsCSV(results, columnMaxLength);
                } else if (dataFormat === 'json') {
                    const trimmedResults = columnMaxLength > 0
                        ? this.trimResultColumns(results, columnMaxLength)
                        : results;
                    formattedData = JSON.stringify(trimmedResults, null, 2);
                }

                // Perform analysis if requested
                let analysis: string | undefined;
                let analysisError: string | undefined;
                if (analysisRequest && (returnType === 'analysis only' || returnType === 'data and analysis')) {
                    if (results.length === 0) {
                        // Don't call LLM for empty results - generate immediate response
                        analysis = 'Query returned no results. No data available to analyze.';
                    } else {
                        const analysisResult = await this.analyzeQueryData(
                            results,
                            columns,
                            analysisRequest,
                            params,
                            columnMaxLength
                        );

                        if (analysisResult.success) {
                            analysis = analysisResult.analysis;
                        } else {
                            analysisError = analysisResult.error || 'the analysis prompt returned no result';
                            LogError(`Failed to analyze query data: ${analysisError}`);
                        }
                    }
                }

                const totalExecutionTime = Date.now() - startTime;

                // The analysis was the whole answer, so its failure is the action's. (It fails by design
                // under a 'RuntimeOnly' credential scope, which this action cannot satisfy.) There is no
                // declared result code for it: the engine records none, and Success/Message carry it.
                if (analysisError && returnType === 'analysis only') {
                    return {
                        Success: false,
                        ResultCode: "ANALYSIS_FAILED",
                        Message: `The query ran and returned ${results.length} row(s), but the analysis could not be produced: ${analysisError}`
                    };
                }

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
                    Query: normalizedQuery
                } as ActionResultSimple;

                // Add data and/or analysis to results based on returnType
                if (returnType === 'data only' || returnType === 'data and analysis') {
                    (resultData as any).Results = formattedData || results;
                }
                if (returnType === 'analysis only' || returnType === 'data and analysis') {
                    (resultData as any).Analysis = analysis;
                }
                // The data still stands; say why there is no analysis instead of leaving it silently empty.
                if (analysisError) {
                    const withError = resultData as ActionResultSimple & { AnalysisError?: string };
                    withError.AnalysisError = analysisError;
                    withError.Message = `${withError.Message}\n\nThe analysis could not be produced: ${analysisError}`;
                }

                return resultData;

            } catch (queryError) {
                return this.queryFailure(queryError instanceof Error ? queryError.message : String(queryError), timeout);
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
     * True when the session's read authority is narrower than its roles: an anonymous magic-link or
     * widget guest, or a session pinned to one shared resource. The same test as MJServer's
     * `IsScopeLimitedPrincipal`; a missing user fails closed.
     */
    private isScopeLimitedPrincipal(user: UserInfo | undefined): boolean {
        if (!user) {
            return true;
        }
        if (user.IsMagicLinkAnonymous) {
            return true;
        }
        const scope = user.MagicLinkScope;
        return !!(scope?.ResourceID || scope?.ResourceType);
    }

    private permissionDenied(message: string): ActionResultSimple {
        return { Success: false, ResultCode: 'PERMISSION_DENIED', Message: message };
    }

    /** The value when it is a positive number, else the default. */
    private positiveOrDefault(value: number, defaultValue: number): number {
        return Number.isFinite(value) && value > 0 ? value : defaultValue;
    }

    /** Maps the host's refusal of the SQL to the action's result codes. */
    private authorizationRefusal(message: string): ActionResultSimple {
        const statementCode = this.statementRefusalCode(message);
        return statementCode
            ? { Success: false, ResultCode: statementCode, Message: message }
            : { Success: false, ResultCode: "PERMISSION_DENIED", Message: `Not permitted to run this query: ${message}` };
    }

    /** The result code for SQL refused for its shape or for a function it calls; null for any other refusal. */
    private statementRefusalCode(message: string): 'NOT_SELECT_STATEMENT' | 'DANGEROUS_QUERY' | null {
        if (/single read query|read-only statement|write statement|write\/DDL|multiple statements/i.test(message)) {
            return "NOT_SELECT_STATEMENT";
        }
        return /may not call/i.test(message) ? "DANGEROUS_QUERY" : null;
    }

    /** Maps a failed run to the action's result codes. */
    private queryFailure(errorMessage: string, timeoutSeconds: number): ActionResultSimple {
        if (/time(d)?\s?out/i.test(errorMessage)) {
            return {
                Success: false,
                ResultCode: "QUERY_TIMEOUT",
                Message: `Query execution exceeded ${timeoutSeconds} second timeout. Consider optimizing query or increasing timeout parameter.`
            };
        }
        const statementCode = this.statementRefusalCode(errorMessage);
        if (statementCode) {
            return { Success: false, ResultCode: statementCode, Message: errorMessage };
        }
        if (/permission|denied/i.test(errorMessage)) {
            return { Success: false, ResultCode: "PERMISSION_DENIED", Message: `Insufficient permissions to execute query: ${errorMessage}` };
        }
        return { Success: false, ResultCode: "DATABASE_ERROR", Message: `Database error occurred: ${errorMessage}` };
    }

    /** Column names and value types, read from the returned rows. */
    private describeColumns(rows: Record<string, unknown>[]): Array<{ ColumnName: string; DataType: string; IsNullable: boolean }> {
        if (rows.length === 0) {
            return [];
        }
        return Object.keys(rows[0]).map(name => ({
            ColumnName: name,
            DataType: this.describeValueType(rows.find(row => row[name] != null)?.[name]),
            IsNullable: rows.some(row => row[name] == null)
        }));
    }

    private describeValueType(value: unknown): string {
        if (value === null || value === undefined) {
            return 'unknown';
        }
        return value instanceof Date ? 'datetime' : typeof value;
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
     * @param results Array of result objects
     * @param columnMaxLength Optional maximum length for column values (0 = no limit)
     */
    private formatAsCSV(results: any[], columnMaxLength: number = 0): string {
        if (results.length === 0) return '';

        const headers = Object.keys(results[0]);
        const csvRows = [this.formatCSVRow(headers)];

        for (const row of results) {
            const values = headers.map(header => {
                let value = row[header];
                // Apply column length limit if specified
                if (columnMaxLength > 0 && value != null) {
                    const stringValue = String(value);
                    if (stringValue.length > columnMaxLength) {
                        value = stringValue.substring(0, columnMaxLength) + '...';
                    }
                }
                return this.formatCSVValue(value);
            });
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
     * Trims columns in result set to maximum length
     * Used for JSON format results to prevent verbose fields from overwhelming context
     * @param results Array of result objects
     * @param maxLength Maximum length for string values
     * @returns New array with trimmed values
     */
    private trimResultColumns(results: any[], maxLength: number): any[] {
        return results.map(row => {
            const trimmedRow: any = {};
            for (const [key, value] of Object.entries(row)) {
                if (value != null && typeof value === 'string' && value.length > maxLength) {
                    trimmedRow[key] = value.substring(0, maxLength) + '...';
                } else {
                    trimmedRow[key] = value;
                }
            }
            return trimmedRow;
        });
    }

    /**
     * Analyze query data using AI prompt
     */
    private async analyzeQueryData(
        results: any[],
        columns: Array<{ ColumnName: string; DataType: string; IsNullable: boolean }>,
        analysisRequest: string,
        params: RunActionParams,
        columnMaxLength: number = 0
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
            // Apply column max length to trim verbose fields
            const dataCSV = this.formatAsCSV(results, columnMaxLength);

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
            // The calling run's credential scope. This action is never handed the run's keys, so under
            // 'RuntimeOnly' the prompt finds no usable model and fails instead of spending the platform's.
            promptParams.CredentialScope = params.CredentialScope;

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
    private getPromptByNameAndCategory(name: string, category: string): MJAIPromptEntityExtended | undefined {
        return AIEngine.Instance.Prompts.find(p =>
            p.Name.trim().toLowerCase() === name.trim().toLowerCase() &&
            p.Category?.trim().toLowerCase() === category?.trim().toLowerCase()
        );
    }

    /**
     * Normalize literal escape sequences in SQL strings.
     * Agent-generated SQL sometimes arrives with literal \n (backslash + n)
     * instead of actual newlines from double-escaped JSON.
     */
    private normalizeSQLWhitespace(sql: string): string {
        return sql
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t');
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