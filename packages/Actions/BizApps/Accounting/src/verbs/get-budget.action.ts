import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetBudget)
export class GetBudgetAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetBudget;

    public get Description(): string {
        return 'Retrieves budget entries from the company\'s ERP for a fiscal year.';
    }
}
