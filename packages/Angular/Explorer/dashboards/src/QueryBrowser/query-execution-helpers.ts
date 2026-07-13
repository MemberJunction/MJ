/**
 * @fileoverview Pure, framework-agnostic helpers for the Query Browser's
 * STORED-QUERY EXECUTION tools (RunStoredQuery / GetQueryMetadata /
 * PageQueryResults).
 *
 * 🚨 SAFETY NOTE: these helpers only NORMALIZE and BOUND tool input/output.
 * They perform no execution, no I/O, and no mutation. They exist so the
 * execution tool Handlers can be tolerant (return a typed result rather than
 * throw) and so the row-bounding / paging math stays unit-testable in isolation
 * from Angular and the MJ query stack.
 *
 * These are kept LOCAL to QueryBrowser (not in the shared agent-tool-validation
 * file) deliberately — to avoid concurrent-edit conflicts with other Admin
 * surfaces and because they are execution-specific.
 */

/** Default number of rows an execution tool returns when MaxRows is omitted. */
export const DEFAULT_QUERY_MAX_ROWS = 50;

/** Hard upper bound on rows ANY execution tool may return, regardless of input. */
export const QUERY_MAX_ROWS_HARD_CAP = 200;

/** Default page size for PageQueryResults when PageSize is omitted. */
export const DEFAULT_QUERY_PAGE_SIZE = 50;

/**
 * Normalize an untrusted MaxRows parameter into a safe, bounded row count.
 * Always returns an integer in `[1, QUERY_MAX_ROWS_HARD_CAP]`. Non-numeric,
 * missing, zero, or negative input falls back to {@link DEFAULT_QUERY_MAX_ROWS};
 * anything above the hard cap is clamped DOWN to the cap. Never throws.
 *
 * @param raw - the untrusted MaxRows value (may be undefined / string / number)
 * @param defaultRows - the fallback when input is missing/invalid
 * @param hardCap - the absolute maximum (clamped, never exceeded)
 */
export function normalizeMaxRows(
    raw: unknown,
    defaultRows: number = DEFAULT_QUERY_MAX_ROWS,
    hardCap: number = QUERY_MAX_ROWS_HARD_CAP,
): number {
    const cap = Number.isFinite(hardCap) && hardCap >= 1 ? Math.floor(hardCap) : QUERY_MAX_ROWS_HARD_CAP;
    const fallback = Number.isFinite(defaultRows) && defaultRows >= 1 ? Math.floor(Math.min(defaultRows, cap)) : DEFAULT_QUERY_MAX_ROWS;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 1) {
        return Math.min(fallback, cap);
    }
    return Math.min(Math.floor(value), cap);
}

/**
 * Normalize an untrusted PageNumber into a 1-based integer page (minimum 1).
 * Missing / non-numeric / sub-1 input becomes page 1. Never throws.
 */
export function normalizePageNumber(raw: unknown): number {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 1) {
        return 1;
    }
    return Math.floor(value);
}

/**
 * Compute the zero-based StartRow offset for a 1-based page number and page
 * size — the contract MJ's RunQuery.StartRow expects. Inputs are normalized
 * first so callers can pass raw tool input directly. Never throws.
 *
 * @returns `{ startRow, pageNumber, pageSize }` — all safe, bounded integers.
 */
export function computePaging(
    rawPageNumber: unknown,
    rawPageSize: unknown,
): { startRow: number; pageNumber: number; pageSize: number } {
    const pageNumber = normalizePageNumber(rawPageNumber);
    const pageSize = normalizeMaxRows(rawPageSize, DEFAULT_QUERY_PAGE_SIZE);
    const startRow = (pageNumber - 1) * pageSize;
    return { startRow, pageNumber, pageSize };
}

/**
 * Defensively bound a result row array to at most `cap` rows. RunQuery is asked
 * for MaxRows, but we slice again here so a provider that ignores MaxRows can
 * NEVER leak more than the cap to the agent. Always returns a NEW array; null /
 * non-array input yields an empty array. Never throws.
 *
 * @param rows - the raw result rows (typed as unknown to stay caller-agnostic)
 * @param cap - the maximum number of rows to keep
 */
export function boundResultRows<T>(rows: readonly T[] | null | undefined, cap: number): T[] {
    if (!Array.isArray(rows)) {
        return [];
    }
    const safeCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : QUERY_MAX_ROWS_HARD_CAP;
    return rows.slice(0, safeCap);
}

/**
 * Normalize an untrusted Parameters object into a plain `Record<string, unknown>`
 * suitable for RunQueryParams.Parameters. Drops non-object input (returns
 * undefined so RunQuery treats it as "no parameters"). Shallow-copies own
 * enumerable keys only; never throws.
 *
 * NOTE: parameter VALUES are passed through as-is — RunQuery's server-side
 * pipeline validates and type-coerces them against the Query's parameter
 * metadata, so we don't second-guess types here.
 */
export function normalizeQueryParameters(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(raw as Record<string, unknown>)) {
        out[key] = (raw as Record<string, unknown>)[key];
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolve the TRUE total row count a stored query would return, independent of
 * the MaxRows / StartRow cap applied for this call.
 *
 * `RunQueryResult.TotalRowCount` is the authoritative total — it only differs
 * from the bounded `RowCount` when StartRow or MaxRows are used (so a single
 * unbounded run already has TotalRowCount === RowCount). We read it defensively:
 * if a provider doesn't populate it (non-finite / negative / missing), we fall
 * back to the number of rows actually returned (`returnedRowCount`) so the tool
 * never reports a misleading total. Never throws.
 *
 * @param rawTotal - the provider's reported TotalRowCount (untrusted shape)
 * @param returnedRowCount - the bounded count of rows actually returned
 * @returns a non-negative integer total, falling back to returnedRowCount
 */
export function resolveTotalRowCount(rawTotal: unknown, returnedRowCount: number): number {
    // Treat null/undefined as "not provided" — fall back. (Number(null) === 0,
    // which would otherwise masquerade as a legitimate total of zero.)
    if (rawTotal != null) {
        const value = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
        if (Number.isFinite(value) && value >= 0) {
            return Math.floor(value);
        }
    }
    return Number.isFinite(returnedRowCount) && returnedRowCount >= 0 ? Math.floor(returnedRowCount) : 0;
}
