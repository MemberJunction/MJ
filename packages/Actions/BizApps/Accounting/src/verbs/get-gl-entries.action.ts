import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetGLEntries)
export class GetGLEntriesAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetGLEntries;

    public get Description(): string {
        return 'Retrieves general ledger entries / transactions from the company\'s ERP.';
    }
}
