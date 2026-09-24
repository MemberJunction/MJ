import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetCustomers)
export class GetCustomersAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetCustomers;

    public get Description(): string {
        return 'Retrieves customers from the company\'s ERP.';
    }
}
