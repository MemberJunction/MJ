/**
 * @fileoverview Excel Custom Functions (`=MJ.QUERY(...)` and `=MJ.VIEW(...)`) for `@memberjunction/excel-addin`
 * (`plans/docs-slides-sheets.md § 7.1, § 7.2, § 9 Wave 3, O8`).
 *
 * Provides:
 * - Office `functions.json` metadata descriptor generation (`BuildExcelCustomFunctionsMetadata`)
 * - Positional and `key=value` argument parsing for `=MJ.QUERY(queryNameOrId, ...params)` and
 *   `=MJ.VIEW(entityName, viewNameOrId?, includeHeaders?)`
 * - Viewer-scoped 60-second TTL result cache and bounded concurrency (max 5 simultaneous requests)
 * - 2D dynamic-array spill matrix formatting (`ExcelCellValue[][]`) and `#MJ_ACCESS_DENIED!` error cells
 * - Automatic registration with Office.js `CustomFunctions.associate` when loaded inside Excel
 *
 * Kept free of `@memberjunction/core` runtime imports so `src/web` stays a small, self-contained bundle.
 *
 * @module @memberjunction/excel-addin
 */
import type { ExcelCellValue, ExcelParameterValue, ExcelSourceColumn } from './contract';

/** Maximum concurrent custom function requests per workbook session. */
export const EXCEL_CUSTOM_FUNCTION_MAX_CONCURRENCY = 5;

/** Default per-viewer TTL cache duration for custom function evaluations (60 seconds). */
export const EXCEL_CUSTOM_FUNCTION_CACHE_TTL_MS = 60_000;

/** Canonical error string returned into a cell when the signed-in user lacks permission. */
export const EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED = '#MJ_ACCESS_DENIED!';

/** Canonical error string returned when the workbook has not yet connected to MemberJunction. */
export const EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED = '#MJ_SIGN_IN_REQUIRED!';

/** Input payload for the `ExcelAddin.EvaluateCustomFunction` Remote Operation. */
export interface ExcelAddinEvaluateCustomFunctionInput {
    /** `'Query'` for `=MJ.QUERY(...)` or `'View'` for `=MJ.VIEW(...)`. */
    Kind: 'Query' | 'View';
    /** Saved query name/ID (when `Kind === 'Query'`) or Entity name/ID (when `Kind === 'View'`). */
    Target: string;
    /** Optional saved User View name or ID when `Kind === 'View'` (`'(Default)'` or omitted uses default entity columns). */
    ViewNameOrId?: string;
    /** Optional structured `Field='Value'` equality filter when `Kind === 'View'` (`A5`). */
    Filter?: string;
    /** Caller-settable query parameters (`IsServerSet` parameters are refused by the server). */
    Parameters?: Record<string, ExcelParameterValue>;
    /** Positional arguments when the caller passed unnamed values to `=MJ.QUERY("Renewals", 2026)`. */
    PositionalArguments?: ExcelParameterValue[];
    /** Whether to include column headers as the first row of a multi-column spill (default `false` for scalar, `true` for table). */
    IncludeHeaders?: boolean;
    /** Maximum rows to return (default 100, capped by host `MaxRows`). */
    MaxRows?: number;
}

/** Output payload from `ExcelAddin.EvaluateCustomFunction`. */
export interface ExcelAddinEvaluateCustomFunctionOutput {
    /** Resolved columns in display order. */
    Columns: ExcelSourceColumn[];
    /** 2D matrix of cell values ready to spill into Excel (`[row][col]`). */
    Matrix: ExcelCellValue[][];
    /** Scalar value when the result is a single 1x1 cell. */
    ScalarValue: ExcelCellValue | null;
    /** Total matching rows. */
    TotalRowCount: number;
}

/** Office Custom Functions `functions.json` schema definition. */
export interface ExcelCustomFunctionsJsonManifest {
    functions: Array<{
        id: string;
        name: string;
        description: string;
        result: {
            type: string;
            dimensionality: 'matrix' | 'scalar';
        };
        parameters: Array<{
            name: string;
            description: string;
            type: string;
            dimensionality?: 'scalar' | 'matrix';
            optional?: boolean;
            repeating?: boolean;
        }>;
        options: {
            stream: boolean;
            cancelable: boolean;
            requiresAddress: boolean;
        };
    }>;
}

