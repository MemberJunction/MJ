import { Metadata, TransactionGroupBase, TransactionResult } from "@memberjunction/core";
import * as sql from 'mssql';
import { SQLServerDataProvider } from "./SQLServerDataProvider";

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
                                const bCreate = item.OperationType === 'Create';
                                const spName = sqlProvider.GetCreateUpdateSPName(item.BaseEntity, bCreate);
                                const newInstruction = sqlProvider.GetSaveSQL(item.BaseEntity, bCreate, spName, item.BaseEntity.ContextCurrentUser);
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
                            
                            const queryResult = await request.query(item.Instruction);
                            const rawResult = queryResult.recordset;
                            
                            if (rawResult && rawResult.length > 0) {
                                // Process the result to handle timezone conversions
                                result = sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo);
                                this.SetVariableValuesFromEntity(item.BaseEntity, result[0]); // set the variables that this item defines after the save is done
                            }
                            bSuccess = (result && result.length > 0); // success if we have a result and it has rows 
                        }
                        catch (e) {
                            result = e; // push the exception to the result
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
                                const queryResult = await request.query(modifiedInstruction);
                                const rawResult = queryResult.recordset;
                                
                                if (rawResult && rawResult.length > 0) {
                                    // Process the result to handle timezone conversions
                                    result = sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo);
                                }
                            } else {
                                const queryResult = await request.query(item.Instruction);
                                const rawResult = queryResult.recordset;
                                
                                if (rawResult && rawResult.length > 0) {
                                    // Process the result to handle timezone conversions
                                    result = sqlProvider.ProcessEntityRows(rawResult, item.BaseEntity.EntityInfo);
                                }
                            }
                            bSuccess = (result && result.length > 0); // success if we have a result and it has rows 
                        }
                        catch (e) {
                            result = e; // push the exception to the result
                        }
                        // save the results
                        returnResults.push(new TransactionResult(item, result && result.length > 0 ? result[0] : result, bSuccess));
                    }
                }
                
                await transaction.commit();
            } catch (error) {
                // Rollback on any error
                await transaction.rollback();
                throw error;
            }
        }
        return returnResults;
    }
}