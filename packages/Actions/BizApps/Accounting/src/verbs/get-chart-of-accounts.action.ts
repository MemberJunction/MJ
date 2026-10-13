import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetChartOfAccounts)
export class GetChartOfAccountsAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetChartOfAccounts;

    public get Description(): string {
        return 'Retrieves the chart of accounts from the company\'s ERP.';
    }
}
