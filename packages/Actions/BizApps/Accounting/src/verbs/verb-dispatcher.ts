import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAccountingAction } from '../base/base-accounting-action';

/**
 * Dispatcher for one accounting verb. Callers/agents use the verb name;
 * this class loads the company's ERP integration and forwards to the plugin.
 */
export abstract class AccountingVerbDispatcher extends BaseAccountingAction {
    protected accountingProvider = 'ERP';
    protected integrationName = '';

    protected abstract readonly verb: string;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        return this.dispatchVerb(this.verb, params);
    }
}
