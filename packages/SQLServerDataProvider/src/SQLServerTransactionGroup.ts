import { Metadata, TransactionGroupBase, TransactionItem, TransactionResult, LogError } from "@memberjunction/core";
import sql from 'mssql';
import { SQLServerDataProvider } from "./SQLServerDataProvider";
import { GenericDatabaseProvider } from "@memberjunction/generic-database-provider";

/**
 * SQL Server implementation of the TransactionGroupBase
 */
export class SQLServerTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        const returnResults: TransactionResult[] = [];
        const items = this.PendingTransactions;
        const sqlProvider = <SQLServerDataProvider>Metadata.Provider; // global-provider-ok: data provider implementation, owns its provider context
        if (items.length > 0) {
            const pool: sql.ConnectionPool = items[0].ExtraData.dataSource; // Now expects a ConnectionPool
            // start a transaction, if anything fails we'll handle the rollback
            const transaction = new sql.Transaction(pool);
            
            try {
                await transaction.begin();
                
                if (this.Variables.length > 0) {
                    // need to execute in order since there are dependencies between the transaction items for the given variables
                    for (const item of items) {
                        // execute the individual query
                        let result, bSuccess: boolean = false;
                        try {
                            const numValueSet = this.SetEntityValuesFromVariables(item.BaseEntity); // set the variables that this item needs
                            if (numValueSet > 0 && item.OperationType !== 'Delete') {
                                // for creates/updates where we set 1+ variable into the entity, we need to update the instruction
                                // GetSaveSQL is async because it may need to encrypt field values
                                const bCreate = item.OperationType === 'Create';
                                const spName = sqlProvider.GetCreateUpdateSPName(item.BaseEntity, bCreate);
                                const newInstruction = await sqlProvider.GetSaveSQL(item.BaseEntity, bCreate, spName, item.BaseEntity.ContextCurrentUser);
                                item.Instruction = newInstruction; // update the instruction with the new values
                            }
                            
                            // Create a request for this transaction
                            const request = new sql.Request(transaction);
                            
                            // Add parameters if any
                            if (item.Vars && Array.isArray(item.Vars)) {
                                item.Vars.forEach((value, index) => {
                                    request.input(`p${index}`, value);
                                });
                                // Replace ? with @p0, @p1, etc. in the query
                                let paramIndex = 0;
                                item.Instruction = item.Instruction.replace(/\?/g, () => `@p${paramIndex++}`);
                            }
                            
                            // Log the SQL statement before execution
                            const description = `${item.OperationType} ${item.ExtraData?.entityName || 'entity'} (Transaction Group)`;
                            await GenericDatabaseProvider.LogSQLStatement(
                                item.Instruction,
                                item.Vars,
                                description,
                                true, // isMutation
                                item.ExtraData?.simpleSQLFallback
                            );
                            
                            const queryResult = await request.query(item.Instruction);
                            const rawResult = queryResult.recordset;
                            
                            if (rawResult && rawResult.length > 0) {
                                // Process the result to handle timezone conversions and decryption
                                result = await sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
                                this.SetVariableValuesFromEntity(item.BaseEntity, result[0]); // set the variables that this item defines after the save is done
                            }
                            bSuccess = (result && result.length > 0); // success if we have a result and it has rows 
                        }
                        catch (e) {
                            result = e; // push the exception to the result
                            bSuccess = false; // mark as failed
                            
                            // CRITICAL FIX: Immediately rollback on first failure
                            try {
                                await transaction.rollback();
                            } catch (rollbackError) {
                                LogError(`Failed to rollback after operation error: ${rollbackError}`);
                            }
                            
                            // Create result for the failed operation
                            returnResults.push(new TransactionResult(item, result, bSuccess));
                            
                            // Throw error immediately to stop processing
                            const errorMessage = e instanceof Error ? e.message : String(e);
                            throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
                        }
                        // save the results
                        returnResults.push(new TransactionResult(item, result && result.length > 0 ? result[0] : result, bSuccess));
                    }    
                }
                else if (this.BatchedSubmit) {
                    await this.executeBatchedNoVars(items, transaction, sqlProvider, returnResults);
                }
                else {
                    // execute individually since there are no variable dependencies, but we want to avoid 
                    // variable conflicts between different stored procedure calls that might use same variable names
                    for (const item of items) {
                        let result: any = null, bSuccess: boolean = false;
                        try {
                            // Create a request for this transaction
                            const request = new sql.Request(transaction);
                            
                            // Add parameters if any
                            if (item.Vars && Array.isArray(item.Vars)) {
                                item.Vars.forEach((value, index) => {
                                    request.input(`p${index}`, value);
                                });
                                // Replace ? with @p0, @p1, etc. in the query
                                let paramIndex = 0;
                                const modifiedInstruction = item.Instruction.replace(/\?/g, () => `@p${paramIndex++}`);
                                
                                // Log the SQL statement before execution
                                const description = `${item.OperationType} ${item.ExtraData?.entityName || 'entity'} (Transaction Group)`;
                                await GenericDatabaseProvider.LogSQLStatement(
                                    modifiedInstruction,
                                    item.Vars,
                                    description,
                                    true, // isMutation
                                    item.ExtraData?.simpleSQLFallback
                                );
                                
                                const queryResult = await request.query(modifiedInstruction);
                                const rawResult = queryResult.recordset;

                                if (rawResult && rawResult.length > 0) {
                                    // Process the result to handle timezone conversions and decryption
                                    result = await sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
                                }
                            } else {
                                // Log the SQL statement before execution
                                const description = `${item.OperationType} ${item.ExtraData?.entityName || 'entity'} (Transaction Group)`;
                                await GenericDatabaseProvider.LogSQLStatement(
                                    item.Instruction,
                                    item.Vars,
                                    description,
                                    true, // isMutation
                                    item.ExtraData?.simpleSQLFallback
                                );

                                const queryResult = await request.query(item.Instruction);
                                const rawResult = queryResult.recordset;

                                if (rawResult && rawResult.length > 0) {
                                    // Process the result to handle timezone conversions and decryption
                                    result = await sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
                                }
                            }
                            bSuccess = (result && result.length > 0); // success if we have a result and it has rows 
                        }
                        catch (e) {
                            result = e; // push the exception to the result
                            bSuccess = false; // mark as failed
                            
                            // CRITICAL FIX: Immediately rollback on first failure
                            try {
                                await transaction.rollback();
                            } catch (rollbackError) {
                                LogError(`Failed to rollback after operation error: ${rollbackError}`);
                            }
                            
                            // Create result for the failed operation
                            returnResults.push(new TransactionResult(item, result, bSuccess));
                            
                            // Throw error immediately to stop processing
                            const errorMessage = e instanceof Error ? e.message : String(e);
                            throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
                        }
                        // save the results
                        returnResults.push(new TransactionResult(item, result && result.length > 0 ? result[0] : result, bSuccess));
                    }
                }
                
                // NOTE: Failure checking is now handled immediately in catch blocks above
                // If we reach this point, all operations succeeded
                
                await transaction.commit();
            } catch (error) {
                // Enhanced error handling for commit failures or operation failures
                // Note: If this is an operation failure, the transaction may already be rolled back
                try {
                    // Only attempt rollback if the error doesn't indicate transaction was already rolled back
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (!errorMessage.includes('Transaction rolled back due to operation failure')) {
                        await transaction.rollback();
                    }
                } catch (rollbackError) {
                    LogError(`Failed to rollback after commit error: ${rollbackError}`);
                }
                
                // Re-throw the original error (which may already indicate rollback occurred)
                if (error instanceof Error) {
                    throw error;
                } else {
                    throw new Error(`Transaction failed: ${String(error)}. All changes have been rolled back.`);
                }
            }
        }
        return returnResults;
    }

    /**
     * Blank out string literals and comments, preserving length and line structure, so a regex can
     * scan SQL *code* without matching text that merely looks like code. Only used to locate
     * positions — every edit is applied to the original string at the offsets found here.
     */
    private static maskNonCode(sql: string): string {
        const out = sql.split('');
        let i = 0;
        while (i < sql.length) {
            const ch = sql[i];
            if (ch === "'") {
                out[i] = ' ';
                i++;
                while (i < sql.length) {
                    if (sql[i] === "'" && sql[i + 1] === "'") { out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
                    const end = sql[i] === "'";
                    out[i] = ' ';
                    i++;
                    if (end) break;
                }
                continue;
            }
            if (ch === '-' && sql[i + 1] === '-') {
                while (i < sql.length && sql[i] !== '\n') { out[i] = ' '; i++; }
                continue;
            }
            if (ch === '/' && sql[i + 1] === '*') {
                while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) { if (sql[i] !== '\n') out[i] = ' '; i++; }
                if (i < sql.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
                continue;
            }
            i++;
        }
        return out.join('');
    }

    /**
     * Give one batch item its own variable namespace.
     *
     * T-SQL scopes `DECLARE` to the BATCH, not to a statement or a `BEGIN…END` block — there is no
     * block-level declaration scope. So concatenating N generated CRUD wrappers into one batch
     * declares each wrapper's locals N times and SQL Server rejects the whole thing with
     * `The variable name '@X' has already been declared. Variable names must be unique within a
     * query batch or stored procedure.` Every wrapper declares the same three (`@ResultTable`,
     * `@ID`, and `@ResultChangesTable` when the entity tracks record changes), so this fires for
     * ANY group of two or more items — which is every group worth batching.
     *
     * The sequential path never hit this because it sends each item as its own request; its own
     * comment says it executes items individually "to avoid variable conflicts between different
     * stored procedure calls that might use same variable names". Batching gave up that isolation,
     * so it has to reintroduce it here.
     *
     * Renaming is deliberately restricted to names this item DECLARES. A generated wrapper also
     * contains named ARGUMENTS to the procedures it calls (`EXEC … @EntityName='MJ: Tasks',
     * @RecordID=…`), and those are part of the callee's signature — renaming one produces
     * `@EntityName_mjb0 is not a parameter for procedure spCreateRecordChange_Internal`. The `@pN`
     * placeholders substituted above are likewise left alone: they are request-level parameters,
     * already globally numbered, and intentionally shared across the batch.
     *
     * Only `DECLARE @name` is recognised, which covers every shape the generators emit today (one
     * variable per DECLARE). A comma-separated declaration list would leave its second and later
     * variables unscoped — that degrades to the SAME loud duplicate-name error rather than to
     * silent corruption, so it fails visibly if a generator ever starts emitting them.
     */
    public static scopeItemVariables(sql: string, index: number): string {
        const masked = SQLServerTransactionGroup.maskNonCode(sql);
        const declared = new Set<string>();
        for (const m of masked.matchAll(/\bDECLARE\s+@([A-Za-z_][A-Za-z0-9_$#@]*)/gi)) {
            declared.add(m[1].toLowerCase());
        }
        if (declared.size === 0) return sql;

        // Positions where an `@name` is a CALLEE'S PARAMETER NAME rather than a reference to one of
        // this item's locals. In `EXEC sp @ID = @ID`, the two tokens are unrelated: the left one
        // names a parameter in spCreateActionCategory's signature, the right one reads the local we
        // are renaming. Renaming the left produces `@ID_mjb2 is not a parameter for procedure
        // spCreateActionCategory` — trading the duplicate-declaration failure for a binding one.
        //
        // Position is what separates them, not spelling, and `followed by =` alone is not enough:
        // `SELECT @ID = [ID] FROM @ResultTable` is an ASSIGNMENT to the local and must be renamed.
        // So only argument lists count — spans running from an EXEC/EXECUTE to the statement end.
        const protectedStarts = new Set<number>();
        for (const execMatch of masked.matchAll(/\bEXEC(?:UTE)?\b/gi)) {
            const spanStart = execMatch.index! + execMatch[0].length;
            const semicolon = masked.indexOf(';', spanStart);
            const spanEnd = semicolon === -1 ? masked.length : semicolon;
            const span = masked.slice(spanStart, spanEnd);
            for (const arg of span.matchAll(/@([A-Za-z_][A-Za-z0-9_$#@]*)\s*=/g)) {
                protectedStarts.add(spanStart + arg.index!);
            }
        }

        const suffix = `_mjb${index}`;
        const edits: { start: number; end: number; text: string }[] = [];
        for (const m of masked.matchAll(/@([A-Za-z_][A-Za-z0-9_$#@]*)/g)) {
            const name = m[1];
            if (!declared.has(name.toLowerCase())) continue;
            const start = m.index!;
            if (protectedStarts.has(start)) continue;
            edits.push({ start, end: start + m[0].length, text: `@${name}${suffix}` });
        }
        let out = '';
        let cursor = 0;
        for (const e of edits) {
            out += sql.slice(cursor, e.start) + e.text;
            cursor = e.end;
        }
        return out + sql.slice(cursor);
    }

    /**
     * The batched submit for variable-free groups — see {@link TransactionGroupBase.BatchedSubmit}.
     * Factored out so the wire behavior (one query, sentinel mapping, parameter renumbering,
     * whole-group failure) is directly unit-testable against a fake transaction.
     */
    /**
     * ── Opt-in batched submit: ONE round trip for the whole group ───────────────────────────
     *
     * The sequential path is ATOMIC but not BATCHED: each item's generated CRUD procedure call
     * is its own round trip inside the transaction, so a 100-item group costs 100 wire hops
     * whose wall time is dominated by per-statement overhead, not SQL. Measured on a live sync:
     * ~0.3ms of server execution inside a wall cost two orders of magnitude larger per statement.
     *
     * Here the items travel together as one multi-statement batch. Everything else is unchanged:
     * the same statements, the same order, the same single transaction, per-item results still
     * mapped back to their items.
     *
     * Result mapping cannot assume one recordset per item — a statement that returns no rows
     * produces NO recordset, so a positional zip drifts. Each item is therefore preceded by a
     * sentinel SELECT of its index; recordsets between sentinel k and sentinel k+1 belong to
     * item k.
     *
     * Parameters: one request carries ONE parameter namespace, so per-item `?` placeholders are
     * renumbered into a single global @p sequence.
     */
    private async executeBatchedNoVars(
        items: TransactionItem[],
        transaction: sql.Transaction,
        sqlProvider: SQLServerDataProvider,
        returnResults: TransactionResult[]
    ): Promise<void> {
        const SENTINEL = '__mj_batch_item';
        const parts: string[] = [];
        const globalParams: unknown[] = [];
        items.forEach((item, index) => {
            parts.push(`SELECT ${index} AS [${SENTINEL}];`);
            let instruction = item.Instruction;
            if (item.Vars && Array.isArray(item.Vars) && item.Vars.length > 0) {
                const vars = item.Vars;
                let local = 0;
                instruction = instruction.replace(/\?/g, () => {
                    const g = globalParams.length;
                    globalParams.push(vars[local]);
                    local++;
                    return `@p${g}`;
                });
            }
            instruction = SQLServerTransactionGroup.scopeItemVariables(instruction, index);
            parts.push(instruction.endsWith(';') ? instruction : `${instruction};`);
        });
        const batchSQL = parts.join('\n');
        try {
            const request = new sql.Request(transaction);
            globalParams.forEach((value, index) => request.input(`p${index}`, value));

            // SQL logging is PER ITEM, matching the sequential path. `LogSQLStatement` feeds
            // migration capture, whose consumers replay statements one record at a time and read
            // each item's own `simpleSQLFallback` (the record-change-free form) — so logging the
            // combined text once under item 0's fallback would capture a batch nobody can replay
            // and attribute every row to the first entity. The batch itself is logged too, as a
            // single non-fallback entry, so a reader can still see what actually went over the
            // wire. No-ops entirely unless a SQL logging session is open.
            await GenericDatabaseProvider.LogSQLStatement(
                batchSQL,
                globalParams,
                `Batched ${items.length} operation(s) (Transaction Group)`,
                true, // isMutation
                undefined
            );
            for (const item of items) {
                await GenericDatabaseProvider.LogSQLStatement(
                    item.Instruction,
                    item.Vars ?? undefined,
                    `${item.OperationType} ${item.ExtraData?.entityName ?? item.BaseEntity.EntityInfo.Name} (Transaction Group, batched)`,
                    true, // isMutation
                    item.ExtraData?.simpleSQLFallback
                );
            }

            const queryResult = await request.query(batchSQL);
            const sets: Record<string, unknown>[][] =
                (queryResult as unknown as { recordsets?: Record<string, unknown>[][] }).recordsets
                ?? [(queryResult.recordset ?? []) as unknown as Record<string, unknown>[]];
            const perItem: (Record<string, unknown>[] | undefined)[] = new Array(items.length).fill(undefined);
            let current = -1;
            for (const rs of sets) {
                const first = rs && rs[0];
                if (first !== undefined && Object.prototype.hasOwnProperty.call(first, SENTINEL)) {
                    const idx = Number(first[SENTINEL]);
                    if (Number.isFinite(idx)) current = idx;
                    continue;
                }
                // OWNERSHIP RULE: an item owns the FIRST recordset after its sentinel, empty or
                // not. A generated CRUD procedure emits exactly one recordset, so the first is
                // the only one; taking it unconditionally means a procedure that returned zero
                // rows is reported as "no result" (Success false) rather than silently adopting
                // the NEXT item's rows. The PostgreSQL sibling skips empty results instead —
                // documented there for the same reason. Neither is reachable with generated
                // procedures; both are stated so the two cannot drift apart unnoticed.
                if (current >= 0 && current < items.length && perItem[current] === undefined) {
                    perItem[current] = rs;
                }
            }
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const raw = perItem[i];
                let result: Record<string, unknown> | null = null;
                if (raw && raw.length > 0) {
                    const processed = await sqlProvider.ProcessEntityRows(raw, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
                    result = processed && processed.length > 0 ? processed[0] : null;
                }
                returnResults.push(new TransactionResult(item, result, result != null));
            }
        }
        catch (e) {
            // One statement to the server, so a failure fails all of it — the same outcome the
            // sequential path produces, which also rolls back on the first error. Per-item
            // attribution for the failing row is the caller's degradation path (re-apply
            // individually), exactly as before.
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                LogError(`Failed to rollback after batched operation error: ${rollbackError}`);
            }
            for (const item of items)
                returnResults.push(new TransactionResult(item, e, false));
            const errorMessage = e instanceof Error ? e.message : String(e);
            throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
        }
    }
}
