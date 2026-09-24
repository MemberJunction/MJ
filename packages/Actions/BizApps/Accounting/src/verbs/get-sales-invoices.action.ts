import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetSalesInvoices)
export class GetSalesInvoicesAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetSalesInvoices;

    public get Description(): string {
        return 'Retrieves sales invoices from the company\'s ERP.';
    }
}
