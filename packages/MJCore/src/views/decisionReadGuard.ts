/**
 * @fileoverview Zero silent row-cap truncation guards for decision-critical `RunView` reads.
 *
 * Decision-critical queries (budget ledgers, task-graph scheduling & dependency loading,
 * open-request / consult resolution, name-to-ID metadata resolution) must never silently drop
 * matching rows when `MaxRows` or an entity's `UserViewMaxRows` caps a result set.
 *
 * Uses a single-query sentinel `MaxRows + 1` probe (with `ResultType: 'simple'` by default)
 * or inspects `TotalRowCount` when returned by the provider so overflow is detected in one
 * round-trip without doubling database query quota.
 *
 * @module @memberjunction/core
 */

import type { RunViewResult } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';
import { RunView, RunViewParams } from './runView';

/**
 * Strongly-typed scalar union for default `'simple'` decision-read rows without `any` or `unknown`.
 */
export type DecisionReadScalar = string | number | boolean | Date | null | undefined;

/**
 * Default plain-object row shape returned when `ExecuteDecisionRead` is called without an
 * explicit row projection interface.
 */
export type DecisionReadDefaultRow = Record<string, DecisionReadScalar>;

/**
 * Machine-readable reason explaining how silent row-cap truncation was detected.
 */
export type DecisionReadTruncationReason =
    | 'SentinelOverflow'
    | 'TotalRowCountExceedsReturned'
    | 'AmbiguousMaxRowsBoundary';

/**
 * Structured truncation metadata attached to {@link RunViewDecisionReadTruncatedError} and
 * failed {@link DecisionReadValidationOutcome} results.
 */
export interface DecisionReadTruncationDetail {
    EntityName: string;
    OperationName?: string;
    ReturnedRowCount: number;
    MaxRows: number | null;
    TotalRowCount: number | null;
    Reason: DecisionReadTruncationReason;
    Message: string;
}

/**
 * Error thrown when a decision-critical `RunView` read encounters row-cap truncation instead
 * of silently operating on an incomplete result set.
 */
export class RunViewDecisionReadTruncatedError extends Error {
    public readonly Detail: DecisionReadTruncationDetail;

    constructor(detail: DecisionReadTruncationDetail) {
        super(detail.Message);
        this.name = 'RunViewDecisionReadTruncatedError';
        this.Detail = detail;
    }

    public get EntityName(): string {
        return this.Detail.EntityName;
    }

    public get OperationName(): string | undefined {
        return this.Detail.OperationName;
    }

    public get ReturnedRowCount(): number {
        return this.Detail.ReturnedRowCount;
    }

    public get MaxRows(): number | null {
        return this.Detail.MaxRows;
    }

    public get TotalRowCount(): number | null {
        return this.Detail.TotalRowCount;
    }

    public get Reason(): DecisionReadTruncationReason {
        return this.Detail.Reason;
    }
}

/**
 * Guard options for validating a `RunViewResult` against silent row-cap truncation.
 */
export interface DecisionReadGuardOptions {
    /** Target entity name (used in structured diagnostics). */
    EntityName?: string;
    /** Logical caller operation name (used in structured diagnostics). */
    OperationName?: string;
    /** Logical row ceiling expected by the caller. */
    MaxRows?: number | null;
    /** True when the executed query requested `MaxRows + 1` rows as a single-query sentinel probe. */
    UsedSentinelProbe?: boolean;
}

/**
 * Options for {@link ExecuteDecisionRead} and {@link ExecuteDecisionReadOrThrow}.
 */
export interface DecisionReadExecuteOptions extends DecisionReadGuardOptions {
    /**
     * When `true` (the default whenever `MaxRows > 0`), rewrites `MaxRows` to `MaxRows + 1` with
     * `SkipTotalRowCount: true` so truncation is detected in a single SQL query without paying a
     * second `COUNT(*)` query.
     */
    UseSentinelProbe?: boolean;
}

/**
 * Parameters accepted by {@link ExecuteDecisionRead}, defaulting `ResultType` to `'simple'`.
 */
export type DecisionReadParams = Omit<RunViewParams, 'ResultType'> & {
    ResultType?: 'simple' | 'entity_object';
};

/**
 * Non-throwing validation outcome returned by {@link ValidateDecisionReadResult} and
 * {@link ExecuteDecisionRead}.
 */
