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

/** A statement request that can be cancelled while it runs; an `mssql` Request has this shape. */
export interface CancellableRequest<T> {
    query(sqlText: string): Promise<T>;
    cancel(): void;
}

/**
 * Runs `sqlText` on `request` and, if it has not finished by `deadline` (epoch milliseconds),
 * cancels it on the server and rejects with `Query timeout exceeded`. Cancelling, rather than
 * only giving up waiting, frees the connection and stops the work. A deadline already passed
 * rejects without starting the query.
 */
export async function RunWithDeadline<T>(request: CancellableRequest<T>, sqlText: string, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new Error('Query timeout exceeded');
    }
    const running = request.query(sqlText);
    // The cancelled query rejects after the race has settled; that rejection is expected.
    running.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            running,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    // Settle first, so the caller sees the timeout rather than the driver's
                    // cancellation error.
                    reject(new Error('Query timeout exceeded'));
                    request.cancel();
                }, remaining);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
