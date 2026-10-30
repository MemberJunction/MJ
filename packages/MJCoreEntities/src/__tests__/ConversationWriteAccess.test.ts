import { describe, it, expect, vi } from 'vitest';

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: () => grants,
            GetUserResourcePermissionLevel: () => grantLevel,
        }),
    },
}));

let grants: Array<{ ResourceRecordID: string; PermissionLevel: string }> = [];
let grantLevel: 'View' | 'Edit' | 'Owner' | null = null;

import { ConversationDeleteAllowed, UserMayDeleteConversation, UserMayWriteConversation } from '../custom/ConversationWriteAccess';

function provider(ownerId: string | null, loadOk = true) {
    return {
        ProviderType: 'Database',
        GetEntityObject: async () => ({ UserID: ownerId, Load: async () => loadOk }),
    } as never;
}
const user = { ID: 'u1' } as never;

describe('UserMayWriteConversation', () => {
    it('allows the owner', async () => {
        expect((await UserMayWriteConversation(provider('u1'), user, 'c1')).Allowed).toBe(true);
    });
    it('allows an Edit grant and denies a View grant', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Allowed).toBe(true);
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'View' }];
        const denied = await UserMayWriteConversation(provider('other'), user, 'c1');
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toMatch(/view-only/);
    });
    it('denies with no grant', async () => {
        grants = [];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Allowed).toBe(false);
    });
    it('allows a non-database provider (client side) without a lookup', async () => {
        const client = { ProviderType: 'Network', GetEntityObject: vi.fn() } as never;
        expect((await UserMayWriteConversation(client, user, 'c1')).Allowed).toBe(true);
    });
    it('reports ownership separately from access, so an Edit grantee is allowed but not the owner', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('u1'), user, 'c1')).IsOwner).toBe(true);
        const grantee = await UserMayWriteConversation(provider('other'), user, 'c1');
        expect(grantee.Allowed).toBe(true);
        expect(grantee.IsOwner).toBe(false);
    });
    it('reports whether the conversation loaded, since one that did not (missing or hidden) is still allowed', async () => {
        grants = [{ ResourceRecordID: 'c1', PermissionLevel: 'Edit' }];
        expect((await UserMayWriteConversation(provider('other'), user, 'c1')).Loaded).toBe(true);
        expect(await UserMayWriteConversation(provider('other', false), user, 'c1')).toEqual({
            Allowed: true,
            Reason: null,
            IsOwner: false,
            Loaded: false,
        });
    });
});

describe('UserMayDeleteConversation', () => {
    const db = { ProviderType: 'Database' } as never;
    const shared = { ID: 'c1', UserID: 'owner' };
    const withRole = (role: string) => ({ ID: 'u1', UserRoles: [{ Role: role }] }) as never;

    it('allows the owner', async () => {
        grantLevel = null;
        expect((await UserMayDeleteConversation(db, user, { ID: 'c1', UserID: 'U1' })).Allowed).toBe(true);
    });
    it('allows an Owner-level grantee', async () => {
        grantLevel = 'Owner';
        expect((await UserMayDeleteConversation(db, user, shared)).Allowed).toBe(true);
    });
    it('refuses a View or an Edit grantee, with a reason', async () => {
        for (const level of ['View', 'Edit'] as const) {
            grantLevel = level;
            const decision = await UserMayDeleteConversation(db, user, shared);
            expect(decision.Allowed).toBe(false);
            expect(decision.Reason).toMatch(/Owner access/);
        }
    });
    it('refuses a user with no grant', async () => {
        grantLevel = null;
        expect((await UserMayDeleteConversation(db, user, shared)).Allowed).toBe(false);
    });
    it('allows a Developer or Integration user with no grant', async () => {
        grantLevel = null;
        expect((await UserMayDeleteConversation(db, withRole('Developer'), shared)).Allowed).toBe(true);
        expect((await UserMayDeleteConversation(db, withRole(' integration '), shared)).Allowed).toBe(true);
        expect((await UserMayDeleteConversation(db, withRole('UI'), shared)).Allowed).toBe(false);
    });
    it('allows a non-database provider (client side) without a lookup', async () => {
        grantLevel = null;
        expect((await UserMayDeleteConversation({ ProviderType: 'Network' } as never, user, shared)).Allowed).toBe(true);
    });
});

describe('ConversationDeleteAllowed', () => {
    it('refuses when there is no user', () => {
        expect(ConversationDeleteAllowed('owner', null, 'Owner')).toBe(false);
    });
});
