import { DatabaseProviderBase, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { ActionEngineServer } from '@memberjunction/actions';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetReadOnlyProvider } from '../util.js';
import type { ProviderInfo } from '../types.js';
import { EvaluateActionRunAuthorization, IsOwner } from './actionAuthorization.js';

/**
 * Refuses an action run unless the caller is authorized for the action — see
 * {@link EvaluateActionRunAuthorization}. The `MJ: Action Authorizations` rows, the authorization
 * tree and the role grants all come from the request's provider, or all from the global provider
 * when the request carries none. Shared by every resolver that launches an action on a caller's
 * behalf, so the decision is made in one place.
 * @throws Error when the caller may not run the action
 */
export async function AssertCanRunAction(action: MJActionEntityExtended, user: UserInfo, providers: Array<ProviderInfo>): Promise<void> {
  if (IsOwner(user)) {
    return; // an Owner may run any action, so nothing needs to be read
  }
  const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
  const actionAuthorizationIDs = await LoadActionAuthorizationIDs(action.ID, provider);
  const metadata = provider ?? Metadata.Provider; // global-provider-ok: fallback only when the request carries no provider
  const actionAuthorizesCaller = ActionEngineServer.Instance.ActionAuthorizesCaller(action);
  const decision = EvaluateActionRunAuthorization(user, actionAuthorizationIDs, metadata, actionAuthorizesCaller);
  if (!decision.Allowed) {
    throw new Error(`Not authorized to run action ${action.ID}: ${decision.Reason}`);
  }
}

/**
 * The AuthorizationID of each `MJ: Action Authorizations` row for the action. Read as the system
 * user: this is the server's own authorization decision, so it must not depend on whether the
 * caller can read that entity.
 */
export async function LoadActionAuthorizationIDs(actionID: string, provider: DatabaseProviderBase | null): Promise<string[]> {
  const systemUser = UserCache.Instance.GetSystemUser();
  if (!systemUser) {
    throw new Error('System user not found');
  }
  const result = await new RunView(provider).RunView<{ AuthorizationID: string }>({
    EntityName: 'MJ: Action Authorizations',
    ExtraFilter: `ActionID='${EscapeSQLString(actionID)}'`,
    Fields: ['AuthorizationID'],
    ResultType: 'simple'
  }, systemUser);
  if (!result.Success) {
    throw new Error(`Could not read the authorizations for action ${actionID}: ${result.ErrorMessage}`);
  }
  return result.Results.map(row => row.AuthorizationID);
}
