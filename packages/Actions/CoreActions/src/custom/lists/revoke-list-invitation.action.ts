import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListSharing } from '@memberjunction/lists';

import { getStringParam, missingParam } from './_action-helpers';

/**
 * Revoke a pending List invitation before acceptance. Once an invitation
 * has been accepted, callers should `Unshare List` the resulting
 * permission row instead — this action returns `INVITATION_ALREADY_USED`
 * in that case.
 */
@RegisterClass(BaseAction, 'Revoke List Invitation')
export class RevokeListInvitationAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const invitationId = getStringParam(params, 'InvitationID');
    if (!invitationId) return missingParam('InvitationID');

    const sharing = new ListSharing(params.ContextUser, params.Provider);
    const result = await sharing.RevokeInvitation(invitationId);
    return { Success: result.Success, ResultCode: result.ResultCode, Message: result.Message };
  }
}
