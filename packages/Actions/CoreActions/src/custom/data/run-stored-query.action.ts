import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunQuery, RunQueryParams, RunQueryResult } from "@memberjunction/core";

/**
 * The output parameters this action declares in `metadata/actions/.run-stored-query.json`. A Flow
 * step's ActionOutputMapping copies only declared Output params into the payload, so the rows and
 * counts have to be here, not only in the Message and the returned object (the engine drops the
 * object's extra fields).
 */
const OUTPUT_PARAM_NAMES = new Set(
    ['Results', 'RowCount', 'TotalRowCount', 'WasTruncated', 'ExecutionTimeMs', 'QuerySQL']
        .map(name => name.toLowerCase())
);

/**
 * Action that executes a stored query by ID or name using the full query pipeline.
 * This includes composition resolution ({{query:"..."}} macros), Nunjucks parameter
 * templating, caching, and audit logging — the agent gets all of that for free.
 *
 * Preferred over Run Ad-hoc Query when a matching saved query exists because:
 * - Saved queries are pre-validated and optimized
 * - Composition enables reuse of business logic across queries
 * - Caching and audit logging are automatic
 * - No risk of schema errors from writing ad-hoc SQL
 */
@RegisterClass(BaseAction, "Run Stored Query")
export class RunStoredQueryAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Outputs are set only on success. Clearing first means a params array reused from an
        // earlier run can never hand a failed run's caller that run's rows.
        this.clearOutputs(params);

        try {
            const queryId = this.getStringParam(params, "queryid");
            const queryName = this.getStringParam(params, "queryname");
            const parametersRaw = this.getStringParam(params, "parameters");
            const maxRows = this.getNumericParam(params, "maxrows", 1000);
            const dataFormat = this.getStringParam(params, "dataformat") || 'csv';
            const columnMaxLength = this.getNumericParam(params, "columnmaxlength", 50);

            if (!queryId && !queryName) {
                return {
                    Success: false,
                    ResultCode: "MISSING_IDENTIFIER",
                    Message: "Either QueryID or QueryName is required to run a stored query."
                } as ActionResultSimple;
            }

            // Parse parameters JSON if provided
            const queryParameters = this.parseParameters(parametersRaw);

            // Build RunQueryParams
            const runParams: RunQueryParams = {
                MaxRows: maxRows
            };
            if (queryId) {
                runParams.QueryID = queryId;
            }
            if (queryName) {
                runParams.QueryName = queryName;
            }
            if (queryParameters) {
                runParams.Parameters = queryParameters;
            }

            // Execute via RunQuery — this invokes the full pipeline:
            // composition resolution → Nunjucks templating → cache check → SQL execution → audit log
            const rq = new RunQuery();
            const result: RunQueryResult = await rq.RunQuery(runParams, params.ContextUser);

            if (!result.Success) {
                const errorMsg = result.ErrorMessage || 'Query execution failed';
                // Distinguish between "not found" and other failures
                if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('does not exist')) {
                    return {
                        Success: false,
                        ResultCode: "QUERY_NOT_FOUND",
                        Message: errorMsg
                    } as ActionResultSimple;
                }
                return {
                    Success: false,
                    ResultCode: "QUERY_EXECUTION_FAILED",
                    Message: errorMsg
                } as ActionResultSimple;
            }

            const results = result.Results || [];
            const executionTimeMs = result.ExecutionTime || 0;

            // Format output
            const formattedData = this.formatResults(results, dataFormat, columnMaxLength);
            const message = this.buildMessage(results, executionTimeMs, maxRows, formattedData, result);

            const resultData: ActionResultSimple & Record<string, unknown> = {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                RowCount: results.length,
                ExecutionTimeMs: executionTimeMs,
                Results: formattedData
            };

            this.setSuccessOutputs(params, results, executionTimeMs, result);

            return resultData;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "QUERY_EXECUTION_FAILED",
                Message: `Run Stored Query failed: ${errorMessage}`
            } as ActionResultSimple;
        }
    }

    /**
     * Removes any of this action's output params already on the array, in place: the engine and its
     * callers may hold a reference to `params.Params`.
     */
    private clearOutputs(params: RunActionParams): void {
        for (let i = params.Params.length - 1; i >= 0; i--) {
            const param = params.Params[i];
            if (param.Type === 'Output' && OUTPUT_PARAM_NAMES.has(param.Name.trim().toLowerCase())) {
                params.Params.splice(i, 1);
            }
        }
    }

    /**
     * Publishes a successful run as output parameters. `Results` carries the full, untrimmed rows:
     * DataFormat and ColumnMaxLength shape the copy in the Message for a model to read, not data a
     * Flow passes on.
     *
     * With MaxRows set, RunQuery counts the whole result alongside the capped page, so
     * `TotalRowCount` is the real total and `WasTruncated` is exact. A total below the rows actually
     * returned cannot be right, so it falls back to the row count rather than report a negative gap.
     */
    private setSuccessOutputs(
        params: RunActionParams,
        rows: Record<string, unknown>[],
        executionTimeMs: number,
        queryResult: RunQueryResult
    ): void {
        const reportedTotal = queryResult.TotalRowCount;
        const totalRowCount = Number.isFinite(reportedTotal) && reportedTotal >= rows.length ? reportedTotal : rows.length;
        const set = (name: string, value: unknown): void => {
            params.Params.push({ Name: name, Type: 'Output', Value: value });
        };
        set('Results', [...rows]);
        set('RowCount', rows.length);
        set('TotalRowCount', totalRowCount);
        set('WasTruncated', totalRowCount > rows.length);
        set('ExecutionTimeMs', executionTimeMs);
        if (queryResult.RenderedSQL) {
            set('QuerySQL', queryResult.RenderedSQL);
        }
    }

    /**
     * Parse parameters from JSON string or return as-is if already an object.
     */
    private parseParameters(raw: string | undefined): Record<string, string> | undefined {
        if (!raw) return undefined;
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed as Record<string, string>;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Format results as CSV or JSON based on requested format.
     */
    private formatResults(
        results: Record<string, unknown>[],
        dataFormat: string,
        columnMaxLength: number
    ): string {
        if (results.length === 0) return '';

        if (dataFormat === 'csv') {
            return this.formatAsCSV(results, columnMaxLength);
        }

        const trimmed = columnMaxLength > 0 ? this.trimColumns(results, columnMaxLength) : results;
        return JSON.stringify(trimmed, null, 2);
    }

    /**
     * Format results as CSV with proper escaping and optional column trimming.
     */
    private formatAsCSV(results: Record<string, unknown>[], columnMaxLength: number): string {
        if (results.length === 0) return '';

        const headers = Object.keys(results[0]);
        const csvRows = [headers.map(h => this.escapeCSV(h)).join(',')];

        for (const row of results) {
            const values = headers.map(header => {
                let value = row[header];
                if (columnMaxLength > 0 && value != null) {
                    const str = String(value);
                    if (str.length > columnMaxLength) {
                        value = str.substring(0, columnMaxLength) + '...';
                    }
                }
                return this.escapeCSV(value);
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * Escape a single value for CSV output.
     */
    private escapeCSV(value: unknown): string {
        if (value == null) return '""';
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
    }

    /**
     * Trim string columns to max length.
     */
    private trimColumns(results: Record<string, unknown>[], maxLength: number): Record<string, unknown>[] {
        return results.map(row => {
            const trimmed: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row)) {
                if (value != null && typeof value === 'string' && value.length > maxLength) {
                    trimmed[key] = value.substring(0, maxLength) + '...';
                } else {
                    trimmed[key] = value;
                }
            }
            return trimmed;
        });
    }

    /**
     * Build a detailed message summarizing query results.
     */
    private buildMessage(
        results: Record<string, unknown>[],
        executionTimeMs: number,
        maxRows: number,
        formattedData: string,
        queryResult: RunQueryResult
    ): string {
        const lines: string[] = [];
        lines.push('# Stored Query Results');
        lines.push(`\n**Rows Returned:** ${results.length.toLocaleString()}`);
        if (queryResult.TotalRowCount != null && queryResult.TotalRowCount > results.length) {
            lines.push(`**Total Available:** ${queryResult.TotalRowCount.toLocaleString()}`);
        }
        lines.push(`**Execution Time:** ${executionTimeMs}ms`);

        if (results.length >= maxRows) {
            lines.push(`**Note:** Results may have been truncated at ${maxRows} rows`);
        }

        if (queryResult.CacheHit) {
            lines.push(`**Cache Hit:** Yes (TTL remaining: ${queryResult.CacheTTLRemaining}ms)`);
        }

        lines.push('\n---\n');

        if (results.length > 0) {
            lines.push(`## Data (${results.length} row${results.length !== 1 ? 's' : ''})\n`);
            lines.push('```');
            lines.push(formattedData);
            lines.push('```');
        } else {
            lines.push('## Data\n*No rows returned*');
        }

        lines.push('\n---');
        lines.push('\n**The full result set is available in the Results output parameter.**');

        return lines.join('\n');
    }

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        return param?.Value ? String(param.Value) : undefined;
    }

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
}