/**
 * Builds the Office `functions.json` metadata manifest declaring `=MJ.QUERY` and `=MJ.VIEW`.
 */
export function BuildExcelCustomFunctionsMetadata(): ExcelCustomFunctionsJsonManifest {
    return {
        functions: [
            {
                id: 'QUERY',
                name: 'QUERY',
                description:
                    'Runs an approved MemberJunction Saved Query under your account permissions and spills the result.',
                result: {
                    type: 'any',
                    dimensionality: 'matrix'
                },
                parameters: [
                    {
                        name: 'queryNameOrId',
                        description: 'Name or UUID of the approved MemberJunction Saved Query.',
                        type: 'string',
                        dimensionality: 'scalar'
                    },
                    {
                        name: 'params',
                        description:
                            'Optional parameter values (either key=value strings like "Year=2026" or positional values). Server-set parameters are never accepted.',
                        type: 'any',
                        dimensionality: 'scalar',
                        optional: true,
                        repeating: true
                    }
                ],
                options: {
                    stream: false,
                    cancelable: true,
                    requiresAddress: false
                }
            },
            {
                id: 'VIEW',
                name: 'VIEW',
                description:
                    'Runs a MemberJunction Entity View under your account permissions (with RLS and FLS projection) and spills the rows.',
                result: {
                    type: 'any',
                    dimensionality: 'matrix'
                },
                parameters: [
                    {
                        name: 'entityNameOrId',
                        description: 'Name or UUID of the MemberJunction Entity.',
                        type: 'string',
                        dimensionality: 'scalar'
                    },
                    {
                        name: 'viewNameOrId',
                        description: 'Optional Saved User View name or UUID. Omit or pass "(Default)" for default columns.',
                        type: 'string',
                        dimensionality: 'scalar',
                        optional: true
                    },
                    {
                        name: 'filter',
                        description: 'Optional structured equality filter (e.g. "Status=\'Active\'"). Raw SQL is rejected.',
                        type: 'string',
                        dimensionality: 'scalar',
                        optional: true
                    },
                    {
                        name: 'includeHeaders',
                        description: 'Whether to include column headings in the first spilled row (default TRUE).',
                        type: 'boolean',
                        dimensionality: 'scalar',
                        optional: true
                    }
                ],
                options: {
                    stream: false,
                    cancelable: true,
                    requiresAddress: false
                }
            }
        ]
    };
}

/**
 * Parses variadic Excel custom function arguments into structured `Parameters` (`key=value`)
 * and `PositionalArguments` for `=MJ.QUERY(queryName, ...args)`.
 */
export function ParseExcelQueryFunctionArguments(
    queryNameOrId: string,
    rawArgs: readonly unknown[]
): ExcelAddinEvaluateCustomFunctionInput {
    const target = String(queryNameOrId ?? '').trim();
    if (!target) {
        throw new Error('Specify a Saved Query name or ID in =MJ.QUERY.');
    }

    const parameters: Record<string, ExcelParameterValue> = {};
    const positional: ExcelParameterValue[] = [];

    for (const raw of rawArgs) {
        if (raw === null || raw === undefined || raw === '') continue;
        // Flatten 2D range argument if user passed a range like B1:B2
        if (Array.isArray(raw)) {
            for (const row of raw) {
                if (Array.isArray(row)) {
                    for (const item of row) {
                        appendSingleQueryArg(item, parameters, positional);
                    }
                } else {
                    appendSingleQueryArg(row, parameters, positional);
                }
            }
        } else {
            appendSingleQueryArg(raw, parameters, positional);
        }
    }

    return {
        Kind: 'Query',
        Target: target,
        Parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        PositionalArguments: positional.length > 0 ? positional : undefined
    };
}

