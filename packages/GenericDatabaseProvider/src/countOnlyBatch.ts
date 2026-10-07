/**
 * Coalesces the COUNT queries of an all-`count_only` RunViews batch into ONE
 * SQL statement.
 *
 * Each view in the batch still runs the full `InternalRunView` path — entity
 * resolution, CanRead, saved-view WhereClause, ExtraFilter screening, RLS +
 * API-key row filters, materialized-view swap — so no security gate is
 * re-implemented here. The only thing that changes is the last step: instead
 * of every view executing its own `SELECT COUNT(*) ...` on the pool, each one
 * hands its fully-built count SQL to {@link CountOnlyBatchCoalescer.Execute}
 * and waits. Once every view in the batch has either registered its SQL or
 * finished without one (early failure, external entity, …), the coalescer runs
 *
 * ```sql
 * SELECT 0 AS "BatchIndex", "TotalRowCount" FROM (<count SQL 0>) b0
 * UNION ALL
 * SELECT 1, "TotalRowCount" FROM (<count SQL 1>) b1
 * ```
 *
 * and resolves each waiting view with its own row. If the combined statement
 * fails (one branch with a bad filter must not blank every count), each count
 * is re-run individually so failures stay per-view. A connection failure is not
 * re-run: every waiting view is rejected with it.
 *
 * Framework-free and database-free so it can be unit tested with a fake
 * executor.
 */

/** One row of a COUNT query, the shape `InternalRunView` already consumes. */
export interface CountOnlyRow {
    TotalRowCount: number;
}

/** Executes a SQL string and returns its rows (bound to the provider's ExecuteSQL). */
export type CountSQLExecutor = (sql: string) => Promise<Record<string, unknown>[]>;

interface PendingCount {
    index: number;
    sql: string;
    resolve: (rows: CountOnlyRow[]) => void;
    reject: (error: unknown) => void;
}

export class CountOnlyBatchCoalescer {
    private readonly pending: PendingCount[] = [];
    private readonly arrived = new Set<number>();
    private flushed = false;

    /**
     * @param size          number of views in the batch
     * @param execute       runs one SQL statement
     * @param quoteIdentifier dialect-correct identifier quoting (PG folds unquoted case)
     * @param isConnectionError true for a failure of the connection rather than of the query
     */
    constructor(
        private readonly size: number,
        private readonly execute: CountSQLExecutor,
        private readonly quoteIdentifier: (name: string) => string,
        private readonly isConnectionError: (error: unknown) => boolean = () => false,
    ) {
        if (size < 1) throw new Error('CountOnlyBatchCoalescer: size must be >= 1');
    }

    /**
     * Called by view `index` in place of executing its count SQL. Resolves with
     * that view's count rows once the batch flushes.
     */
    public Execute(index: number, sql: string): Promise<CountOnlyRow[]> {
        this.assertIndex(index);
        if (this.flushed) {
            // Defensive: a late registration after flush runs on its own.
            return this.executeSingle(sql);
        }
        return new Promise<CountOnlyRow[]>((resolve, reject) => {
            this.pending.push({ index, sql, resolve, reject });
            this.markArrived(index);
        });
    }

    /**
     * Called when view `index` has finished (success or failure). A view that
     * never registered a count (failed before the count step, external entity)
     * must still be counted as arrived, or the batch would wait forever.
     */
    public MarkSettled(index: number): void {
        this.assertIndex(index);
        this.markArrived(index);
    }

    /** Builds the combined statement. Exposed for tests. */
    public BuildCombinedSQL(items: ReadonlyArray<{ index: number; sql: string }>): string {
        const batchIndex = this.quoteIdentifier('BatchIndex');
        const total = this.quoteIdentifier('TotalRowCount');
        return items
            .map((item) => `SELECT ${item.index} AS ${batchIndex}, ${total} FROM (${item.sql}) ${this.quoteIdentifier(`b${item.index}`)}`)
            .join('\nUNION ALL\n');
    }

    private markArrived(index: number): void {
        this.arrived.add(index);
        if (!this.flushed && this.arrived.size >= this.size) {
            this.flushed = true;
            void this.flush();
        }
    }

    private async flush(): Promise<void> {
        const items = [...this.pending];
        if (items.length === 0) return;
        if (items.length === 1) {
            await this.settleIndividually(items);
            return;
        }
        let rows: Record<string, unknown>[];
        try {
            rows = await this.execute(this.BuildCombinedSQL(items));
        } catch (error) {
            if (this.isConnectionError(error)) {
                // The database is unreachable, not one branch bad: every view gets the error.
                for (const item of items) item.reject(error);
                return;
            }
            // One bad branch fails the whole UNION ALL — re-run each count on its
            // own so every other view still gets its number and the failing one
            // gets its own error (surfaced by InternalRunView as Success:false).
            await this.settleIndividually(items);
            return;
        }
        this.resolveFromCombinedRows(items, rows);
    }

    private resolveFromCombinedRows(items: PendingCount[], rows: Record<string, unknown>[]): void {
        const byIndex = new Map<number, CountOnlyRow>();
        for (const row of rows ?? []) {
            const index = Number(row['BatchIndex']);
            byIndex.set(index, { TotalRowCount: Number(row['TotalRowCount'] ?? 0) });
        }
        for (const item of items) {
            const row = byIndex.get(item.index);
            if (row) item.resolve([row]);
            else item.reject(new Error(`Count batch returned no row for view ${item.index}`));
        }
    }

    private async settleIndividually(items: PendingCount[]): Promise<void> {
        await Promise.all(items.map(async (item) => {
            try {
                item.resolve(await this.executeSingle(item.sql));
            } catch (error) {
                item.reject(error);
            }
        }));
    }

    private async executeSingle(sql: string): Promise<CountOnlyRow[]> {
        const rows = await this.execute(sql);
        return (rows ?? []).map((r) => ({ TotalRowCount: Number(r['TotalRowCount'] ?? 0) }));
    }

    private assertIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.size) {
            throw new Error(`CountOnlyBatchCoalescer: index ${index} out of range 0..${this.size - 1}`);
        }
    }
}

/**
 * True when a RunViews batch qualifies for coalescing: at least two items, and
 * every one of them is `count_only`. Mixed batches keep the per-view path.
 */
export function IsCoalescibleCountBatch(params: ReadonlyArray<{ ResultType?: string } | null | undefined>): boolean {
    return params.length >= 2 && params.every((p) => p?.ResultType === 'count_only');
}
