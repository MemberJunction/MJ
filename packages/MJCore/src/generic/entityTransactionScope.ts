/**
 * @fileoverview Provider-arbitrated transaction scopes for multi-record entity operations.
 *
 * ## Why this exists
 *
 * Before this abstraction MemberJunction had **two mutually-blind transaction mechanisms**:
 *
 * 1. `GenericDatabaseProvider.BeginTransaction()` / `CommitTransaction()` / `RollbackTransaction()` —
 *    a properly re-entrant ambient manager (depth counter, dialect savepoints at depth
 *    ≥ 2, serialized by a promise mutex). Application composite-save code
 *    (order headers + lines, journal entries + lines, payments + allocations) calls this directly.
 *    A server abort (mssql `ENOTBEGUN`/`EABORT`, pg `25P01`) is **not recoverable**: nested begin
 *    throws `DoomedTransactionError`, the outer `Commit` fails, and `Save()` returns false.
 *    Concurrent nested scopes on one provider instance are unsupported.
 * 2. `BeginISATransaction()` / `CommitISATransaction()` / `RollbackISATransaction()` — an
 *    IS-A-specific trio that opened a brand-new physical transaction on the pool with **no depth
 *    awareness at all**.
 *
 * Because neither knew about the other, an entity that hit both paths — an IS-A entity saved
 * inside an application transaction, or a composite whose child is an IS-A leaf — wrote into *two
 * independent physical transactions on the same connection pool*. Rolling one back left the other
 * committed. A torn write, with no error raised.
 *
 * ## The fix: one arbiter, zero coupling between participants
 *
 * Every participant now asks for the same thing and never asks who else is in a transaction:
 *
 * ```typescript
 * const scope = await provider.BeginEntityTransaction();
 * try {
 *     // ...work...
 *     await scope.Commit();
 * } catch (e) {
 *     await scope.Rollback();
 *     throw e;
 * }
 * ```
 *
 * The **provider** decides whether that is a physical `BEGIN` or a join to a transaction already in
 * flight. This deliberately *reduces* coupling: IS-A orchestration, composite graph saves and
 * hand-written application code each remain ignorant of one another, and correctness no longer
 * depends on that ignorance being harmless.
 *
 * ## Tier behaviour
 *
 * - **Server** (`DatabaseProviderBase` and subclasses): `SupportsEntityTransactions === true`;
 *   scopes map onto the depth-counted ambient transaction.
 * - **Client** (`GraphQLDataProvider`): `SupportsEntityTransactions === false`; there is no local
 *   transaction to join. Callers that need atomicity across several records route the whole unit of
 *   work to the server instead — see `MJ.SaveEntityGraph` and
 *   `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`.
 *
 * ## Concurrency
 *
 * The underlying ambient transaction is a field on the **provider instance**, not a global. MJServer
 * builds per-request providers (`createPerRequestProviders` in `packages/MJServer/src/context.ts`),
 * so an ambient transaction is effectively request-scoped and concurrent requests cannot interleave
 * within one. Long-lived single-provider processes (CLI tools, workers) should not run concurrent
 * transactional work on one provider instance — that constraint predates this abstraction and is
 * unchanged by it.
 *
 * @module @memberjunction/core
 */

import { LogError } from './logging';

/**
 * A handle to a unit of work that will either commit or roll back as a whole.
 *
 * Obtained from {@link IMetadataProvider.BeginEntityTransaction}. The scope is **settle-once**:
 * the first call to {@link EntityTransactionScope.Commit} or
 * {@link EntityTransactionScope.Rollback} settles it and every later call is a no-op. That makes
 * the standard `try { work; Commit() } catch { Rollback() }` shape safe even when the work itself
 * already rolled back on the way out.
 *
 * @remarks
 * A scope does **not** necessarily correspond to a physical database transaction. When one is
 * already in flight on the provider, the scope joins it — committing the inner scope releases a
 * savepoint rather than committing the outer transaction. Inspect {@link IsNested} to tell the two
 * apart; correctness never requires you to.
 */
export interface EntityTransactionScope {
    /**
     * True when this scope joined a transaction that was already in flight on the provider, rather
     * than starting a new physical one.
     *
     * Informational only — for logging and diagnostics. Commit/rollback behave correctly either
     * way, and callers must not branch on this to decide whether to settle the scope.
     */
    readonly IsNested: boolean;

    /**
     * Settles the scope successfully. On the outermost scope this commits the physical transaction;
     * on a nested scope it releases the savepoint. No-op if the scope is already settled.
     */
    Commit(): Promise<void>;

    /**
     * Settles the scope by undoing its work. On the outermost scope this rolls the physical
     * transaction back; on a nested scope it rolls back to the savepoint. No-op if the scope is
     * already settled.
     */
    Rollback(): Promise<void>;
}

/**
 * Runs `work` inside a provider-arbitrated transaction scope, committing on success and rolling
 * back on any thrown error.
 *
 * This is the preferred entry point — it makes the settle-once contract impossible to get wrong and
 * keeps the `try`/`catch` boilerplate in one place.
 *
 * @example
 * ```typescript
 * const total = await RunInEntityTransaction(this.ProviderToUse, async () => {
 *     await header.Save();
 *     for (const line of lines) await line.Save();
 *     return lines.length;
 * });
 * ```
 *
 * @param provider - The provider to obtain the scope from. When it does not support entity
 *                   transactions the work still runs, just without transactional guarantees —
 *                   callers needing atomicity must check `SupportsEntityTransactions` first and
 *                   route the unit of work to the server instead.
 * @param work - The work to perform inside the scope.
 * @returns Whatever `work` returns.
 * @throws Re-throws whatever `work` throws, after rolling the scope back.
 */
export async function RunInEntityTransaction<T>(
    provider: {
        SupportsEntityTransactions?: boolean;
        BeginEntityTransaction?(): Promise<EntityTransactionScope>;
    } | null | undefined,
    work: () => Promise<T>,
): Promise<T> {
    const canTransact = provider?.SupportsEntityTransactions === true && !!provider.BeginEntityTransaction;
    if (!canTransact) {
        // No local transaction available (client provider, or a provider that does not implement
        // the capability). Run the work as-is — the caller is responsible for having decided that
        // non-atomic execution is acceptable here, or for routing elsewhere.
        return work();
    }

    const scope = await provider.BeginEntityTransaction!();
    try {
        const result = await work();
        await scope.Commit();
        return result;
    } catch (e) {
        // Rollback failures are logged and swallowed so the CALLER'S error survives: this is the
        // failure path, and a doomed transaction (savepoint rollback refused, connection gone)
        // throwing here would replace the error that explains what actually went wrong with a
        // secondary one that explains less. Mirrors BaseEntity's own scope helper.
        try {
            await scope.Rollback();
        } catch (rollbackError) {
            LogError(
                `RunInEntityTransaction: rollback failed after the work threw — reporting the original error. ` +
                `Rollback failure: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            );
        }
        throw e;
    }
}
