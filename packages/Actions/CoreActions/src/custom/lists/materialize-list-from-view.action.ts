import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListOperations } from '@memberjunction/lists';
import type { MaterializeOptions } from '@memberjunction/lists-base';

import {
  addOutputParam,
  getBooleanParam,
  getStringParam,
  missingParam,
} from './_action-helpers';

/**
 * Materialize a new MJ List from a User View. Thin wrapper around
 * `ListOperations.MaterializeFromView` — every drop-guard, permission, and
 * lineage semantic is owned by the core. The Action exposes the same
 * capability to agents / workflows / scheduled jobs.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Materialize List From View',
 *   Params: [
 *     { Name: 'ViewID', Value: 'abc-...' },
 *     { Name: 'ListName', Value: 'Q4 Donors' },
 *     { Name: 'RememberLineage', Value: true },
 *     { Name: 'UseSnapshot', Value: false },
 *     { Name: 'RefreshMode', Value: 'Additive' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Materialize List From View')
export class MaterializeListFromViewAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const viewId = getStringParam(params, 'ViewID');
    const listName = getStringParam(params, 'ListName');
    if (!viewId) return missingParam('ViewID');
    if (!listName) return missingParam('ListName');

    const refreshMode = (getStringParam(params, 'RefreshMode') ?? 'Additive') as 'Additive' | 'Sync';
    if (refreshMode !== 'Additive' && refreshMode !== 'Sync') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `RefreshMode must be 'Additive' or 'Sync', got '${refreshMode}'`,
      };
    }

    const opts: MaterializeOptions = {
      ListName: listName,
      CategoryId: getStringParam(params, 'CategoryID'),
      Description: getStringParam(params, 'Description'),
      RememberLineage: getBooleanParam(params, 'RememberLineage', true),
      UseSnapshot: getBooleanParam(params, 'UseSnapshot', false),
      RefreshMode: refreshMode,
    };

    const ops = new ListOperations(params.ContextUser, params.Provider);
    const result = await ops.MaterializeFromView(viewId, opts);

    addOutputParam(params, 'CreatedListID', result.CreatedListId);
    addOutputParam(params, 'Added', result.Counts?.Added);
    addOutputParam(params, 'Failed', result.Counts?.Failed);

    return {
      Success: result.Success,
      ResultCode: result.ResultCode,
      Message: result.Message,
    };
  }
}
