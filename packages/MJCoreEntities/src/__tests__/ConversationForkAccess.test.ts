import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { CONVERSATIONS_FORK_AUTHORIZATION, CONVERSATIONS_FORKING_SETTING_KEY, IsForkingSettingOn, UserCanFork } from '../custom/ConversationForkAccess';

/** The authorization a person needs to start a fork, resolved from roles: Allow grants, any Deny vetoes. */
const FORK_ID = 'AUTH-FORK';
const UI_ROLE = 'ROLE-UI';
const GUEST_ROLE = 'ROLE-GUEST';
const PORTAL_ROLE = 'ROLE-PORTAL';

function user(roleIDs: string[]): UserInfo {
    return new UserInfo(null, { ID: 'u-1', Type: 'User', UserRoles: roleIDs.map((RoleID) => ({ UserID: 'u-1', RoleID })) });
}

function provider(authorizations: AuthorizationInfo[]): IMetadataProvider {
    return { Authorizations: authorizations } as unknown as IMetadataProvider;
}

const grant = new AuthorizationInfo({ ID: FORK_ID, Name: CONVERSATIONS_FORK_AUTHORIZATION, ParentID: null, IsActive: true });

describe('UserCanFork', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
            AuthorizationRoles: [
                new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: FORK_ID, RoleID: UI_ROLE, Type: 'Allow' }),
                new AuthorizationRoleInfo({ ID: 'ar-2', AuthorizationID: FORK_ID, RoleID: PORTAL_ROLE, Type: 'Deny' }),
            ],
        } as unknown as IMetadataProvider);
    });

    it('names the authorization', () => {
        expect(CONVERSATIONS_FORK_AUTHORIZATION).toBe('Conversations: Fork');
    });

    it('allows a person whose role is granted it', () => {
        expect(UserCanFork(user([UI_ROLE]), provider([grant]))).toBe(true);
    });

    it('refuses a person whose roles are not granted it', () => {
        expect(UserCanFork(user([GUEST_ROLE]), provider([grant]))).toBe(false);
    });

    it('refuses a person with a Deny role even when another role allows it', () => {
        expect(UserCanFork(user([UI_ROLE, PORTAL_ROLE]), provider([grant]))).toBe(false);
    });

    it('fails closed when the authorization is not in the metadata, or inactive', () => {
        expect(UserCanFork(user([UI_ROLE]), provider([]))).toBe(false);
        const inactive = new AuthorizationInfo({ ID: FORK_ID, Name: CONVERSATIONS_FORK_AUTHORIZATION, ParentID: null, IsActive: false });
        expect(UserCanFork(user([UI_ROLE]), provider([inactive]))).toBe(false);
    });

    it('fails closed without a user or a provider', () => {
        expect(UserCanFork(null, provider([grant]))).toBe(false);
        expect(UserCanFork(user([UI_ROLE]), null)).toBe(false);
    });

    it('finds the authorization whatever its casing', () => {
        const lower = new AuthorizationInfo({ ID: FORK_ID, Name: 'conversations: fork', ParentID: null, IsActive: true });
        expect(UserCanFork(user([UI_ROLE]), provider([lower]))).toBe(true);
    });
});

describe('IsForkingSettingOn', () => {
    it('names the setting', () => {
        expect(CONVERSATIONS_FORKING_SETTING_KEY).toBe('mj.conversations.forking.v1');
    });

    it('is on with no setting, an empty one, or "on"', () => {
        expect(IsForkingSettingOn(undefined)).toBe(true);
        expect(IsForkingSettingOn(null)).toBe(true);
        expect(IsForkingSettingOn('')).toBe(true);
        expect(IsForkingSettingOn('on')).toBe(true);
    });

    it('is off for "off", whatever its case and spacing', () => {
        expect(IsForkingSettingOn('off')).toBe(false);
        expect(IsForkingSettingOn(' OFF ')).toBe(false);
    });
});
