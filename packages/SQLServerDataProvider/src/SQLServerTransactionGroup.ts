import { TransactionGroupBase, TransactionItem, TransactionResult } from "@memberjunction/core";
import { DataSource } from "typeorm";

export class SQLServerTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(items: TransactionItem[]): Promise<TransactionResult[]> {
        const returnResults: TransactionResult[] = [];
        if (items.length > 0) {
            const dataSource: DataSource = items[0].ExtraData.dataSource;
            // start a transaction, if anything fails TypeORM will handle the rollback
            await dataSource.transaction(async (transaction) => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    // exeute the individual query
                    let result, bSuccess: boolean = false;
                    try {
                        result = await transaction.query(item.Instruction, item.Vars);
                        bSuccess = result !== null 
                    }
                    catch (e) {
                        result = e; // push the exception to the result
                    }
                    // save the results
                    returnResults.push(new TransactionResult(item, result, bSuccess));
                }
            });
        }
        return returnResults;
    }
}