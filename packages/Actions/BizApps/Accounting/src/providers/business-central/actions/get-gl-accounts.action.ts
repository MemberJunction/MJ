import { RegisterClass } from '@memberjunction/global';
import { BusinessCentralBaseAction } from '../business-central-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Interface for a GL Account (Chart of Accounts) entry from Business Central
 */
export interface BCGLAccount {
    id: string;
    number: string;
    displayName: string;
    category: string;
    subCategory: string;
    accountType: string;
    directPosting: boolean;
    balance: number;
    blocked: boolean;
    lastModifiedDateTime: Date;
    netChange: number;
    debitAmount: number;
    creditAmount: number;
    indentation: number;
}

/**
 * Action to retrieve the Chart of Accounts from Microsoft Dynamics 365 Business Central
 */
@RegisterClass(BaseAction, 'GetBusinessCentralGLAccountsAction')
export class GetBusinessCentralGLAccountsAction extends BusinessCentralBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves the Chart of Accounts (GL Accounts) from Microsoft Dynamics 365 Business Central';
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
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for Business Central API calls'
                };
            }

            // Store params for base class methods
            this.params = params.Params;

            // Build filters based on parameters
            const filters: string[] = [];
            
            const includeBlocked = this.getParamValue(params.Params, 'IncludeBlocked');
            if (!includeBlocked) {
                filters.push("blocked eq false");
            }

            const accountTypes = this.getParamValue(params.Params, 'AccountTypes');
            if (accountTypes) {
                const types = accountTypes.split(',').map((t: string) => t.trim());
                const typeFilters = types.map((type: string) => `accountType eq '${type}'`);
                if (typeFilters.length > 0) {
                    filters.push(`(${typeFilters.join(' or ')})`);
                }
            }

            const categories = this.getParamValue(params.Params, 'Categories');
            if (categories) {
                const cats = categories.split(',').map((c: string) => c.trim());
                const catFilters = cats.map((cat: string) => `category eq '${cat}'`);
                if (catFilters.length > 0) {
                    filters.push(`(${catFilters.join(' or ')})`);
                }
            }

            const minBalance = this.getParamValue(params.Params, 'MinBalance');
            if (minBalance !== undefined) {
                filters.push(`balance ge ${minBalance}`);
            }

            const maxBalance = this.getParamValue(params.Params, 'MaxBalance');
            if (maxBalance !== undefined) {
                filters.push(`balance le ${maxBalance}`);
            }

            // Select fields to retrieve
            const select = [
                'id',
                'number',
                'displayName',
                'category',
                'subCategory',
                'accountType',
                'directPosting',
                'balance',
                'blocked',
                'lastModifiedDateTime',
                'netChange',
                'debitAmount',
                'creditAmount',
                'indentation'
            ];

            // Order by
            const orderBy = 'number';

            // Max results
            const maxResults = this.getParamValue(params.Params, 'MaxResults') || 1000;

            // Execute the query
            const response = await this.queryBC<{ value: any[] }>(
                'generalLedgerAccounts',
                filters,
                select,
                undefined,
                orderBy,
                maxResults,
                contextUser
            );

            const bcAccounts = response.value || [];
            const glAccounts: BCGLAccount[] = bcAccounts.map(account => this.mapBCAccountToGLAccount(account));

            // Calculate summary
            const summary = this.calculateAccountSummary(glAccounts);

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'GLAccounts')) {
                params.Params.push({
                    Name: 'GLAccounts',
                    Type: 'Output',
                    Value: glAccounts
                });
            } else {
                params.Params.find(p => p.Name === 'GLAccounts')!.Value = glAccounts;
            }

            if (!params.Params.find(p => p.Name === 'TotalCount')) {
                params.Params.push({
                    Name: 'TotalCount',
                    Type: 'Output',
                    Value: glAccounts.length
                });
            } else {
                params.Params.find(p => p.Name === 'TotalCount')!.Value = glAccounts.length;
            }

            if (!params.Params.find(p => p.Name === 'Summary')) {
                params.Params.push({
                    Name: 'Summary',
                    Type: 'Output',
                    Value: summary
                });
            } else {
                params.Params.find(p => p.Name === 'Summary')!.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${glAccounts.length} GL accounts from Business Central`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage
            };
        }
    }

    /**
     * Maps a Business Central account to our standard GL Account interface
     */
    private mapBCAccountToGLAccount(bcAccount: any): BCGLAccount {
        return {
            id: bcAccount.id,
            number: bcAccount.number,
            displayName: bcAccount.displayName,
            category: bcAccount.category,
            subCategory: bcAccount.subCategory || '',
            accountType: bcAccount.accountType,
            directPosting: bcAccount.directPosting || false,
            balance: bcAccount.balance || 0,
            blocked: bcAccount.blocked || false,
            lastModifiedDateTime: this.parseBCDate(bcAccount.lastModifiedDateTime),
            netChange: bcAccount.netChange || 0,
            debitAmount: bcAccount.debitAmount || 0,
            creditAmount: bcAccount.creditAmount || 0,
            indentation: bcAccount.indentation || 0
        };
    }

    /**
     * Calculate account summary statistics
     */
    private calculateAccountSummary(accounts: BCGLAccount[]): any {
        const summary = {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter(a => !a.blocked).length,
            blockedAccounts: accounts.filter(a => a.blocked).length,
            postingAccounts: accounts.filter(a => a.directPosting).length,
            headerAccounts: accounts.filter(a => !a.directPosting).length,
            accountsByCategory: {} as Record<string, number>,
            accountsByType: {} as Record<string, number>,
            totalDebit: 0,
            totalCredit: 0,
            netBalance: 0
        };

        accounts.forEach(account => {
            // Count by category
            summary.accountsByCategory[account.category] = (summary.accountsByCategory[account.category] || 0) + 1;
            
            // Count by type
            summary.accountsByType[account.accountType] = (summary.accountsByType[account.accountType] || 0) + 1;
            
            // Sum totals
            summary.totalDebit += account.debitAmount;
            summary.totalCredit += account.creditAmount;
            summary.netBalance += account.balance;
        });

        return summary;
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonAccountingParams();
        
        const specificParams: ActionParam[] = [
            {
                Name: 'IncludeBlocked',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'AccountTypes',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Categories',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinBalance',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxBalance',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 1000
            }
        ];

        return [...baseParams, ...specificParams];
    }
}