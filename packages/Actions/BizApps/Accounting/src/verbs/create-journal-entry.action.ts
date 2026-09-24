import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.CreateJournalEntry)
export class CreateJournalEntryAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.CreateJournalEntry;

    public get Description(): string {
        return 'Posts a balanced journal entry to the company\'s ERP. Dispatches to the plugin for the company\'s accounting integration.';
    }
}
