import * as sql from 'mssql';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ConnectionConfig {
  server: string;
  database: string;
  user?: string;
  password?: string;
  port?: number;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

/**
 * Database connection manager - NO MJ DEPENDENCIES
 */
export class DatabaseConnection {
  private pool?: sql.ConnectionPool;
  private config: sql.config;

  constructor(config: ConnectionConfig) {
    this.config = {
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 1433,
      options: {
        encrypt: config.encrypt !== undefined ? config.encrypt : true,
        trustServerCertificate: config.trustServerCertificate !== undefined ? config.trustServerCertificate : false,
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
      },
    };
  }

  /**
   * Get connection from environment variables
   */
  static fromEnv(): DatabaseConnection {
    const config: ConnectionConfig = {
      server: process.env.DB_SERVER || 'localhost',
      database: process.env.DB_DATABASE || 'master',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 1433,
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    };

    return new DatabaseConnection(config);
  }

  /**
   * Get connection pool
   */
  async getConnection(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    this.pool = new sql.ConnectionPool(this.config);
    await this.pool.connect();
    return this.pool;
  }

  /**
   * Execute query with retry logic
   */
  async query<T = any>(queryText: string, params?: Record<string, any>): Promise<T[]> {
    let lastError: Error | undefined;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const pool = await this.getConnection();
        const request = pool.request();

        if (params) {
          for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
          }
        }

        const result = await request.query(queryText);
        return result.recordset as T[];
      } catch (error) {
        lastError = error as Error;

        if (lastError.message.includes('Incorrect syntax')) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }

    throw lastError || new Error('Query failed after retries');
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  /**
   * Test connection
   */
  async test(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as Test');
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
