import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: () => grants,
            // Conversation grants (the delete rule) answer from grantLevel; folder grants from folderGrantLevels.
            GetUserResourcePermissionLevel: (typeId: string, recordId: string) =>
                typeId === '81D4BC3D-9FEB-EF11-B01A-286B35C04427' ? grantLevel : folderGrantLevels[recordId] ?? null,
        }),
    },
}));

let grants: Array<{ ResourceRecordID: string; PermissionLevel: string }> = [];
let grantLevel: 'View' | 'Edit' | 'Owner' | null = null;
let folderGrantLevels: Record<string, 'View' | 'Edit' | 'Owner'> = {};

import { ConversationDeleteAllowed, UserMayDeleteConversation, UserMayWriteConversation } from '../custom/ConversationWriteAccess';

function provider(
    ownerId: string | null,
    loadOk = true,
    folder?: {
        projectId: string;
        ownerUserId: string | null;
        projectLoadOk?: boolean;
        additionalData?: string | null;
    }
) {
    return {
        ProviderType: 'Database',
        GetEntityObject: async (entityName: string) => {
            if (entityName === 'MJ: Projects') {
                return {
                    OwnerUserID: folder?.ownerUserId ?? null,
                    Load: async () => folder?.projectLoadOk ?? true,
                };
            }
            return {
                UserID: ownerId,
                ProjectID: folder?.projectId ?? null,
                AdditionalData: folder?.additionalData ?? null,
                Load: async () => loadOk,
            };
        },
    } as never;
}
const user = { ID: 'u1' } as never;
/** `AdditionalData` of a conversation whose owner turned on folder inheritance (it is off by default). */
const INHERITS = '{"inheritFolderAccess":true}';

describe('UserMayWriteConversation', () => {
    beforeEach(() => {
        grants = [];
        folderGrantLevels = {};
    });

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
    it('denies with view-only reason when conversation is inside a shared folder and user has no explicit grant', async () => {
        grants = [];
        const denied = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-shared', ownerUserId: null, additionalData: INHERITS }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You have view-only access to this conversation.');
    });
    it('allows write when user has Edit or Owner ACL grant on the parent folder and conversation inherits', async () => {
        folderGrantLevels = { 'proj-acl': 'Edit' };
        const allowed = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-acl', ownerUserId: 'other', additionalData: INHERITS }),
            user,
            'c1'
        );
        expect(allowed.Allowed).toBe(true);
        expect(allowed.IsOwner).toBe(false);
    });
    it('denies with view-only reason when user has View ACL grant on the parent folder', async () => {
        folderGrantLevels = { 'proj-acl': 'View' };
        const denied = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-acl', ownerUserId: 'other', additionalData: INHERITS }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You have view-only access to this conversation.');
    });
    it('gives no folder access unless the conversation opted in to inheriting it', async () => {
        folderGrantLevels = { 'proj-acl': 'Edit' };
        for (const additionalData of [null, '{"inheritFolderAccess":false}']) {
            const denied = await UserMayWriteConversation(
                provider('other', true, { projectId: 'proj-acl', ownerUserId: null, additionalData }),
                user,
                'c1'
            );
            expect(denied.Allowed).toBe(false);
            expect(denied.Reason).toBe('You do not have access to this conversation.');
        }
    });
    it('denies with no-access reason when conversation is inside a personal folder and user has no grant', async () => {
        grants = [];
        const denied = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-private', ownerUserId: 'other' }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You do not have access to this conversation.');
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

    it('enforces AllowRecordComments and CanUserComment on anchored record-comment threads', async () => {
        const disabledEntityProvider = {
            ProviderType: 'Database',
            Entities: [
                {
                    ID: 'e-locked',
                    Name: 'Locked Entity',
                    DisplayNameOrName: 'Locked Entity',
                    AllowRecordComments: false,
                    CanUserComment: () => false,
                },
            ],
            GetEntityObject: async () => ({
                UserID: 'other',
                AnchorType: 'Field',
                LinkedEntityID: 'e-locked',
                LinkedRecordID: 'r-1',
                Load: async () => true,
            }),
        } as never;

        const deniedDisabled = await UserMayWriteConversation(disabledEntityProvider, user, 'c-anchored-1');
        expect(deniedDisabled.Allowed).toBe(false);
        expect(deniedDisabled.Reason).toMatch(/disabled/i);

        const roleDeniedProvider = {
            ProviderType: 'Database',
            Entities: [
                {
                    ID: 'e-role-gated',
                    Name: 'Role Gated Entity',
                    DisplayNameOrName: 'Role Gated Entity',
                    AllowRecordComments: true,
                    CanUserComment: () => false,
                },
            ],
            GetEntityObject: async () => ({
                UserID: 'other',
                AnchorType: 'Field',
                LinkedEntityID: 'e-role-gated',
                LinkedRecordID: 'r-1',
                Load: async () => true,
            }),
        } as never;

        const deniedRole = await UserMayWriteConversation(roleDeniedProvider, user, 'c-anchored-2');
        expect(deniedRole.Allowed).toBe(false);
        expect(deniedRole.Reason).toMatch(/permission to post comments/i);
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
