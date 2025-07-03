import { RegisterClass } from '@memberjunction/global';
import { QuickBooksBaseAction } from '../quickbooks-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { UserInfo } from '@memberjunction/core';

/**
 * Interface for a GL Code (Chart of Accounts) entry
 */
export interface GLCode {
    id: string;
    code: string;
    name: string;
    type: string;
    subType: string;
    normalBalance: 'Debit' | 'Credit';
    currentBalance: number;
    active: boolean;
    parentId?: string;
    level: number;
    fullyQualifiedName: string;
}

/**
 * QuickBooks Account object structure (partial)
 */
interface QBOAccount {
    Id: string;
    Name: string;
    FullyQualifiedName: string;
    Active: boolean;
    Classification: string;
    AccountType: string;
    AccountSubType: string;
    CurrentBalance: number;
    CurrentBalanceWithSubAccounts: number;
    ParentRef?: {
        value: string;
        name: string;
    };
    AcctNum?: string;
    SubAccount: boolean;
}

/**
 * Action to retrieve the Chart of Accounts (GL Codes) from QuickBooks Online
 */
@RegisterClass(BaseAction, 'GetQuickBooksGLCodesAction')
export class GetQuickBooksGLCodesAction extends QuickBooksBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves the Chart of Accounts (GL Codes) from QuickBooks Online for a specific company';
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

            // Get parameter values
            const includeInactive = this.getParamValue(params.Params, 'IncludeInactive') || false;
            const accountTypes = this.getParamValue(params.Params, 'AccountTypes');
            const parentAccountID = this.getParamValue(params.Params, 'ParentAccountID');

            // Build the query
            let query = 'SELECT * FROM Account';
            const conditions: string[] = [];

            // Add active filter
            if (!includeInactive) {
                conditions.push('Active = true');
            }

            // Add account type filter
            if (accountTypes) {
                const types = accountTypes.split(',').map((t: string) => `'${t.trim()}'`);
                conditions.push(`AccountType IN (${types.join(',')})`);
            }

            // Add parent account filter
            if (parentAccountID) {
                conditions.push(`ParentRef = '${parentAccountID}'`);
            }

            // Add conditions to query
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            // Add ordering
            query += ' ORDER BY FullyQualifiedName';

            // Execute the query
            const response = await this.queryQBO<{ QueryResponse: { Account: QBOAccount[] } }>(
                query,
                contextUser
            );

            // Process the results
            const accounts = response.QueryResponse?.Account || [];
            const glCodes: GLCode[] = accounts.map(account => this.mapQBOAccountToGLCode(account));

            // Set output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'GLCodes',
                    Value: glCodes,
                    Type: 'Output'
                },
                {
                    Name: 'TotalCount',
                    Value: glCodes.length,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: `Successfully retrieved ${glCodes.length} GL codes from QuickBooks`
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
     * Maps a QuickBooks account to our standard GL Code interface
     */
    private mapQBOAccountToGLCode(account: QBOAccount): GLCode {
        return {
            id: account.Id,
            code: account.AcctNum || account.Id,
            name: account.Name,
            type: this.mapAccountType(account.AccountType),
            subType: account.AccountSubType,
            normalBalance: this.determineNormalBalance(account.Classification),
            currentBalance: account.CurrentBalance || 0,
            active: account.Active,
            parentId: account.ParentRef?.value,
            level: account.FullyQualifiedName.split(':').length - 1,
            fullyQualifiedName: account.FullyQualifiedName
        };
    }

    /**
     * Determines the normal balance based on account classification
     */
    private determineNormalBalance(classification: string): 'Debit' | 'Credit' {
        // In QuickBooks: Asset, Expense = Debit; Liability, Equity, Revenue = Credit
        const debitClassifications = ['Asset', 'Expense'];
        return debitClassifications.includes(classification) ? 'Debit' : 'Credit';
    }
}