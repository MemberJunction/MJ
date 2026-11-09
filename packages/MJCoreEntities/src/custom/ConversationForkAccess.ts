import { AuthorizationEvaluator, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

/** The MJ Authorization that lets a person start a fork of a conversation (Fork from here, Edit or Regenerate as a fork). */
export const CONVERSATIONS_FORK_AUTHORIZATION = 'Conversations: Fork';

/**
 * True when `user` holds {@link CONVERSATIONS_FORK_AUTHORIZATION} through a role: an Allow grant and
 * no Deny on any of the user's roles (a grant of a parent authorization counts). False without a user
 * or a provider, and when the authorization is missing from the provider's metadata or inactive, so a
 * deployment that has not synced it fails closed.
 */
export function UserCanFork(
    user: UserInfo | null | undefined,
    provider: IMetadataProvider | null | undefined,
): boolean {
    if (!user || !provider) {
        return false;
    }
    const authorizations = provider.Authorizations ?? [];
    const wanted = CONVERSATIONS_FORK_AUTHORIZATION.toLowerCase();
    const grant = authorizations.find((a) => a.Name?.trim().toLowerCase() === wanted);
    if (!grant) {
        return false;
    }
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(grant, user, authorizations);
}

/** The `MJ: User Settings` key of a person's forking switch; the value `off` turns forking off for them. */
export const CONVERSATIONS_FORKING_SETTING_KEY = 'mj.conversations.forking.v1';

/** True unless the stored forking setting is `off`: no setting, an empty one or `on` mean forking is on. */
export function IsForkingSettingOn(value: string | null | undefined): boolean {
    return (value ?? '').trim().toLowerCase() !== 'off';
}
