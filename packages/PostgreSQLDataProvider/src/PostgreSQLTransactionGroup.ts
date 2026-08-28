import { Metadata, TransactionGroupBase, TransactionItem, TransactionResult, LogError } from '@memberjunction/core';
import pg from 'pg';
import { PostgreSQLDataProvider } from './PostgreSQLDataProvider.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';

/**
 * PostgreSQL implementation of the TransactionGroupBase.
 * Uses a dedicated pg.PoolClient with BEGIN/COMMIT/ROLLBACK
 * to wrap all transaction items in a single database transaction.
 */
export class PostgreSQLTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        const returnResults: TransactionResult[] = [];
        const items = this.PendingTransactions;
        const pgProvider = Metadata.Provider as PostgreSQLDataProvider; // global-provider-ok: data provider implementation, owns its provider context

        if (items.length === 0) {
            return returnResults;
        }

        const pool: pg.Pool = items[0].ExtraData.dataSource;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            if (this.Variables.length > 0) {
                await this.executeWithVariables(items, client, pgProvider, returnResults);
            } else if (this.BatchedSubmit) {
                await this.executeBatched(items, client, returnResults);
            } else {
                await this.executeWithoutVariables(items, client, returnResults);
            }

            await client.query('COMMIT');
        } catch (error) {
            await this.safeRollback(client);
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Transaction failed: ${String(error)}. All changes have been rolled back.`);
        } finally {
            client.release();
        }

        return returnResults;
    }

    /**
     * Executes transaction items sequentially when there are variable dependencies between them.
     */
    private async executeWithVariables(
        items: TransactionItem[],
        client: pg.PoolClient,
        pgProvider: PostgreSQLDataProvider,
        returnResults: TransactionResult[]
    ): Promise<void> {
        for (const item of items) {
            let result: Record<string, unknown>[] | undefined;
            let bSuccess = false;
            try {
                const numValueSet = this.SetEntityValuesFromVariables(item.BaseEntity);
                if (numValueSet > 0 && item.OperationType !== 'Delete') {
                    // Values changed — regenerate the SQL instruction
                    const bCreate = item.OperationType === 'Create';
                    const newSqlResult = await pgProvider.GetSaveSQL(item.BaseEntity, bCreate, item.BaseEntity.ContextCurrentUser);
                    item.Instruction = newSqlResult.fullSQL;
                    if (newSqlResult.parameters) {
                        item.ExtraData.parameters = newSqlResult.parameters;
                    }
                }

                result = await this.executeItem(client, item);
                if (result && result.length > 0) {
                    this.SetVariableValuesFromEntity(item.BaseEntity, result[0]);
                }
                bSuccess = (result != null && result.length > 0);
            } catch (e) {
                returnResults.push(new TransactionResult(item, e, false));
                const errorMessage = e instanceof Error ? e.message : String(e);
                throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
            }
            returnResults.push(new TransactionResult(item, result && result.length > 0 ? result[0] : result, bSuccess));
        }
    }

    /**
     * Executes transaction items sequentially (no variable dependencies).
     */
    private async executeWithoutVariables(
        items: TransactionItem[],
        client: pg.PoolClient,
        returnResults: TransactionResult[]
    ): Promise<void> {
        for (const item of items) {
            let result: Record<string, unknown>[] | undefined;
            let bSuccess = false;
            try {
                result = await this.executeItem(client, item);
                bSuccess = (result != null && result.length > 0);
            } catch (e) {
                returnResults.push(new TransactionResult(item, e, false));
                const errorMessage = e instanceof Error ? e.message : String(e);
                throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
            }
            returnResults.push(new TransactionResult(item, result && result.length > 0 ? result[0] : result, bSuccess));
        }
    }

    /**
     * ── Opt-in batched submit: ONE round trip for the whole group ───────────────────────────
     *
     * The sequential path costs one round trip per item; a 100-item group pays 100 wire hops
     * whose wall time is dominated by per-statement overhead, not SQL. Here the items travel
     * together as ONE multi-statement text (PostgreSQL's simple query protocol returns one
     * result per statement, in order), inside the same transaction, with per-item results
     * mapped back via sentinel SELECTs — a statement that returns no rows produces a result
     * with no rows, so sentinels keep the mapping exact rather than positional-by-luck.
     *
     * The extended protocol cannot carry $N parameters in multi-statement text, so parameter
     * values are inlined as SQL literals through the driver's own `escapeLiteral`. Only values
     * with an unambiguous literal form are inlined (string, finite number, boolean,
     * null/undefined, Date); if ANY item carries a value outside that set, the whole group
     * falls back to the sequential path — correctness first, batching second.
     */
    private async executeBatched(
        items: TransactionItem[],
        client: pg.PoolClient,
        returnResults: TransactionResult[]
    ): Promise<void> {
        const SENTINEL = '__mj_batch_item';
        const escapeFn = (client as unknown as { escapeLiteral?: (v: string) => string }).escapeLiteral?.bind(client);
        if (!escapeFn) {
            // No driver-provided literal escaper on this client — never hand-roll one; run sequentially.
            await this.executeWithoutVariables(items, client, returnResults);
            return;
        }
        const literalFor = (value: unknown): string | undefined => {
            if (value === null || value === undefined) return 'NULL';
            switch (typeof value) {
                case 'number': return Number.isFinite(value) ? String(value) : undefined;
                case 'boolean': return value ? 'TRUE' : 'FALSE';
                case 'string': return escapeFn(value);
                default:
                    return value instanceof Date ? escapeFn(value.toISOString()) : undefined;
            }
        };

        const parts: string[] = [];
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const rawParams = item.ExtraData?.parameters ?? item.Vars;
            const params = PGQueryParameterProcessor.ProcessParameters(rawParams) ?? [];
            let bail = false;
            let inlined = item.Instruction;
            if (params.length > 0) {
                inlined = inlined.replace(/\$(\d+)\b/g, (match, digits) => {
                    const lit = literalFor(params[Number(digits) - 1]);
                    if (lit === undefined) {
                        bail = true;
                        return match;
                    }
                    return lit;
                });
            }
            if (bail) {
                await this.executeWithoutVariables(items, client, returnResults);
                return;
            }
            parts.push(`SELECT ${index} AS ${SENTINEL};`);
            parts.push(inlined.endsWith(';') ? inlined : `${inlined};`);
        }

        let rawResults: pg.QueryResult[];
        try {
            const combined = await client.query(parts.join('\n'));
            rawResults = Array.isArray(combined) ? combined : [combined];
        } catch (e) {
            // One text to the server, so a failure fails all of it — the same outcome the
            // sequential path produces, which also rolls back on the first error. Per-item
            // attribution for the failing row is the caller's degradation path.
            for (const item of items) {
                returnResults.push(new TransactionResult(item, e, false));
            }
            const errorMessage = e instanceof Error ? e.message : String(e);
            throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
        }

        const perItem: (Record<string, unknown>[] | undefined)[] = new Array(items.length).fill(undefined);
        let current = -1;
        for (const rs of rawResults) {
            const rows = (rs?.rows ?? []) as Record<string, unknown>[];
            const first = rows[0];
            if (first !== undefined && Object.prototype.hasOwnProperty.call(first, SENTINEL)) {
                const idx = Number(first[SENTINEL]);
                if (Number.isFinite(idx)) {
                    current = idx;
                }
                continue;
            }
            if (current >= 0 && current < items.length && perItem[current] === undefined && rows.length > 0) {
                perItem[current] = rows;
            }
        }
        for (let i = 0; i < items.length; i++) {
            const rows = perItem[i];
            const ok = rows != null && rows.length > 0;
            returnResults.push(new TransactionResult(items[i], ok ? rows![0] : rows, ok));
        }
    }

    /**
     * Executes a single transaction item against the given client connection.
     */
    private async executeItem(client: pg.PoolClient, item: TransactionItem): Promise<Record<string, unknown>[]> {
        // The parameters come from GenerateSaveSQL/GenerateDeleteSQL as an array of values
        // for $1, $2, ... placeholders. They may be stored in ExtraData.parameters (set during
        // transaction creation) or in Vars (set by AddTransaction in the base class).
        const rawParams = item.ExtraData?.parameters ?? item.Vars;
        const params = PGQueryParameterProcessor.ProcessParameters(rawParams);

        const queryResult = await client.query(item.Instruction, params);
        return queryResult.rows as Record<string, unknown>[];
    }

    /**
     * Safely attempts a rollback, suppressing errors from already-rolled-back transactions.
     */
    private async safeRollback(client: pg.PoolClient): Promise<void> {
        try {
            // PostgreSQL automatically aborts the transaction on error,
            // but we still issue ROLLBACK to return the client to a clean state.
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            LogError(`Failed to rollback: ${rollbackError}`);
        }
    }
}
