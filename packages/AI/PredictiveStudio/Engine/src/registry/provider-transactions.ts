/**
 * @module registry/provider-transactions
 *
 * The one transaction helper the registry's writers share (D4-92): the lifecycle gate's publish, evaluate and archive
 * transactions and the trainer's version allocation with its model-row save. Both hold row locks (the stored lock
 * Queries are `UPDLOCK, HOLDLOCK`) that last only as long as the transaction they run in, so a provider that cannot open
 * one would silently void the lock; the helper refuses such a provider instead of running the work without a
 * transaction (which `RunInEntityTransaction` does by design for client providers).
 */
import type { EntityTransactionScope, IMetadataProvider } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';

import type { RegistryContext } from './registry-context';

/** A metadata provider that can open a server-side entity transaction. */
export type TransactionalProvider = IMetadataProvider & {
  readonly SupportsEntityTransactions: true;
  BeginEntityTransaction(): Promise<EntityTransactionScope>;
};

/** Thrown when a registry write that holds locks is asked to run on a provider with no server-side transactions. */
export class EntityTransactionsUnsupportedError extends Error {
  constructor(public readonly Operation: string) {
    super(
      `Predictive Studio registry: ${Operation} needs a server-side transaction (its row locks last only as long as one), ` +
        'and this provider does not support entity transactions; run it on the server',
    );
    this.name = 'EntityTransactionsUnsupportedError';
  }
}

/** Runs registry work inside one provider transaction. */
export class ProviderTransactions {
  /** True when `provider` opens server-side entity transactions (a `DatabaseProviderBase`); narrows without a cast. */
  public static IsTransactional(provider: IMetadataProvider): provider is TransactionalProvider {
    return 'SupportsEntityTransactions' in provider && provider.SupportsEntityTransactions === true
      && 'BeginEntityTransaction' in provider && typeof provider.BeginEntityTransaction === 'function';
  }

  /**
   * Runs `work` in one transaction on `ctx.Provider`. It commits when `work` returns and `commitWhen(value)` is true
   * (default: always), rolls back when `commitWhen` is false (a refusal: nothing the work read under its locks is kept
   * locked, and nothing it wrote is kept), and rolls back and rethrows when `work` throws. A failed rollback is logged
   * and the original error is rethrown, so the error that explains the failure survives.
   *
   * @param operation names the work in the refusal when the provider has no transactions
   * @throws EntityTransactionsUnsupportedError when `ctx.Provider` cannot open a transaction (nothing runs)
   */
  public static async Run<T>(ctx: RegistryContext, operation: string, work: () => Promise<T>, commitWhen: (value: T) => boolean = () => true): Promise<T> {
    const provider = ctx.Provider;
    if (!ProviderTransactions.IsTransactional(provider)) throw new EntityTransactionsUnsupportedError(operation);
    const scope = await provider.BeginEntityTransaction();
    let value: T;
    try {
      value = await work();
    } catch (error) {
      await ProviderTransactions.rollBackQuietly(scope, operation);
      throw error;
    }
    if (commitWhen(value)) await scope.Commit();
    else await scope.Rollback();
    return value;
  }

  /** Rolls back after a failure; a rollback that fails too is logged so the work's own error is the one rethrown. */
  private static async rollBackQuietly(scope: EntityTransactionScope, operation: string): Promise<void> {
    try {
      await scope.Rollback();
    } catch (rollbackError) {
      LogError(`Predictive Studio registry: rolling back ${operation} failed after the work threw: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
  }
}
