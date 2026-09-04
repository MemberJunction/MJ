import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS } from '../constants';
import { AccountingVerbDispatcher } from './verb-dispatcher';

@RegisterClass(BaseAction, ACCOUNTING_VERBS.GetDimensions)
export class GetDimensionsAction extends AccountingVerbDispatcher {
    protected readonly verb = ACCOUNTING_VERBS.GetDimensions;

    public get Description(): string {
        return 'Retrieves dimensions and dimension values from the company\'s ERP.';
    }
}
