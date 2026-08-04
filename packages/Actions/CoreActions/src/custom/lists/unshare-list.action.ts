import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListSharing } from '@memberjunction/lists';

import { getStringParam, missingParam } from './_action-helpers';

/**
 * Revoke a previously-granted permission row. Soft-revokes (sets
 * `Status='Revoked'` on `MJResourcePermission`) so the audit trail
 * remains intact.
 */
@RegisterClass(BaseAction, 'Unshare List')
export class UnshareListAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const permissionId = getStringParam(params, 'PermissionID');
    if (!permissionId) return missingParam('PermissionID');

    const sharing = new ListSharing(params.ContextUser, params.Provider);
    const result = await sharing.Unshare(permissionId);
    return { Success: result.Success, ResultCode: result.ResultCode, Message: result.Message };
  }
}
