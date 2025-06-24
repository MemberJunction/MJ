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
    
    // Check if provider supports transactions (PascalCase method names)
    try {
      await provider.BeginTransaction();
      this.inTransaction = true;
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
    
    try {
      await provider.CommitTransaction();
      this.inTransaction = false;
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
   * Check if currently in a transaction
   */
  get isInTransaction(): boolean {
    return this.inTransaction;
  }
}