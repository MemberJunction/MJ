import { TransactionGroupBase, TransactionItem, TransactionResult } from "@memberjunction/core";
export declare class GraphQLTransactionGroup extends TransactionGroupBase {
    protected HandleSubmit(items: TransactionItem[]): Promise<TransactionResult[]>;
}
