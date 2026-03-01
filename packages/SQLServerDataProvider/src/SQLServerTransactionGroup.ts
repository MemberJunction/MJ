import { Metadata, TransactionGroupBase, TransactionResult, LogError } from "@memberjunction/core";
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
        const sqlProvider = <SQLServerDataProvider>Metadata.Provider;
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
}