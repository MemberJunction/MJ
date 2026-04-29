/**
 * @fileoverview Transaction Manager for atomic database operations
 * @module transaction-manager
 * 
 * This module provides transaction support for push operations to ensure
 * all related entities are saved atomically with rollback capability.
 */

import { getDataProvider } from './provider-utils';
import { SQLLogger } from './sql-logger';

export interface TransactionOptions {
}

export class TransactionManager {
  private inTransaction = false;
  /**
   * When true, beginTransaction/commitTransaction/rollbackTransaction become
   * no-ops because the underlying provider can't safely host a long-running
   * transaction across the parallel-Save patterns mj sync push uses (see the
   * "Non-transactional mode" comment in beginTransaction below). Detected once
   * on first beginTransaction call from the provider's PlatformKey.
   */
  private nonTransactionalMode = false;
  private sqlLogger?: SQLLogger;

  constructor(sqlLogger?: SQLLogger) {
    this.sqlLogger = sqlLogger;
  }

  /**
   * Begin a new transaction.
   *
   * **Non-transactional mode (PostgreSQL):** PG sync push runs in
   * commit-as-you-go mode rather than wrapping the whole push in one provider-
   * level transaction. The PG provider stores its active client on a single
   * shared instance field (`PostgreSQLDataProvider._transaction`) and routes
   * every subsequent ExecuteSQL through that one pg.Client. mj sync push runs
   * many parallel saves inside (e.g. RunExtractionPipeline → Promise.all of
   * QueryDependency saves), and pg.Client serializes concurrent queries on a
   * single connection. Combined with embedded-async work (embedding compute,
   * dialect conversion), the queue can deadlock — leaving an "idle in
   * transaction" connection that blocks every subsequent save until the
   * orphan is killed.
   *
   * Per-record commits are safe for metadata sync because:
   * (1) records upsert by ID — re-running the push converges,
   * (2) failures still surface via the per-record error reporting in push.ts,
   * (3) partial writes are recoverable by re-running.
   *
   * SQL Server keeps the original wrap-in-transaction behavior; the mssql
   * driver's connection model handles concurrent queries on a single
   * connection differently and doesn't deadlock under the same load.
   *
   * Tracked for proper fix: see Task #31 in the local task list.
   */
  async beginTransaction(options?: TransactionOptions): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }

    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }

    // Detect platform from the provider. Falls back to defaulting to
    // transactional mode if PlatformKey isn't exposed.
    const platformKey = (provider as unknown as { PlatformKey?: string }).PlatformKey;
    if (platformKey === 'postgresql') {
      this.nonTransactionalMode = true;
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️  [MetadataSync] PostgreSQL detected — running in non-transactional / ' +
        'commit-as-you-go mode. Each record save commits independently. Failures ' +
        'will be reported per-record but partial writes will not be rolled back. ' +
        'Re-run mj sync push to resync after fixing any errors. (See ' +
        'TransactionManager.beginTransaction docstring for rationale.)'
      );
      return;
    }

    // SQL Server (and any other provider): preserve original transaction behavior.
    try {
      await provider.BeginTransaction();
      this.inTransaction = true;
    } catch (error) {
      throw new Error(`Failed to begin transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Commit the current transaction. No-op in non-transactional mode (PG)
   * since each record committed at write time.
   */
  async commitTransaction(): Promise<void> {
    if (this.nonTransactionalMode) {
      return; // saves already committed individually
    }
    if (!this.inTransaction) {
      return; // No transaction to commit
    }

    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }

    try {
      await provider.CommitTransaction();
      this.inTransaction = false;
    } catch (error) {
      throw new Error(`Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Rollback the current transaction. No-op in non-transactional mode (PG):
   * any records that committed before the failure remain in place. The error
   * still propagates through executeInTransaction so push.ts reports it.
   */
  async rollbackTransaction(): Promise<void> {
    if (this.nonTransactionalMode) {
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️  [MetadataSync] Push failed in non-transactional mode (PG). Records ' +
        'committed before the failure point are persisted; re-run mj sync push ' +
        'to retry the remaining records.'
      );
      return;
    }
    if (!this.inTransaction) {
      return; // No transaction to rollback
    }

    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }

    try {
      await provider.RollbackTransaction();
      this.inTransaction = false;
    } catch (error) {
      // Log but don't throw - we're already in an error state
      console.error('Failed to rollback transaction:', error);
    }
  }
  
  /**
   * Execute a function within a transaction
   */
  async executeInTransaction<T>(
    fn: () => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    await this.beginTransaction(options);
    
    try {
      const result = await fn();
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }
  
  /**
   * Check if currently in a transaction. False in non-transactional mode (PG)
   * since saves are individually committed.
   */
  get isInTransaction(): boolean {
    return this.inTransaction;
  }

  /**
   * True when running in commit-as-you-go mode (PG). Push code can use this
   * to adjust messaging (e.g. "rolled back" vs "stopped at first failure").
   */
  get isNonTransactionalMode(): boolean {
    return this.nonTransactionalMode;
  }
}