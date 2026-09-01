import { RegisterClass } from '@memberjunction/global';
import { BusinessCentralBaseAction } from '../business-central-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../../../constants';
import { AccountBalance } from '../../../types';

/**
 * Account balances from Business Central generalLedgerAccounts.
 * accountCode is the ERP account number (AM-4).
 */
@RegisterClass(BaseAction, erpPluginKey(ACCOUNTING_VERBS.GetAccountBalances, ERP_INTEGRATION.BusinessCentral))
export class GetBusinessCentralAccountBalancesAction extends BusinessCentralBaseAction {

    public get Description(): string {
        return 'Retrieves account balances from Microsoft Dynamics 365 Business Central';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for Business Central API calls',
                    Params: params.Params
                };
            }

            this.params = params.Params;

            const asOfDate = this.getParamValue(params.Params, 'AsOfDate')
                ? new Date(this.getParamValue(params.Params, 'AsOfDate'))
                : new Date();

            const filters: string[] = [];
            if (!this.getParamValue(params.Params, 'IncludeBlocked')) {
                filters.push('blocked eq false');
            }

            const categories = this.getParamValue(params.Params, 'AccountTypes');
            if (categories) {
                const cats = String(categories).split(',').map((c: string) => c.trim());
                const catFilters = cats.map((cat: string) => `category eq '${cat}'`);
                if (catFilters.length > 0) {
                    filters.push(`(${catFilters.join(' or ')})`);
                }
            }

            const maxResults = this.getParamValue(params.Params, 'MaxResults') || 1000;
            const response = await this.queryBC<{ value: any[] }>(
                'generalLedgerAccounts',
                filters,
                ['id', 'number', 'displayName', 'balance', 'category', 'accountType', 'blocked'],
                undefined,
                'number',
                maxResults,
                contextUser
            );

            const includeZero = this.getParamValue(params.Params, 'IncludeZeroBalances') !== false;
            const accountBalances: AccountBalance[] = (response.value || [])
                .map((account: any) => this.mapAccount(account, asOfDate))
                .filter((b: AccountBalance) => includeZero || b.currentBalance !== 0);

            const outputParams: ActionParam[] = [
                { Name: 'AccountBalances', Value: accountBalances, Type: 'Output' },
                { Name: 'TotalAccounts', Value: accountBalances.length, Type: 'Output' }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: `Successfully retrieved ${accountBalances.length} account balances from Business Central`
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

    private mapAccount(account: any, asOfDate: Date): AccountBalance {
        return {
            accountId: account.id,
            accountCode: account.number,
            accountName: account.displayName,
            accountType: this.mapAccountCategory(account.category) || account.category,
            currentBalance: account.balance || 0,
            asOfDate,
            isActive: !account.blocked
        };
    }

    public get Params(): ActionParam[] {
        return [
            ...this.getCommonAccountingParams(),
            { Name: 'AsOfDate', Type: 'Input', Value: null },
            { Name: 'AccountTypes', Type: 'Input', Value: null },
            { Name: 'IncludeBlocked', Type: 'Input', Value: false },
            { Name: 'IncludeZeroBalances', Type: 'Input', Value: true },
            { Name: 'MaxResults', Type: 'Input', Value: 1000 }
        ];
    }
}
