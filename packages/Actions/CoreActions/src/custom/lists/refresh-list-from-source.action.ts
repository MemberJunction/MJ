import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListOperations } from '@memberjunction/lists';

import {
  addOutputParam,
  getBooleanParam,
  getStringParam,
  missingParam,
} from './_action-helpers';

/**
 * Refresh an existing List against its captured source view.
 *
 * `ConfirmDrops` defaults to `false` — Sync-mode refreshes that would
 * remove records will be rejected with `DROP_NOT_CONFIRMED` unless the
 * caller passes `ConfirmDrops: true`. This mirrors the UI dialog's
 * acknowledgement contract: scheduled jobs and agents must opt in
 * explicitly to data-removing operations.
 */
@RegisterClass(BaseAction, 'Refresh List From Source')
export class RefreshListFromSourceAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const listId = getStringParam(params, 'ListID');
    if (!listId) return missingParam('ListID');

    const mode = (getStringParam(params, 'Mode') ?? 'Additive') as 'Additive' | 'Sync';
    if (mode !== 'Additive' && mode !== 'Sync') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `Mode must be 'Additive' or 'Sync', got '${mode}'`,
      };
    }
    const confirmDrops = getBooleanParam(params, 'ConfirmDrops', false);

    const ops = new ListOperations(params.ContextUser, params.Provider);
    const result = await ops.RefreshFromSource(listId, mode, { ConfirmDrops: confirmDrops });

    addOutputParam(params, 'Added', result.Counts?.Added);
    addOutputParam(params, 'Removed', result.Counts?.Removed);
    addOutputParam(params, 'Failed', result.Counts?.Failed);

    return {
      Success: result.Success,
      ResultCode: result.ResultCode,
      Message: result.Message,
    };
  }
}
