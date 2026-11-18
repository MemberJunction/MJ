import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetVendorBills)
export class GetVendorBillsAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetVendorBills;

    public get Description(): string {
        return 'Retrieves open or posted vendor bills (AP) from the company\'s ERP.';
    }
}
