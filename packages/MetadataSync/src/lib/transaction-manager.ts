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
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
}

export class TransactionManager {
  private inTransaction = false;
  private sqlLogger?: SQLLogger;
  
  constructor(sqlLogger?: SQLLogger) {
    this.sqlLogger = sqlLogger;
  }
  
  /**
   * Begin a new transaction
   */
  async beginTransaction(options?: TransactionOptions): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }
    
    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }
    
    // Check if provider supports transactions
    if (typeof (provider as any).beginTransaction !== 'function') {
      // Provider doesn't support transactions, operate without them
      return;
    }
    
    try {
      await (provider as any).beginTransaction(options?.isolationLevel);
      this.inTransaction = true;
      this.sqlLogger?.logTransaction('BEGIN');
    } catch (error) {
      throw new Error(`Failed to begin transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Commit the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) {
      return; // No transaction to commit
    }
    
    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }
    
    // Check if provider supports transactions
    if (typeof (provider as any).commitTransaction !== 'function') {
      this.inTransaction = false;
      return;
    }
    
    try {
      await (provider as any).commitTransaction();
      this.inTransaction = false;
      this.sqlLogger?.logTransaction('COMMIT');
    } catch (error) {
      throw new Error(`Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Rollback the current transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) {
      return; // No transaction to rollback
    }
    
    const provider = getDataProvider();
    if (!provider) {
      throw new Error('No data provider available');
    }
    
    // Check if provider supports transactions
    if (typeof (provider as any).rollbackTransaction !== 'function') {
      this.inTransaction = false;
      return;
    }
    
    try {
      await (provider as any).rollbackTransaction();
      this.inTransaction = false;
      this.sqlLogger?.logTransaction('ROLLBACK');
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
   * Check if currently in a transaction
   */
  get isInTransaction(): boolean {
    return this.inTransaction;
  }
}