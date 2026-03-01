/**
 * SQL Server implementation of the CodeGenConnection interface.
 * Wraps mssql.ConnectionPool to provide a database-agnostic connection
 * for CodeGen orchestration code.
 */
import sql from 'mssql';
import { CodeGenConnection, CodeGenQueryResult, CodeGenTransaction } from '../../codeGenDatabaseProvider';

/**
 * SQL Server transaction implementation wrapping mssql.Transaction.
 */
class SQLServerCodeGenTransaction implements CodeGenTransaction {
    private _transaction: sql.Transaction;

    constructor(transaction: sql.Transaction) {
        this._transaction = transaction;
    }

    async query(sqlText: string): Promise<CodeGenQueryResult> {
        const request = new sql.Request(this._transaction);
        const result = await request.query(sqlText);
        return { recordset: result.recordset };
    }

    async commit(): Promise<void> {
        await this._transaction.commit();
    }

    async rollback(): Promise<void> {
        await this._transaction.rollback();
    }
}

/**
 * SQL Server implementation of CodeGenConnection.
 * Wraps an mssql.ConnectionPool and adapts it to the generic interface.
 *
 * @example
 * ```typescript
 * import sql from 'mssql';
 * const pool = await sql.connect(config);
 * const conn = new SQLServerCodeGenConnection(pool);
 *
 * // Simple query
 * const result = await conn.query("SELECT ID, Name FROM Entities");
 *
 * // Parameterized query
 * const result2 = await conn.queryWithParams(
 *     "SELECT ID FROM Entities WHERE Name = @Name",
 *     { Name: 'Users' }
 * );
 * ```
 */
export class SQLServerCodeGenConnection implements CodeGenConnection {
    private _pool: sql.ConnectionPool;

    constructor(pool: sql.ConnectionPool) {
        this._pool = pool;
    }

    /**
     * Provides access to the underlying mssql.ConnectionPool for cases
     * where SQL Server-specific functionality is needed (e.g., legacy code
     * that has not yet been fully abstracted).
     */
    public get Pool(): sql.ConnectionPool {
        return this._pool;
    }

    async query(sqlText: string): Promise<CodeGenQueryResult> {
        const result = await this._pool.request().query(sqlText);
        return { recordset: result.recordset };
    }

    async queryWithParams(sqlText: string, params: Record<string, unknown>): Promise<CodeGenQueryResult> {
        const request = this._pool.request();
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        const result = await request.query(sqlText);
        return { recordset: result.recordset };
    }

    async executeStoredProcedure(name: string, params: Record<string, unknown>): Promise<CodeGenQueryResult> {
        const request = this._pool.request();
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        const result = await request.execute(name);
        return { recordset: result.recordset };
    }

    async beginTransaction(): Promise<CodeGenTransaction> {
        const transaction = new sql.Transaction(this._pool);
        await transaction.begin();
        return new SQLServerCodeGenTransaction(transaction);
    }
}
