import { Metadata, TransactionGroupBase, TransactionResult, LogError } from "@memberjunction/core";
import sql from 'mssql';
import { SQLServerDataProvider } from "./SQLServerDataProvider";
import { GenericDatabaseProvider } from "@memberjunction/generic-database-provider";
import { BuildBatch, SplitRecordsets } from "./SQLServerBatchedSubmit.js";

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
                else {
                    // NO variable dependencies between items, so nothing here depends on anything
                    // else having run first — which is exactly the condition under which the whole
                    // group can travel in ONE round trip instead of N. The SQL sent is byte-for-byte
                    // what the serial path sent: same generated CRUD procedures, same Record Changes
                    // writes, same save events. Only the number of trips changes. See
                    // SQLServerBatchedSubmit for why concatenation is safe here (uuid-suffixed
                    // variables, built for exactly this) and how results map back (per-item
                    // sentinels, never positional zipping — an item may return no rows at all).
                    const batch = BuildBatch(items.map(i => ({ Instruction: i.Instruction, Vars: i.Vars })));
                    try {
                        const request = new sql.Request(transaction);
                        batch.Params.forEach((value, index) => request.input(`p${index}`, value));

                        await GenericDatabaseProvider.LogSQLStatement(
                            batch.SQL,
                            batch.Params,
                            `Batched ${items.length} operation(s) (Transaction Group)`,
                            true, // isMutation
                            items[0]?.ExtraData?.simpleSQLFallback
                        );

                        const queryResult = await request.query(batch.SQL);
                        // `recordsets` is present when more than one result set returns; a
                        // single-item batch can still yield one, so fall back rather than assume.
                        const sets = (queryResult.recordsets ?? [queryResult.recordset ?? []]) as unknown as Array<Array<Record<string, unknown>>>;
                        const perItem = SplitRecordsets(sets, items.length);

                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            const raw = perItem[i];
                            let result: any = null;
                            if (raw && raw.length > 0) {
                                const processed = await sqlProvider.ProcessEntityRows(raw, item.BaseEntity.EntityInfo, item.BaseEntity.ContextCurrentUser);
                                result = processed && processed.length > 0 ? processed[0] : null;
                            }
                            returnResults.push(new TransactionResult(item, result, result != null));
                        }
                    }
                    catch (e) {
                        // The batch is ONE statement to the server, so a failure anywhere fails all
                        // of it — the same outcome the serial path produced, which also rolled back
                        // on its first error. Every item is reported failed because none landed.
                        try {
                            await transaction.rollback();
                        } catch (rollbackError) {
                            LogError(`Failed to rollback after batched operation error: ${rollbackError}`);
                        }
                        for (const item of items) returnResults.push(new TransactionResult(item, e, false));
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        throw new Error(`Transaction rolled back due to operation failure: ${errorMessage}`);
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
}