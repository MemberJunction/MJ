/**
 * Database connection management for SQL Server
 * Pure mssql driver - no MJ DataProvider dependencies
 */

import * as sql from 'mssql';
import { DatabaseConfig } from '../types/config.js';

export class DatabaseConnection {
  private pool: sql.ConnectionPool | null = null;
  private config: sql.config;

  constructor(dbConfig: DatabaseConfig) {
    this.config = {
      server: dbConfig.server,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      options: {
        encrypt: dbConfig.encrypt ?? true,
        trustServerCertificate: dbConfig.trustServerCertificate ?? false
      },
      connectionTimeout: dbConfig.connectionTimeout ?? 30000,
      requestTimeout: 30000,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
  }

  /**
   * Connect to database
   */
  public async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    this.pool = await sql.connect(this.config);
  }

  /**
   * Test database connectivity
   */
  public async test(): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();
      const result = await this.query('SELECT 1 as test');

      if (result.success && result.data && result.data.length > 0) {
        return {
          success: true,
          message: `Successfully connected to ${this.config.database} on ${this.config.server}`
        };
      }

      return {
        success: false,
        message: 'Connection established but test query failed'
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Execute a query with retry logic
   */
  public async query<T = any>(
    queryText: string,
    maxRetries: number = 3
  ): Promise<{ success: boolean; data?: T[]; errorMessage?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.pool) {
          await this.connect();
        }

        const result = await this.pool!.request().query(queryText);
        return {
          success: true,
          data: result.recordset as T[]
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error is transient and should be retried
        if (this.isTransientError(error as Error) && attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        // Non-transient error or max retries reached
        break;
      }
    }

    return {
      success: false,
      errorMessage: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Check if error is transient and should be retried
   */
  private isTransientError(error: Error): boolean {
    const transientMessages = [
      'connection',
      'timeout',
      'deadlock',
      'network',
      'transport'
    ];

    const message = error.message.toLowerCase();
    return transientMessages.some(msg => message.includes(msg));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close connection
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Get connection pool (for advanced usage)
   */
  public getPool(): sql.ConnectionPool | null {
    return this.pool;
  }
}
