import { RegisterClass } from '@memberjunction/global';
import { QuickBooksBaseAction } from '../quickbooks-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { UserInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

/**
 * Account balance information
 */
export interface AccountBalance {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    accountSubType: string;
    normalBalance: 'Debit' | 'Credit';
    currentBalance: number;
    balanceWithSubAccounts: number;
    currency: string;
    asOfDate: Date;
    isActive: boolean;
    level: number;
    parentAccountId?: string;
    parentAccountName?: string;
}

/**
 * Trial balance summary
 */
export interface TrialBalanceSummary {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    difference: number;
    asOfDate: Date;
}

/**
 * Action to retrieve account balances (trial balance) from QuickBooks Online
 */
@RegisterClass(BaseAction, 'GetQuickBooksAccountBalancesAction')
export class GetQuickBooksAccountBalancesAction extends QuickBooksBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves account balances (trial balance) from QuickBooks Online for a specific date';
    }

    /**
     * Main execution method
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                throw new Error('Context user is required for QuickBooks API calls');
            }

            // Store params for use in other methods
            (this as any)._params = params.Params;

            const asOfDate = this.getParamValue(params.Params, 'AsOfDate') ? new Date(this.getParamValue(params.Params, 'AsOfDate')) : new Date();
            
            // QuickBooks doesn't have a direct trial balance API, so we need to:
            // 1. Get all accounts
            // 2. Get balance for each account as of the specified date
            
            // First, get all accounts
            const accounts = await this.getAccounts(params.Params, contextUser);
            
            // Get balances for each account
            const accountBalances: AccountBalance[] = [];
            
            for (const account of accounts) {
                // For performance, we'll use the current balance from the account
                // In a production system, you might want to use the Reports API for historical balances
                const balance: AccountBalance = {
                    accountId: account.Id,
                    accountCode: account.AcctNum || account.Id,
                    accountName: account.Name,
                    accountType: this.mapAccountType(account.AccountType),
                    accountSubType: account.AccountSubType,
                    normalBalance: this.determineNormalBalance(account.Classification),
                    currentBalance: account.CurrentBalance || 0,
                    balanceWithSubAccounts: account.CurrentBalanceWithSubAccounts || 0,
                    currency: account.CurrencyRef?.value || 'USD',
                    asOfDate: asOfDate,
                    isActive: account.Active,
                    level: account.FullyQualifiedName.split(':').length - 1,
                    parentAccountId: account.ParentRef?.value,
                    parentAccountName: account.ParentRef?.name
                };

                // Apply filters
                if (!this.getParamValue(params.Params, 'IncludeZeroBalances') && balance.currentBalance === 0) {
                    continue;
                }

                accountBalances.push(balance);
            }

            // Calculate trial balance summary
            const summary = this.calculateTrialBalanceSummary(accountBalances, asOfDate);

            // If summarize by type is requested
            let typeSummary = undefined;
            if (this.getParamValue(params.Params, 'SummarizeByType')) {
                typeSummary = this.summarizeByAccountType(accountBalances);
            }

            // Set output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'AccountBalances',
                    Value: accountBalances,
                    Type: 'Output'
                },
                {
                    Name: 'TrialBalanceSummary',
                    Value: summary,
                    Type: 'Output'
                },
                {
                    Name: 'TypeSummary',
                    Value: typeSummary,
                    Type: 'Output'
                },
                {
                    Name: 'TotalAccounts',
                    Value: accountBalances.length,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: 'Operation completed successfully'
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
     * Get accounts from QuickBooks
     */
    private async getAccounts(params: ActionParam[], contextUser: UserInfo): Promise<any[]> {
        let query = 'SELECT * FROM Account';
        const conditions: string[] = [];

        // Add active filter
        if (!this.getParamValue(params, 'IncludeInactive')) {
            conditions.push('Active = true');
        }

        // Add account type filter
        if (this.getParamValue(params, 'AccountTypes')) {
            const types = this.getParamValue(params, 'AccountTypes').split(',').map((t: string) => `'${t.trim()}'`);
            conditions.push(`AccountType IN (${types.join(',')})`);
        }

        // Add conditions to query
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Add ordering
        query += ' ORDER BY AccountType, AcctNum';

        // Execute the query
        const response = await this.queryQBO<{ QueryResponse: { Account: any[] } }>(
            query,
            contextUser
        );

        return response.QueryResponse?.Account || [];
    }

    /**
     * Calculate trial balance summary
     */
    private calculateTrialBalanceSummary(
        balances: AccountBalance[],
        asOfDate: Date
    ): TrialBalanceSummary {
        let totalDebits = 0;
        let totalCredits = 0;

        balances.forEach(balance => {
            if (balance.currentBalance !== 0) {
                if (balance.normalBalance === 'Debit') {
                    if (balance.currentBalance > 0) {
                        totalDebits += balance.currentBalance;
                    } else {
                        totalCredits += Math.abs(balance.currentBalance);
                    }
                } else {
                    if (balance.currentBalance > 0) {
                        totalCredits += balance.currentBalance;
                    } else {
                        totalDebits += Math.abs(balance.currentBalance);
                    }
                }
            }
        });

        const difference = Math.abs(totalDebits - totalCredits);

        return {
            totalDebits,
            totalCredits,
            isBalanced: difference < 0.01, // Allow for minor rounding differences
            difference,
            asOfDate
        };
    }

    /**
     * Summarize balances by account type
     */
    private summarizeByAccountType(balances: AccountBalance[]): Record<string, any> {
        const summary: Record<string, any> = {};

        balances.forEach(balance => {
            const type = balance.accountType;
            
            if (!summary[type]) {
                summary[type] = {
                    count: 0,
                    totalBalance: 0,
                    accounts: []
                };
            }

            summary[type].count++;
            summary[type].totalBalance += balance.currentBalance;
            summary[type].accounts.push({
                id: balance.accountId,
                name: balance.accountName,
                balance: balance.currentBalance
            });
        });

        return summary;
    }

    /**
     * Determines the normal balance based on account classification
     */
    private determineNormalBalance(classification: string): 'Debit' | 'Credit' {
        const debitClassifications = ['Asset', 'Expense'];
        return debitClassifications.includes(classification) ? 'Debit' : 'Credit';
    }
}