function appendSingleQueryArg(
    item: unknown,
    parameters: Record<string, ExcelParameterValue>,
    positional: ExcelParameterValue[]
): void {
    if (item === null || item === undefined) return;
    if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const valStr = trimmed.slice(eqIdx + 1).trim();
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                parameters[key] = coercePrimitiveParameter(valStr);
                return;
            }
        }
        positional.push(trimmed);
        return;
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
        positional.push(item);
        return;
    }
    if (typeof item === 'boolean') {
        positional.push(item);
    }
}

function coercePrimitiveParameter(valStr: string): ExcelParameterValue {
    if (valStr.toUpperCase() === 'TRUE') return true;
    if (valStr.toUpperCase() === 'FALSE') return false;
    if (valStr !== '' && !Number.isNaN(Number(valStr))) return Number(valStr);
    return valStr;
}

/**
 * Formats rows and columns returned by a query or view into an Excel 2D dynamic-array matrix (`ExcelCellValue[][]`).
 */
export function FormatRowsForExcelCustomFunction(
    columns: readonly ExcelSourceColumn[],
    rows: readonly Record<string, unknown>[],
    includeHeaders?: boolean
): { Matrix: ExcelCellValue[][]; ScalarValue: ExcelCellValue | null } {
    const resolvedCols: ExcelSourceColumn[] =
        columns.length > 0
            ? [...columns]
            : rows[0]
              ? Object.keys(rows[0]).map((k) => ({ Name: k, Header: k, DataType: 'Text' as const }))
              : [];

    if (resolvedCols.length === 0 || rows.length === 0) {
        if (includeHeaders && resolvedCols.length > 0) {
            return {
                Matrix: [resolvedCols.map((c) => c.Header || c.Name)],
                ScalarValue: null
            };
        }
        return { Matrix: [[0]], ScalarValue: 0 };
    }

    // 1x1 scalar result when headers are not explicitly requested
    if (rows.length === 1 && resolvedCols.length === 1 && includeHeaders !== true) {
        const cellVal = toExcelScalar(rows[0][resolvedCols[0].Name]);
        return { Matrix: [[cellVal]], ScalarValue: cellVal };
    }

    const matrix: ExcelCellValue[][] = [];
    if (includeHeaders !== false) {
        matrix.push(resolvedCols.map((c) => c.Header || c.Name));
    }
    for (const row of rows) {
        matrix.push(resolvedCols.map((c) => toExcelScalar(row[c.Name])));
    }
    return {
        Matrix: matrix,
        ScalarValue: matrix.length === 1 && matrix[0].length === 1 ? matrix[0][0] : null
    };
}

