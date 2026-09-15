/**
 * @fileoverview Transaction Manager for atomic database operations
 * @module transaction-manager
 *
 * This module provides transaction support for push operations to ensure
 * all related entities are saved atomically with rollback capability.
 */

import { GetDataProvider } from './provider-utils';
import { SQLLogger } from './sql-logger';

export interface TransactionOptions {
}

export class TransactionManager {
  private inTransaction = false;
  private sqlLogger?: SQLLogger;

  constructor(sqlLogger?: SQLLogger) {
    this.sqlLogger = sqlLogger;
  }

  /**
   * Begin a new transaction.
   *
   * Both SQL Server and PostgreSQL run in real transaction mode. The PG provider
   * holds its active transaction on a single `pg.PoolClient` (`_transaction`),
   * which serializes all queries on one connection — that historically caused
   * deadlocks when push code did `Promise.all(saves)` because pg.Client queues
   * concurrent queries and the queue could deadlock against non-DB async work
   * (embedding compute, dialect conversion).
   *
   * The fix: parallel-save sites in the query-extraction sync pipeline now use
   * `RunMaybeSerial` from @memberjunction/core, which detects an active provider
   * transaction (via `provider.IsInTransaction`) and switches to sequential
   * `await` execution. SQL Server preserves its original parallelism because
   * `IsInTransaction` defaults to `false` on `DatabaseProviderBase` and the
   * SQL Server provider doesn't override it.
   */
  async BeginTransaction(options?: TransactionOptions): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }

    const provider = GetDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }

    try {
      await provider.BeginTransaction();
      this.inTransaction = true;
    } catch (error) {
      throw new Error(`Failed to begin transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** @deprecated Use {@link BeginTransaction}. */
  async beginTransaction(options?: TransactionOptions): Promise<void> {
    return this.BeginTransaction(options);
  }

  /**
   * Commit the current transaction.
   */
  async CommitTransaction(): Promise<void> {
    if (!this.inTransaction) {
      return; // No transaction to commit
    }

    const provider = GetDataProvider();
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

  /** @deprecated Use {@link CommitTransaction}. */
  async commitTransaction(): Promise<void> {
    return this.CommitTransaction();
  }

  /**
   * Rollback the current transaction.
   * Returns true if rollback succeeded or no transaction was active, false if rollback failed.
   */
  async RollbackTransaction(): Promise<boolean> {
    if (!this.inTransaction) {
      return true; // No transaction to rollback
    }

    const provider = GetDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }

    try {
      await provider.RollbackTransaction();
      this.inTransaction = false;
      return true;
    } catch (error) {
      // Log but don't throw - we're already in an error state
      console.error('Failed to rollback transaction:', error);
      return false;
    }
  }

  /** @deprecated Use {@link RollbackTransaction}. */
  async rollbackTransaction(): Promise<boolean> {
    return this.RollbackTransaction();
  }

  /**
   * Execute a function within a transaction
   */
  async ExecuteInTransaction<T>(
    fn: () => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    await this.BeginTransaction(options);

    try {
      const result = await fn();
      await this.CommitTransaction();
      return result;
    } catch (error) {
      await this.RollbackTransaction();
      throw error;
    }
  }

  /** @deprecated Use {@link ExecuteInTransaction}. */
  async executeInTransaction<T>(
    fn: () => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    return this.ExecuteInTransaction(fn, options);
  }

  /**
   * Check if currently in a transaction.
   */
  get IsInTransaction(): boolean {
    return this.inTransaction;
  }

  /** @deprecated Use {@link IsInTransaction}. */
  get isInTransaction(): boolean {
    return this.IsInTransaction;
  }
}
