import { TransactionGroupBase, TransactionResult } from "@memberjunction/core";
import { DataSource } from "typeorm";

/**
 * SQL Server implementation of the TransactionGroupBase
 */
export class SQLServerTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        const returnResults: TransactionResult[] = [];
        const items = this.PendingTransactions;
        if (items.length > 0) {
            const dataSource: DataSource = items[0].ExtraData.dataSource;
            // start a transaction, if anything fails TypeORM will handle the rollback
            await dataSource.transaction(async (transaction) => {
                if (this.Variables.length > 0) {
                    // need to execute in order since there are dependencies between the transaction items for the given variables
                    for (const item of items) {
                        // exeute the individual query
                        let result, bSuccess: boolean = false;
                        try {
                            this.SetEntityValuesFromVariables(item.BaseEntity); // set the variables that this item needs
                            result = await transaction.query(item.Instruction, item.Vars);
                            this.SetVariableValuesFromEntity(item.BaseEntity, result); // set the variables that this item defines after the save is done
                            bSuccess = result !== null 
                        }
                        catch (e) {
                            result = e; // push the exception to the result
                        }
                        // save the results
                        returnResults.push(new TransactionResult(item, result, bSuccess));
                    }    
                }
                else {
                    // can execute in parallel since there are no dependencies between the transaction items
                    const promises = [];
                    for (const item of items) {
                        promises.push(transaction.query(item.Instruction, item.Vars)); // no await, run in parallel
                    }
                    const results = await Promise.all(promises);
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        let result = null;
                        if (results[0] && results[i].length > 0) {
                            result = results[i][0]; // get the first row of the result
                        }
                        returnResults.push(new TransactionResult(item, result, result !== null));
                    }
                }
            });
        }
        return returnResults;
    }
}