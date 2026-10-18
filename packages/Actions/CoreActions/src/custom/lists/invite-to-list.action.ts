import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { ListSharing } from '@memberjunction/lists';

import { AddOutputParam, GetStringParam, MissingParam } from './_action-helpers';

/**
 * Issue a pending-email invitation to share a List. Returns the
 * generated token + expiry — the caller (workflow / agent) is expected
 * to deliver an accept link to the recipient.
 *
 * Params:
 *   - ListID (required)
 *   - Email (required)
 *   - Role: 'Editor' | 'Viewer' (default 'Viewer')
 *   - TtlHours (optional; default 7 days)
 */
@RegisterClass(BaseAction, 'Invite To List')
export class InviteToListAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const listId = GetStringParam(params, 'ListID');
    const email = GetStringParam(params, 'Email');
    if (!listId) return MissingParam('ListID');
    if (!email) return MissingParam('Email');

    const role = (GetStringParam(params, 'Role') ?? 'Viewer') as 'Editor' | 'Viewer';
    if (role !== 'Editor' && role !== 'Viewer') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `Role must be Editor or Viewer (got '${role}')`,
      };
    }
    const ttlHoursRaw = GetStringParam(params, 'TtlHours');
    const ttlMs = ttlHoursRaw != null ? Number(ttlHoursRaw) * 60 * 60 * 1000 : undefined;

    const sharing = new ListSharing(params.ContextUser, params.Provider);
    const result = await sharing.Invite({ ListID: listId, Email: email, Role: role, TtlMs: ttlMs });
    AddOutputParam(params, 'InvitationID', result.InvitationID);
    AddOutputParam(params, 'Token', result.Token);
    AddOutputParam(params, 'ExpiresAt', result.ExpiresAt?.toISOString());
    return { Success: result.Success, ResultCode: result.ResultCode, Message: result.Message };
  }
}
