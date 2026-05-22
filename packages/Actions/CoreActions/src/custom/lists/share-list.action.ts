import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListSharing } from '@memberjunction/lists';
import type { ShareTarget } from '@memberjunction/lists-base';

import { addOutputParam, getStringParam, missingParam } from './_action-helpers';

/**
 * Grant a direct share on a List to a user or role. Mirrors
 * `ListSharing.Share` — idempotent at the (list, target) pair.
 *
 * Params:
 *   - ListID (required)
 *   - TargetKind: 'user' | 'role' (required)
 *   - TargetID: the UserID or RoleID matching TargetKind (required)
 *   - PermissionLevel: 'View' | 'Edit' | 'Owner' (default 'View')
 */
@RegisterClass(BaseAction, 'Share List')
export class ShareListAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const listId = getStringParam(params, 'ListID');
    const targetKind = getStringParam(params, 'TargetKind') as 'user' | 'role' | undefined;
    const targetId = getStringParam(params, 'TargetID');
    if (!listId) return missingParam('ListID');
    if (targetKind !== 'user' && targetKind !== 'role') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `TargetKind must be 'user' or 'role' (got '${targetKind ?? ''}')`,
      };
    }
    if (!targetId) return missingParam('TargetID');

    const level = (getStringParam(params, 'PermissionLevel') ?? 'View') as 'View' | 'Edit' | 'Owner';
    if (level !== 'View' && level !== 'Edit' && level !== 'Owner') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `PermissionLevel must be View | Edit | Owner (got '${level}')`,
      };
    }

    const target: ShareTarget =
      targetKind === 'user' ? { kind: 'user', userId: targetId } : { kind: 'role', roleId: targetId };

    const sharing = new ListSharing(params.ContextUser, params.Provider);
    const result = await sharing.Share({ ListID: listId, Target: target, PermissionLevel: level });
    addOutputParam(params, 'PermissionID', result.PermissionID);
    return { Success: result.Success, ResultCode: result.ResultCode, Message: result.Message };
  }
}
