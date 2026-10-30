import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: () => grants,
            GetUserResourcePermissionLevel: (_typeId: string, recordId: string) => folderGrantLevels[recordId] ?? null,
        }),
    },
}));

let grants: Array<{ ResourceRecordID: string; PermissionLevel: string }> = [];
let folderGrantLevels: Record<string, 'View' | 'Edit' | 'Owner'> = {};

import { UserMayWriteConversation } from '../custom/ConversationWriteAccess';

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
            provider('other', true, { projectId: 'proj-shared', ownerUserId: null }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You have view-only access to this conversation.');
    });
    it('allows write when user has Edit or Owner ACL grant on the parent folder and conversation inherits', async () => {
        folderGrantLevels = { 'proj-acl': 'Edit' };
        const allowed = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-acl', ownerUserId: 'other' }),
            user,
            'c1'
        );
        expect(allowed.Allowed).toBe(true);
        expect(allowed.IsOwner).toBe(false);
    });
    it('denies with view-only reason when user has View ACL grant on the parent folder', async () => {
        folderGrantLevels = { 'proj-acl': 'View' };
        const denied = await UserMayWriteConversation(
            provider('other', true, { projectId: 'proj-acl', ownerUserId: 'other' }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You have view-only access to this conversation.');
    });
    it('blocks inherited folder access when conversation has inheritFolderAccess=false', async () => {
        folderGrantLevels = { 'proj-acl': 'Edit' };
        const denied = await UserMayWriteConversation(
            provider('other', true, {
                projectId: 'proj-acl',
                ownerUserId: null,
                additionalData: '{"inheritFolderAccess":false}',
            }),
            user,
            'c1'
        );
        expect(denied.Allowed).toBe(false);
        expect(denied.Reason).toBe('You do not have access to this conversation.');
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
});

