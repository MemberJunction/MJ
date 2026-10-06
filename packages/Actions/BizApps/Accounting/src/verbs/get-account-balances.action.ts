import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetAccountBalances)
export class GetAccountBalancesAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetAccountBalances;

    public get Description(): string {
        return 'Retrieves account balances from the company\'s ERP as of a given date.';
    }
}
