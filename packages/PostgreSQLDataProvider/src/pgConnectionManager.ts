import pg from 'pg';

/**
 * Configuration for establishing a PostgreSQL connection pool.
 */
export interface PGConnectionConfig {
    /** PostgreSQL host */
    Host: string;
    /** PostgreSQL port (default: 5432) */
    Port?: number;
    /** Database name */
    Database: string;
    /** Username */
    User: string;
    /** Password */
    Password: string;
    /** SSL configuration */
    SSL?: boolean | pg.ConnectionConfig['ssl'];
    /** Maximum number of connections in the pool (default: 20) */
    MaxConnections?: number;
    /** Minimum number of connections in the pool (default: 2) */
    MinConnections?: number;
    /** Idle timeout in milliseconds (default: 30000) */
    IdleTimeoutMillis?: number;
    /** Connection timeout in milliseconds (default: 30000) */
    ConnectionTimeoutMillis?: number;
    /** MemberJunction schema name (default: __mj) */
    MJCoreSchemaName?: string;
}

/**
 * Manages the PostgreSQL connection pool lifecycle.
 * Provides a clean API for acquiring and releasing connections.
 */
export class PGConnectionManager {
    private _pool: pg.Pool | null = null;
    private _config: PGConnectionConfig | null = null;

    /**
     * Returns the active connection pool. Throws if not initialized.
     */
    get Pool(): pg.Pool {
        if (!this._pool) {
            throw new Error('PostgreSQL connection pool is not initialized. Call Initialize() first.');
        }
        return this._pool;
    }

    /**
     * Whether the pool is currently initialized and connected.
     */
    get IsConnected(): boolean {
        return this._pool != null;
    }

    /**
     * Returns the current configuration.
     */
    get Config(): PGConnectionConfig | null {
        return this._config;
    }

    /**
     * Initializes the connection pool with the given configuration.
     */
    async Initialize(config: PGConnectionConfig): Promise<void> {
        if (this._pool) {
            await this.Close();
        }

        this._config = config;
        this._pool = new pg.Pool({
            host: config.Host,
            port: config.Port ?? 5432,
            database: config.Database,
            user: config.User,
            password: config.Password,
            ssl: config.SSL ?? false,
            max: config.MaxConnections ?? 20,
            min: config.MinConnections ?? 2,
            idleTimeoutMillis: config.IdleTimeoutMillis ?? 30000,
            connectionTimeoutMillis: config.ConnectionTimeoutMillis ?? 30000,
        });

        // Verify connectivity
        const client = await this._pool.connect();
        try {
            await client.query('SELECT 1');
        } finally {
            client.release();
        }
    }

    /**
     * Acquires a client from the pool for manual connection management.
     */
    async AcquireClient(): Promise<pg.PoolClient> {
        return this.Pool.connect();
    }

    /**
     * Executes a query using the pool directly (auto-acquires and releases).
     */
    async Query<T extends pg.QueryResultRow = Record<string, unknown>>(
        text: string,
        values?: unknown[]
    ): Promise<pg.QueryResult<T>> {
        return this.Pool.query<T>(text, values);
    }

    /**
     * Closes the connection pool and releases all connections.
     */
    async Close(): Promise<void> {
        if (this._pool) {
            await this._pool.end();
            this._pool = null;
        }
    }
}
