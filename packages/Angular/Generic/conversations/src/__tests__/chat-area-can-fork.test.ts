import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/** `CanFork`: the Conversations: Fork authorization, the personal setting and write access, all three. */
const UI_ROLE = 'ROLE-UI';
const DENY_ROLE = 'ROLE-PORTAL';

function createChatArea(opts: { roles?: string[]; authorized?: boolean; readOnly?: boolean; setting?: string } = {}) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    Object.assign(open, {
        CurrentUser: { ID: 'USER-1', UserRoles: (opts.roles ?? [UI_ROLE]).map(RoleID => ({ RoleID })) },
        Provider: {
            Authorizations: opts.authorized === false ? [] : [{ ID: 'AUTH-FORK', Name: 'Conversations: Fork', IsActive: true }],
            AuthorizationRoles: [
                { AuthorizationID: 'AUTH-FORK', RoleID: UI_ROLE, Type: 'Allow' },
                { AuthorizationID: 'AUTH-FORK', RoleID: DENY_ROLE, Type: 'Deny' },
            ],
        },
    });
    Object.defineProperty(component, 'EffectiveReadOnly', { get: () => opts.readOnly ?? false });
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation(key => (key === 'mj.conversations.forking.v1' ? opts.setting : undefined));
    return component;
}

describe('ConversationChatAreaComponent.CanFork', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is true for a writer who holds the authorization and has not switched forking off', () => {
        expect(createChatArea().CanFork).toBe(true);
        expect(createChatArea({ setting: 'on' }).CanFork).toBe(true);
    });

    it('is false when the person switched forking off', () => {
        expect(createChatArea({ setting: 'off' }).CanFork).toBe(false);
    });

    it('is false without the authorization, or with a Deny role', () => {
        expect(createChatArea({ authorized: false }).CanFork).toBe(false);
        expect(createChatArea({ roles: ['ROLE-OTHER'] }).CanFork).toBe(false);
        expect(createChatArea({ roles: [UI_ROLE, DENY_ROLE] }).CanFork).toBe(false);
    });

    it('is false for a person who may not write', () => {
        expect(createChatArea({ readOnly: true }).CanFork).toBe(false);
    });

    it('counts forking as on when the settings cannot be read', () => {
        const c = createChatArea();
        vi.mocked(UserInfoEngine.Instance.GetSetting).mockImplementation(() => { throw new Error('not loaded'); });
        expect(c.CanFork).toBe(true);
    });
});
