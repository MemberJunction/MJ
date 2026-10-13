import { TransactionGroupBase, TransactionGroupProviderError, TransactionGroupRolledBackError, TransactionItem, TransactionResult, LogError } from '@memberjunction/core';
import pg from 'pg';
import { PostgreSQLDataProvider } from './PostgreSQLDataProvider.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';

/**
 * PostgreSQL implementation of the TransactionGroupBase.
 * Uses a dedicated pg.PoolClient with BEGIN/COMMIT/ROLLBACK
 * to wrap all transaction items in a single database transaction.
 *
 * All-or-nothing: an item that ran but did not do its work — a save that returned no row, or a
 * delete whose row does not report the record's keys (the generated delete function answers a
 * no-op with NULL keys) — fails the whole group exactly like a statement that threw
 * ({@link TransactionGroupBase.ItemSucceeded}), on every path: sequential with and without
 * variables, and batched. The SQL Server group applies the same rule.
 */
export class PostgreSQLTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        const returnResults: TransactionResult[] = [];
        const items = this.PendingTransactions;

        if (items.length === 0) {
            return returnResults;
        }
        // Checked before the client is taken, so a group that cannot run as one transaction writes nothing.
        PostgreSQLTransactionGroup.AssertItemsShareDataSource(items);
        items.forEach((item) => this.ProviderFor(item));

        const pool: pg.Pool = items[0].ExtraData.dataSource;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            if (this.Variables.length > 0) {
                await this.executeWithVariables(items, client, returnResults);
            } else if (this.BatchedSubmit) {
                await this.ExecuteBatched(items, client, returnResults);
            } else {
                await this.ExecuteWithoutVariables(items, client, returnResults);
            }

            await client.query('COMMIT');
        } catch (error) {
            // Every failure — an item's TransactionGroupRolledBackError included — rolls back here:
            // PostgreSQL has already aborted the transaction on a statement error, and ROLLBACK
            // returns the client to a clean state either way.
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
        returnResults: TransactionResult[]
    ): Promise<void> {
        for (const item of items) {
            await this.ExecuteSequentialItem(client, item, true, returnResults);
        }
    }

    /**
     * Executes transaction items sequentially (no variable dependencies).
     */
    protected async ExecuteWithoutVariables(
        items: TransactionItem[],
        client: pg.PoolClient,
        returnResults: TransactionResult[]
    ): Promise<void> {
        for (const item of items) {
            await this.ExecuteSequentialItem(client, item, false, returnResults);
        }
    }

    /**
     * Runs one item on the group's client (the sequential paths) and records its result. A failure —
     * a statement that threw, or an item that ran but did not do its work
     * ({@link TransactionGroupBase.ItemSucceeded}) — records the item as failed and throws
     * {@link TransactionGroupRolledBackError}, so no later item runs and {@link HandleSubmit} rolls
     * the whole group back.
     * @param withVariables The group uses transaction variables: this item's variable inputs are set
     * (regenerating a save's SQL when any were) and its outputs captured for the items after it.
     */
    protected async ExecuteSequentialItem(client: pg.PoolClient, item: TransactionItem, withVariables: boolean, returnResults: TransactionResult[]): Promise<void> {
        let row: Record<string, unknown> | null = null;
        try {
            if (withVariables) {
                await this.ApplyVariableInputs(item);
            }
            const rows = await this.executeItem(client, item);
            row = rows.length > 0 ? rows[0] : null;
            if (withVariables && row) {
                this.SetVariableValuesFromEntity(item.BaseEntity, row);
            }
            PostgreSQLTransactionGroup.ThrowIfItemFailsGroup(item, PostgreSQLTransactionGroup.ItemSucceeded(item, row));
        } catch (e) {
            returnResults.push(new TransactionResult(item, e, false));
            throw new TransactionGroupRolledBackError(e);
        }
        returnResults.push(new TransactionResult(item, row, true));
    }

    /**
     * Sets the transaction-variable values this item uses; when any were set on a create/update, the
     * item's save SQL (and its parameters) is regenerated with them.
     */
    protected async ApplyVariableInputs(item: TransactionItem): Promise<void> {
        const numValueSet = this.SetEntityValuesFromVariables(item.BaseEntity);
        if (numValueSet > 0 && item.OperationType !== 'Delete') {
            const bCreate = item.OperationType === 'Create';
            const newSqlResult = await this.ProviderFor(item).GetSaveSQL(item.BaseEntity, bCreate, item.BaseEntity.ContextCurrentUser);
            item.Instruction = newSqlResult.fullSQL;
            if (newSqlResult.parameters) {
                item.ExtraData.parameters = newSqlResult.parameters;
            }
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
    protected async ExecuteBatched(
        items: TransactionItem[],
        client: pg.PoolClient,
        returnResults: TransactionResult[]
    ): Promise<void> {
        const SENTINEL = '__mj_batch_item';
        const escapeFn = (client as unknown as { escapeLiteral?: (v: string) => string }).escapeLiteral?.bind(client);
        if (!escapeFn) {
            // No driver-provided literal escaper on this client — never hand-roll one; run sequentially.
            await this.ExecuteWithoutVariables(items, client, returnResults);
            return;
        }
        const literalFor = (value: unknown): string | undefined => {
            if (value === null || value === undefined) return 'NULL';
            switch (typeof value) {
                case 'number': return Number.isFinite(value) ? String(value) : undefined;
                case 'boolean': return value ? 'TRUE' : 'FALSE';
                case 'string': return escapeFn(value);
                default:
                    if (value instanceof Date) return escapeFn(value.toISOString());
                    // bytea parameter (a binary field): inline as PostgreSQL's hex bytea format.
                    if (value instanceof Uint8Array) {
                        return `${escapeFn('\\x' + Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex'))}::bytea`;
                    }
                    return undefined;
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
                    const position = Number(digits) - 1;
                    // An ABSENT parameter index is not a null value — it means the instruction
                    // references more placeholders than the generator supplied, i.e. the two
                    // disagree. Unreachable today (GenerateSaveSQL emits statement and parameters
                    // together), but batching is precisely the path where that disagreement would
                    // be SILENT: inlining it as NULL would write a null column instead of failing.
                    // Bail the whole group to the sequential path, where the driver raises it.
                    if (position < 0 || position >= params.length) {
                        bail = true;
                        return match;
                    }
                    const lit = literalFor(params[position]);
                    if (lit === undefined) {
                        bail = true;
                        return match;
                    }
                    return lit;
                });
            }
            if (bail) {
                await this.ExecuteWithoutVariables(items, client, returnResults);
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
            throw new TransactionGroupRolledBackError(e);
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
            // OWNERSHIP RULE: an item owns the first NON-EMPTY result after its sentinel. The
            // pg driver reports a command that returned nothing as a result with zero rows, so
            // skipping empties keeps a statement's own "no rows" from being mistaken for its
            // result set while still refusing to adopt the NEXT item's rows (the sentinel walk
            // has already moved `current` by then). A generated PostgreSQL CRUD function is one
            // statement returning one result — a cascading delete included: its child deletes
            // run inside the function body and return nothing to the client (see
            // PostgreSQLCodeGenProvider's delete strategy) — so "first non-empty" is that result.
            // The SQL Server sibling takes the LAST recordset before the next sentinel, because a
            // CascadeDeletes spDelete there returns one result set per cascaded child call ahead
            // of the record's own. Both rules are stated so the two implementations cannot drift
            // apart unnoticed.
            if (current >= 0 && current < items.length && perItem[current] === undefined && rows.length > 0) {
                perItem[current] = rows;
            }
        }
        // Judge every item before reporting any: a failed item fails the whole group (HandleSubmit
        // rolls back), so no sibling may be reported as a success first.
        const itemResults: TransactionResult[] = [];
        try {
            for (let i = 0; i < items.length; i++) {
                const rows = await this.postProcessRows(perItem[i], items[i]);
                const row = rows.length > 0 ? rows[0] : null;
                PostgreSQLTransactionGroup.ThrowIfItemFailsGroup(items[i], PostgreSQLTransactionGroup.ItemSucceeded(items[i], row));
                itemResults.push(new TransactionResult(items[i], row, true));
            }
        } catch (e) {
            for (const item of items) {
                returnResults.push(new TransactionResult(item, e, false));
            }
            throw new TransactionGroupRolledBackError(e);
        }
        returnResults.push(...itemResults);
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
        return this.postProcessRows(queryResult.rows as Record<string, unknown>[], item);
    }

    /**
     * Runs a saved record's returned row through the provider's row post-processing, as every
     * other read path does: binary columns become base64, datetimes are adjusted and encrypted
     * fields decrypted. Without it, a record saved in a transaction group would hydrate with a raw
     * Buffer or an encrypted value. Deletes return no entity row and are left alone.
     */
    private async postProcessRows(
        rows: Record<string, unknown>[] | null | undefined,
        item: TransactionItem,
    ): Promise<Record<string, unknown>[]> {
        if (!rows || rows.length === 0 || item.OperationType === 'Delete' || !item.BaseEntity) return rows ?? [];
        return this.ProviderFor(item).ProcessEntityRows(rows, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
    }

    /**
     * The provider an item's rows belong to: its own entity's provider. The item was queued by that
     * provider's save/delete path, so it is a PostgreSQLDataProvider, and its connection, metadata
     * and encryption context are the ones the item's rows must be processed (binary, datetimes,
     * decryption) and its SQL regenerated with — not the process-wide default provider, which in a
     * multi-provider process may be another database entirely.
     * @throws TransactionGroupProviderError when the record's provider is not a PostgreSQLDataProvider.
     */
    protected ProviderFor(item: TransactionItem): PostgreSQLDataProvider {
        const provider = item.BaseEntity.ProviderToUse;
        if (provider instanceof PostgreSQLDataProvider) {
            return provider;
        }
        throw new TransactionGroupProviderError(
            `${item.OperationType} of ${item.BaseEntity.EntityInfo.Name} cannot run in a PostgreSQL transaction group: its record's provider is not a PostgreSQLDataProvider`,
        );
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
