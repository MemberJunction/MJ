/**
 * PostgreSQL implementation of the CodeGenConnection interface.
 * Wraps pg.Pool to provide a database-agnostic connection
 * for CodeGen orchestration code.
 */
import pg from 'pg';
import {
    CodeGenConnection,
    CodeGenQueryResult,
    CodeGenTransaction,
} from '@memberjunction/codegen-lib';

/**
 * PostgreSQL transaction implementation wrapping pg.PoolClient.
 */
class PostgreSQLCodeGenTransaction implements CodeGenTransaction {
    private _client: pg.PoolClient;

    constructor(client: pg.PoolClient) {
        this._client = client;
    }

    async query(sql: string): Promise<CodeGenQueryResult> {
        const result = await this._client.query(sql);
        return { recordset: result.rows };
    }

    async commit(): Promise<void> {
        await this._client.query('COMMIT');
        this._client.release();
    }

    async rollback(): Promise<void> {
        await this._client.query('ROLLBACK');
        this._client.release();
    }
}

/**
 * PostgreSQL implementation of CodeGenConnection.
 * Wraps a pg.Pool and adapts it to the generic interface.
 *
 * Parameter handling:
 * - SQL Server uses `@ParamName` for parameter placeholders
 * - PostgreSQL uses ``, ``, etc. for positional parameters
 * - This implementation translates `@ParamName` references to positional `` parameters
 *
 * @example
 * ```typescript
 * import pg from 'pg';
 * const pool = new pg.Pool({ connectionString: '...', });
 * const conn = new PostgreSQLCodeGenConnection(pool);
 *
 * // Simple query
 * const result = await conn.query("SELECT id, name FROM entities");
 *
 * // Parameterized query (uses @-prefix notation, auto-translated to $N)
 * const result2 = await conn.queryWithParams(
 *     "SELECT id FROM entities WHERE name = @Name",
 *     { Name: 'Users' }
 * );
 * ```
 */
export class PostgreSQLCodeGenConnection implements CodeGenConnection {
    private _pool: pg.Pool;

    constructor(pool: pg.Pool) {
        this._pool = pool;
    }

    /**
     * Provides access to the underlying pg.Pool for cases where
     * PostgreSQL-specific functionality is needed.
     */
    public get Pool(): pg.Pool {
        return this._pool;
    }

    async query(sql: string): Promise<CodeGenQueryResult> {
        const result = await this._pool.query(sql);
        return { recordset: result.rows };
    }

    async queryWithParams(sql: string, params: Record<string, unknown>): Promise<CodeGenQueryResult> {
        const { text, values } = this.translateParams(sql, params);
        const result = await this._pool.query(text, values);
        return { recordset: result.rows };
    }

    async executeStoredProcedure(name: string, params: Record<string, unknown>): Promise<CodeGenQueryResult> {
        // PostgreSQL uses functions instead of stored procedures.
        // Build a SELECT * FROM function_name(, , ...) call.
        const keys = Object.keys(params);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => params[k]);
        const sqlText = `SELECT * FROM ${name}(${placeholders})`;
        const result = await this._pool.query(sqlText, values);
        return { recordset: result.rows };
    }

    async beginTransaction(): Promise<CodeGenTransaction> {
        const client = await this._pool.connect();
        await client.query('BEGIN');
        return new PostgreSQLCodeGenTransaction(client);
    }

    /**
     * Translates @-prefixed parameter names to PostgreSQL positional $N parameters.
     * @param sql SQL string with @ParamName placeholders
     * @param params Named parameters
     * @returns Object with translated SQL text and ordered values array
     */
    private translateParams(sql: string, params: Record<string, unknown>): { text: string; values: unknown[] } {
        const keys = Object.keys(params);
        const values: unknown[] = [];
        let paramIndex = 0;

        // Replace each @ParamName with $N in order of appearance
        // Use word boundary to avoid replacing @ParamName inside longer identifiers
        let text = sql;
        for (const key of keys) {
            const regex = new RegExp(`@${key}\b`, 'g');
            if (regex.test(text)) {
                paramIndex++;
                values.push(params[key]);
                // Reset regex lastIndex since test() advances it
                regex.lastIndex = 0;
                text = text.replace(regex, `$${paramIndex}`);
            }
        }

        return { text, values };
    }
}
