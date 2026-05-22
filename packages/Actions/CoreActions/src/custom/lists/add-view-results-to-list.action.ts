import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListOperations } from '@memberjunction/lists';

import { addOutputParam, getStringParam, missingParam } from './_action-helpers';

/**
 * Add a User View's current results to an existing List. Always additive;
 * never removes. Cannot trigger the drop-guard.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Add View Results To List',
 *   Params: [
 *     { Name: 'ViewID', Value: 'view-id' },
 *     { Name: 'ListID', Value: 'list-id' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Add View Results To List')
export class AddViewResultsToListAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const viewId = getStringParam(params, 'ViewID');
    const listId = getStringParam(params, 'ListID');
    if (!viewId) return missingParam('ViewID');
    if (!listId) return missingParam('ListID');

    const ops = new ListOperations(params.ContextUser, params.Provider);
    const result = await ops.AddViewResultsToList(viewId, listId);

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