function toExcelScalar(value: unknown): ExcelCellValue {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';
    if (typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

/**
 * Viewer-scoped batching and caching coordinator for Excel `=MJ.QUERY(...)` and `=MJ.VIEW(...)` calls.
 *
 * Enforces:
 * - Per-connection (viewer-scoped) 60-second TTL cache (`viewerCacheKey + requestJson`)
 * - Request deduplication when multiple cells evaluate the identical formula simultaneously
 * - Bounded concurrency (`maxConcurrency = 5`) so a sheet with 50 `=MJ.QUERY` cells never floods MJAPI
 */
export class ExcelCustomFunctionCoordinator {
    private cache = new Map<string, { ExpiresAt: number; Output: ExcelAddinEvaluateCustomFunctionOutput }>();
    private inFlight = new Map<string, Promise<ExcelAddinEvaluateCustomFunctionOutput>>();
    private activeCount = 0;
    private waitQueue: Array<() => void> = [];

    public constructor(
        private readonly executor: (
            input: ExcelAddinEvaluateCustomFunctionInput
        ) => Promise<ExcelAddinEvaluateCustomFunctionOutput>,
        private readonly options: {
            ViewerScopeKey?: () => string;
            CacheTtlMs?: number;
            MaxConcurrency?: number;
        } = {}
    ) {}

    /** Clears all cached results (e.g., on manual Refresh or sign-out). */
    public ClearCache(): void {
        this.cache.clear();
    }

    /** Evaluates `=MJ.QUERY(queryNameOrId, ...args)` and returns a 2D spill matrix. */
    public async EvaluateQuery(queryNameOrId: string, ...args: unknown[]): Promise<ExcelCellValue[][]> {
        try {
            const input = ParseExcelQueryFunctionArguments(queryNameOrId, args);
            const out = await this.evaluateInput(input);
            return out.Matrix;
        } catch (err) {
            return [[this.mapErrorToCellCode(err)]];
        }
    }

    /** Evaluates `=MJ.VIEW(entityNameOrId, viewNameOrId?, filterOrIncludeHeaders?, includeHeaders?)` and returns a 2D spill matrix. */
    public async EvaluateView(
        entityNameOrId: string,
        viewNameOrId?: string,
        filterOrIncludeHeaders?: string | boolean,
        includeHeaders?: boolean
    ): Promise<ExcelCellValue[][]> {
        try {
            const target = String(entityNameOrId ?? '').trim();
            if (!target) {
                throw new Error('Specify an Entity name or ID in =MJ.VIEW.');
            }
            let filter: string | undefined;
            let resolvedIncludeHeaders: boolean;
            if (typeof filterOrIncludeHeaders === 'boolean') {
                filter = undefined;
                resolvedIncludeHeaders = filterOrIncludeHeaders;
            } else {
                const rawFilter = typeof filterOrIncludeHeaders === 'string' ? filterOrIncludeHeaders.trim() : '';
                filter = rawFilter.length > 0 ? rawFilter : undefined;
                resolvedIncludeHeaders = includeHeaders ?? true;
            }
            const input: ExcelAddinEvaluateCustomFunctionInput = {
                Kind: 'View',
                Target: target,
                ViewNameOrId: viewNameOrId ? String(viewNameOrId).trim() : undefined,
                Filter: filter,
                IncludeHeaders: Boolean(resolvedIncludeHeaders)
            };
            const out = await this.evaluateInput(input);
            return out.Matrix;
        } catch (err) {
            return [[this.mapErrorToCellCode(err)]];
        }
    }

    private async evaluateInput(
        input: ExcelAddinEvaluateCustomFunctionInput
    ): Promise<ExcelAddinEvaluateCustomFunctionOutput> {
        const viewerScope = this.options.ViewerScopeKey ? this.options.ViewerScopeKey() : 'default';
        if (!viewerScope) {
            throw new Error(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);
        }
        const cacheKey = `${viewerScope}::${JSON.stringify(input)}`;
        const now = Date.now();
        const ttl = this.options.CacheTtlMs ?? EXCEL_CUSTOM_FUNCTION_CACHE_TTL_MS;

        const cached = this.cache.get(cacheKey);
        if (cached && cached.ExpiresAt > now) {
            return cached.Output;
        }

        const existingPromise = this.inFlight.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        const promise = this.runWithConcurrencyLimit(async () => {
            const output = await this.executor(input);
            this.cache.set(cacheKey, { ExpiresAt: Date.now() + ttl, Output: output });
            return output;
        }).finally(() => {
            this.inFlight.delete(cacheKey);
        });

        this.inFlight.set(cacheKey, promise);
        return promise;
    }

    private async runWithConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
        const max = Math.max(1, this.options.MaxConcurrency ?? EXCEL_CUSTOM_FUNCTION_MAX_CONCURRENCY);
        if (this.activeCount >= max) {
            await new Promise<void>((resolve) => this.waitQueue.push(resolve));
        }
        this.activeCount++;
        try {
            return await fn();
        } finally {
            this.activeCount--;
            const next = this.waitQueue.shift();
            if (next) next();
        }
    }

    private mapErrorToCellCode(err: unknown): string {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED || /sign in|not authenticated|no connection/i.test(msg)) {
            return EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED;
        }
        if (/access|permission|refused|denied|server-set|unauthori[sz]ed/i.test(msg)) {
            return EXCEL_CUSTOM_FUNCTION_ACCESS_DENIED;
        }
        return `#MJ_ERROR: ${msg.slice(0, 80)}`;
    }
}