export type DecisionReadValidationOutcome<T> =
    | {
          Success: true;
          Truncated: false;
          Results: T[];
          RowCount: number;
          TotalRowCount?: number;
      }
    | {
          Success: false;
          Truncated: boolean;
          ErrorMessage: string;
          TruncationDetail?: DecisionReadTruncationDetail;
          Error: Error;
      };

function formatDecisionReadLabel(entityName: string, operationName?: string): string {
    return operationName ? `${operationName} (${entityName})` : entityName;
}

function buildTruncationDetail(
    entityName: string,
    operationName: string | undefined,
    returnedRowCount: number,
    maxRows: number | null,
    totalRowCount: number | null,
    reason: DecisionReadTruncationReason,
): DecisionReadTruncationDetail {
    const label = formatDecisionReadLabel(entityName, operationName);
    let reasonDetail: string;
    switch (reason) {
        case 'TotalRowCountExceedsReturned':
            reasonDetail = `TotalRowCount (${totalRowCount}) exceeds returned rows (${returnedRowCount})`;
            break;
        case 'SentinelOverflow':
            reasonDetail = `sentinel fetch returned ${returnedRowCount} rows, exceeding MaxRows cap (${maxRows})`;
            break;
        case 'AmbiguousMaxRowsBoundary':
            reasonDetail = `returned ${returnedRowCount} rows matching MaxRows (${maxRows}) without TotalRowCount or sentinel probe`;
            break;
    }
    return {
        EntityName: entityName,
        ...(operationName ? { OperationName: operationName } : {}),
        ReturnedRowCount: returnedRowCount,
        MaxRows: maxRows,
        TotalRowCount: totalRowCount,
        Reason: reason,
        Message: `Decision-critical RunView truncation detected on ${label}: ${reasonDetail}.`,
    };
}

function normalizePositiveCap(cap: number | null | undefined): number | null {
    if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) {
        return null;
    }
    return Math.trunc(cap);
}

/**
 * Builds {@link RunViewParams} configured for decision-read truncation detection using
 * `ResultType: 'simple'` by default and a single-query `MaxRows + 1` sentinel probe when a
 * positive `MaxRows` cap is supplied.
 */
export function BuildDecisionReadParams(
    params: DecisionReadParams,
    options?: Pick<DecisionReadExecuteOptions, 'MaxRows' | 'UseSentinelProbe'>,
): {
    Params: RunViewParams;
    EffectiveMaxRows: number | null;
    UsedSentinelProbe: boolean;
} {
    const effectiveCap = normalizePositiveCap(options?.MaxRows ?? params.MaxRows);
    const useSentinel = effectiveCap !== null && options?.UseSentinelProbe !== false;
    const baseParams: RunViewParams = {
        ...params,
        ResultType: params.ResultType ?? 'simple',
    };
    if (useSentinel && effectiveCap !== null) {
        baseParams.MaxRows = effectiveCap + 1;
        baseParams.SkipTotalRowCount = true;
    } else if (effectiveCap !== null) {
        baseParams.MaxRows = effectiveCap;
    }
    return {
        Params: baseParams,
        EffectiveMaxRows: effectiveCap,
        UsedSentinelProbe: useSentinel,
    };
}

/**
 * Inspects a completed {@link RunViewResult} for query failure or silent row-cap truncation.
 *
 * Truncation is flagged when:
 * 1. `result.TotalRowCount > result.Results.length` (provider reported more matching rows than returned),
 * 2. `result.Results.length > MaxRows` (single-query `MaxRows + 1` sentinel overflow), or
 * 3. `result.Results.length === MaxRows` without sentinel probing and without `TotalRowCount`
 *    (ambiguous boundary where overflow cannot be disproved).
 */
