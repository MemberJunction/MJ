import { RegisterClass } from '@memberjunction/global';
import { QuickBooksBaseAction } from '../quickbooks-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Standard transaction interface
 */
export interface Transaction {
    id: string;
    transactionType: string;
    transactionNumber?: string;
    transactionDate: Date;
    amount: number;
    currency: string;
    status?: string;
    referenceNumber?: string;
    memo?: string;
    entityName?: string; // Customer/Vendor name
    entityId?: string;
    lines: TransactionLine[];
    metadata: Record<string, any>; // Store original QB data
}

export interface TransactionLine {
    id: string;
    lineNumber: number;
    description?: string;
    amount: number;
    accountId?: string;
    accountName?: string;
    itemId?: string;
    itemName?: string;
    quantity?: number;
    rate?: number;
}

/**
 * Action to retrieve transactions from QuickBooks Online
 */
@RegisterClass(BaseAction, 'GetQuickBooksTransactionsAction')
export class GetQuickBooksTransactionsAction extends QuickBooksBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves transactions from QuickBooks Online with flexible filtering options';
    }


    /**
     * Main execution method
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR_NO_CONTEXT_USER',
                    Message: 'Context user is required for QuickBooks API calls',
                    Params: params.Params
                };
            }

            // Store params for use in other methods
            (this as any)._params = params.Params;

            const transactionType = this.getParamValue(params.Params, 'TransactionType');
            const transactions: Transaction[] = [];

            if (transactionType) {
                // Get specific transaction type
                const result = await this.getTransactionsByType(transactionType, params, contextUser);
                transactions.push(...result);
            } else {
                // Get all transaction types
                const types = ['Invoice', 'Bill', 'Payment', 'JournalEntry', 'Deposit', 'Purchase'];
                
                for (const type of types) {
                    try {
                        const result = await this.getTransactionsByType(type, params, contextUser);
                        transactions.push(...result);
                    } catch (error) {
                        // Log but continue with other types
                        console.warn(`Failed to retrieve ${type} transactions:`, error);
                    }
                }
            }

            // Sort by date descending
            transactions.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());

            // Apply max results limit
            const maxResults = Math.min(this.getParamValue(params.Params, 'MaxResults') || 100, 1000);
            const limitedTransactions = transactions.slice(0, maxResults);

            // Create output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'Transactions',
                    Value: limitedTransactions,
                    Type: 'Output'
                },
                {
                    Name: 'TotalCount',
                    Value: limitedTransactions.length,
                    Type: 'Output'
                },
                {
                    Name: 'HasMore',
                    Value: transactions.length > maxResults,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${limitedTransactions.length} transactions`,
                Params: [...params.Params, ...outputParams]
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage,
                Params: params.Params
            };
        }
    }

    /**
     * Get transactions of a specific type
     */
    private async getTransactionsByType(
        type: string,
        params: RunActionParams,
        contextUser: any
    ): Promise<Transaction[]> {
        // Build query for specific transaction type
        let query = `SELECT * FROM ${type}`;
        const conditions: string[] = [];

        // Add date range filter
        const startDate = this.getParamValue(params.Params, 'StartDate');
        const endDate = this.getParamValue(params.Params, 'EndDate');
        
        if (startDate) {
            conditions.push(`TxnDate >= '${this.formatQBODate(new Date(startDate))}'`);
        }
        if (endDate) {
            conditions.push(`TxnDate <= '${this.formatQBODate(new Date(endDate))}'`);
        }

        // Add amount filters
        const minAmount = this.getParamValue(params.Params, 'MinAmount');
        const maxAmount = this.getParamValue(params.Params, 'MaxAmount');
        
        if (minAmount !== undefined) {
            conditions.push(`TotalAmt >= ${minAmount}`);
        }
        if (maxAmount !== undefined) {
            conditions.push(`TotalAmt <= ${maxAmount}`);
        }

        // Add entity filter based on transaction type
        const entityId = this.getParamValue(params.Params, 'EntityID');
        if (entityId) {
            if (['Invoice', 'Payment', 'Deposit'].includes(type)) {
                conditions.push(`CustomerRef = '${entityId}'`);
            } else if (['Bill', 'Purchase'].includes(type)) {
                conditions.push(`VendorRef = '${entityId}'`);
            }
        }

        // Add conditions to query
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Add ordering and limit
        query += ' ORDER BY TxnDate DESC';
        query += ` MAXRESULTS ${this.getParamValue(params.Params, 'MaxResults') || 100}`;

        // Execute the query
        const response = await this.queryQBO<{ QueryResponse: { [key: string]: any[] } }>(
            query,
            contextUser
        );

        const qbTransactions = response.QueryResponse?.[type] || [];
        return qbTransactions.map(qbTxn => this.mapQuickBooksTransaction(type, qbTxn));
    }

    /**
     * Map QuickBooks transaction to standard format
     */
    private mapQuickBooksTransaction(type: string, qbTxn: any): Transaction {
        const transaction: Transaction = {
            id: qbTxn.Id,
            transactionType: type,
            transactionNumber: qbTxn.DocNumber,
            transactionDate: this.parseQBODate(qbTxn.TxnDate),
            amount: qbTxn.TotalAmt || 0,
            currency: qbTxn.CurrencyRef?.value || 'USD',
            status: this.getTransactionStatus(type, qbTxn),
            referenceNumber: qbTxn.PrivateNote || qbTxn.CustomerMemo?.value,
            memo: qbTxn.Memo,
            entityName: this.getEntityName(type, qbTxn),
            entityId: this.getEntityId(type, qbTxn),
            lines: this.mapTransactionLines(type, qbTxn),
            metadata: qbTxn
        };

        return transaction;
    }

    /**
     * Get transaction status based on type
     */
    private getTransactionStatus(type: string, qbTxn: any): string {
        switch (type) {
            case 'Invoice':
                return qbTxn.Balance > 0 ? 'Unpaid' : 'Paid';
            case 'Bill':
                return qbTxn.Balance > 0 ? 'Unpaid' : 'Paid';
            case 'Payment':
                return 'Completed';
            case 'JournalEntry':
                return 'Posted';
            default:
                return qbTxn.TxnStatus || 'Unknown';
        }
    }

    /**
     * Get entity name based on transaction type
     */
    private getEntityName(type: string, qbTxn: any): string | undefined {
        if (['Invoice', 'Payment', 'Deposit'].includes(type)) {
            return qbTxn.CustomerRef?.name;
        } else if (['Bill', 'Purchase'].includes(type)) {
            return qbTxn.VendorRef?.name;
        }
        return undefined;
    }

    /**
     * Get entity ID based on transaction type
     */
    private getEntityId(type: string, qbTxn: any): string | undefined {
        if (['Invoice', 'Payment', 'Deposit'].includes(type)) {
            return qbTxn.CustomerRef?.value;
        } else if (['Bill', 'Purchase'].includes(type)) {
            return qbTxn.VendorRef?.value;
        }
        return undefined;
    }

    /**
     * Map transaction lines
     */
    private mapTransactionLines(type: string, qbTxn: any): TransactionLine[] {
        const lines: TransactionLine[] = [];
        const qbLines = qbTxn.Line || [];

        qbLines.forEach((line: any, index: number) => {
            // Skip summary lines
            if (line.DetailType === 'SubTotalLineDetail') {
                return;
            }

            const mappedLine: TransactionLine = {
                id: line.Id || `${qbTxn.Id}-${index}`,
                lineNumber: index + 1,
                description: line.Description,
                amount: line.Amount || 0,
                accountId: this.getLineAccountId(line),
                accountName: this.getLineAccountName(line),
                itemId: line.SalesItemLineDetail?.ItemRef?.value || line.ItemBasedExpenseLineDetail?.ItemRef?.value,
                itemName: line.SalesItemLineDetail?.ItemRef?.name || line.ItemBasedExpenseLineDetail?.ItemRef?.name,
                quantity: line.SalesItemLineDetail?.Qty || line.ItemBasedExpenseLineDetail?.Qty,
                rate: line.SalesItemLineDetail?.UnitPrice || line.ItemBasedExpenseLineDetail?.UnitPrice
            };

            lines.push(mappedLine);
        });

        return lines;
    }

    /**
     * Get account ID from line detail
     */
    private getLineAccountId(line: any): string | undefined {
        return line.AccountBasedExpenseLineDetail?.AccountRef?.value ||
               line.DepositLineDetail?.AccountRef?.value ||
               line.JournalEntryLineDetail?.AccountRef?.value;
    }

    /**
     * Get account name from line detail
     */
    private getLineAccountName(line: any): string | undefined {
        return line.AccountBasedExpenseLineDetail?.AccountRef?.name ||
               line.DepositLineDetail?.AccountRef?.name ||
               line.JournalEntryLineDetail?.AccountRef?.name;
    }
}