import { Metadata, TransactionGroupBase, TransactionItem, TransactionResult, LogError } from '@memberjunction/core';
import pg from 'pg';
import { PostgreSQLDataProvider } from './PostgreSQLDataProvider.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';
import { GroupByShape, BuildGroupSQL, SplitGroupRows } from './PostgreSQLBatchedSubmit.js';

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
        // NO variable dependencies, so no item needs another to have run first — the condition
        // under which same-shape items can travel as ONE statement instead of one round trip each.
        // The functions invoked, and therefore the CRUD procedures, Record Changes writes and save
        // events they perform, are exactly what the serial path invoked. Only the trip count moves.
        // See PostgreSQLBatchedSubmit for why grouping is by SHAPE (GenerateSaveSQL emits only the
        // fields it is saving, so two updates to one entity can differ) and why UNION ALL rather
        // than concatenation (the extended protocol carries one statement per message).
        const batchable = items.map(item => ({
            Instruction: item.Instruction,
            Params: PGQueryParameterProcessor.ProcessParameters(item.ExtraData?.parameters ?? item.Vars) ?? [],
        }));
        const perItemRows: Array<Record<string, unknown>[] | undefined> = new Array(items.length).fill(undefined);

        for (const indexes of GroupByShape(batchable)) {
            const group = BuildGroupSQL(batchable, indexes);
            try {
                const queryResult = await client.query(group.SQL, group.Params);
                const split = SplitGroupRows(queryResult.rows as Record<string, unknown>[], indexes);
                for (const idx of indexes) perItemRows[idx] = split.get(idx) ?? [];
            } catch (e) {
                // One statement to the server, so a failure fails the whole group — and the
                // transaction rolls back regardless, which is what the serial path also produced.
                for (const item of items) returnResults.push(new TransactionResult(item, e, false));
                const errorMessage = e instanceof Error ? e.message : String(e);
                throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
            }
        }

        for (let i = 0; i < items.length; i++) {
            const rows = perItemRows[i];
            const bSuccess = rows != null && rows.length > 0;
            returnResults.push(new TransactionResult(items[i], rows && rows.length > 0 ? rows[0] : rows, bSuccess));
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