export function ValidateDecisionReadResult<T>(
    result: RunViewResult<T> | null | undefined,
    options: DecisionReadGuardOptions = {},
): DecisionReadValidationOutcome<T> {
    const entityName = options.EntityName?.trim() || 'UnknownEntity';
    const operationName = options.OperationName?.trim() || undefined;
    const cap = normalizePositiveCap(options.MaxRows);
    const usedSentinelProbe = options.UsedSentinelProbe === true;

    if (!result) {
        const msg = `Decision-critical RunView failed on ${formatDecisionReadLabel(entityName, operationName)}: null or undefined result.`;
        return {
            Success: false,
            Truncated: false,
            ErrorMessage: msg,
            Error: new Error(msg),
        };
    }

    if (!result.Success) {
        const msg =
            result.ErrorMessage?.trim() ||
            `Decision-critical RunView failed on ${formatDecisionReadLabel(entityName, operationName)}.`;
        return {
            Success: false,
            Truncated: false,
            ErrorMessage: msg,
            Error: new Error(msg),
        };
    }

    const rows = Array.isArray(result.Results) ? result.Results : [];
    const totalRowCount =
        typeof result.TotalRowCount === 'number' && Number.isFinite(result.TotalRowCount)
            ? result.TotalRowCount
            : null;

    if (totalRowCount !== null && totalRowCount > rows.length) {
        const detail = buildTruncationDetail(
            entityName,
            operationName,
            rows.length,
            cap,
            totalRowCount,
            'TotalRowCountExceedsReturned',
        );
        return {
            Success: false,
            Truncated: true,
            ErrorMessage: detail.Message,
            TruncationDetail: detail,
            Error: new RunViewDecisionReadTruncatedError(detail),
        };
    }

    if (cap !== null) {
        if (rows.length > cap) {
            const detail = buildTruncationDetail(
                entityName,
                operationName,
                rows.length,
                cap,
                totalRowCount,
                'SentinelOverflow',
            );
            return {
                Success: false,
                Truncated: true,
                ErrorMessage: detail.Message,
                TruncationDetail: detail,
                Error: new RunViewDecisionReadTruncatedError(detail),
            };
        }

        if (!usedSentinelProbe && rows.length === cap && totalRowCount === null) {
            const detail = buildTruncationDetail(
                entityName,
                operationName,
                rows.length,
                cap,
                null,
                'AmbiguousMaxRowsBoundary',
            );
            return {
                Success: false,
                Truncated: true,
                ErrorMessage: detail.Message,
                TruncationDetail: detail,
                Error: new RunViewDecisionReadTruncatedError(detail),
            };
        }
    }

    return {
        Success: true,
        Truncated: false,
        Results: rows,
        RowCount: rows.length,
        ...(totalRowCount !== null ? { TotalRowCount: totalRowCount } : {}),
    };
}

/**
 * Asserts that a {@link RunViewResult} succeeded with zero silent row-cap truncation and returns
 * its rows, throwing {@link RunViewDecisionReadTruncatedError} on overflow.
 */
export function AssertRunViewNotTruncated<T>(
    result: RunViewResult<T> | null | undefined,
    options: DecisionReadGuardOptions = {},
): T[] {
    const validated = ValidateDecisionReadResult(result, options);
    if ('Error' in validated) {
        throw validated.Error;
    }
    return validated.Results;
}

/**
 * Executes a decision-critical `RunView` read (defaulting to `ResultType: 'simple'`) with
 * automatic single-query sentinel probing when `MaxRows` is set, returning a structured outcome.
 */
export async function ExecuteDecisionRead<T extends object = DecisionReadDefaultRow>(
    rv: RunView,
    params: DecisionReadParams,
    contextUser?: UserInfo,
    options: DecisionReadExecuteOptions = {},
): Promise<DecisionReadValidationOutcome<T>> {
    const built = BuildDecisionReadParams(params, options);
    const result = await rv.RunView<T>(built.Params, contextUser);
    return ValidateDecisionReadResult(result, {
        EntityName: options.EntityName ?? params.EntityName ?? params.ViewName ?? 'View',
        OperationName: options.OperationName,
        MaxRows: built.EffectiveMaxRows,
        UsedSentinelProbe: built.UsedSentinelProbe,
    });
}

/**
 * Executes a decision-critical `RunView` read (defaulting to `ResultType: 'simple'`) and throws
 * {@link RunViewDecisionReadTruncatedError} if rows were truncated or `Error` if the query failed.
 */
export async function ExecuteDecisionReadOrThrow<T extends object = DecisionReadDefaultRow>(
    rv: RunView,
    params: DecisionReadParams,
    contextUser?: UserInfo,
    options: DecisionReadExecuteOptions = {},
): Promise<T[]> {
    const outcome = await ExecuteDecisionRead<T>(rv, params, contextUser, options);
    if ('Error' in outcome) {
        throw outcome.Error;
    }
    return outcome.Results;
}

/**
 * Validates a batch of `RunViews` results against matching {@link DecisionReadGuardOptions}.
 */
export function ValidateDecisionReadBatch<T>(
    results: ReadonlyArray<RunViewResult<T> | null | undefined>,
    optionsList: ReadonlyArray<DecisionReadGuardOptions>,
): DecisionReadValidationOutcome<T>[] {
    return optionsList.map((opts, index) => ValidateDecisionReadResult(results[index], opts));
}
