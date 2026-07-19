/**
 * Pure, dependency-free helpers for {@link AdhocQueryResolver}. Kept in their own
 * module (no type-graphql / mssql imports) so the total-row-count boundary logic is
 * unit-testable without standing up the GraphQL resolver or a database.
 */

/**
 * Determines the exact total row count from the page alone, when it can be known
 * without a separate `COUNT(*)`:
 *
 * - **Not paging** (`maxRows == null`): the query ran uncapped, so every row came
 *   back — the total is just the number returned.
 * - **Short page** (`pageLength < maxRows`): a page shorter than the page size means
 *   there are no rows beyond it, so the total is `startRow + pageLength` exactly.
 * - **Full page** (`pageLength >= maxRows`): more rows may exist — returns `null` to
 *   signal that a `COUNT(*)` is required to know the true total.
 */
export function exactTotalFromPage(
    startRow: number,
    pageLength: number,
    maxRows: number | null,
): number | null {
    if (maxRows == null) {
        return pageLength;
    }
    if (pageLength < maxRows) {
        return startRow + pageLength;
    }
    return null;
}

/**
 * Reads the total row count from a `COUNT(*)` recordset (`[{ TotalRowCount }]`),
 * falling back to `fallback` when the count is absent, non-numeric, or negative — so
 * an unexpected count shape never yields a misleading total. `fallback` should be a
 * safe lower bound (e.g. `startRow + rowsReturned`).
 */
export function resolveAdhocTotalRowCount(
    countRows: ReadonlyArray<{ TotalRowCount?: unknown }> | null | undefined,
    fallback: number,
): number {
    const raw = countRows?.[0]?.TotalRowCount;
    if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) {
            return Math.floor(n);
        }
    }
    return fallback;
}
