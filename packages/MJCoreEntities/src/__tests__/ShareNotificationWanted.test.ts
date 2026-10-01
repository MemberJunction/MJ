/**
 * MJ#4946: a new approved share tells its grantee unless the save said not to, there is no grantor, or the grantor is the grantee.
 * `DispatchShareNotificationAfterSave`, which the Collection, Artifact, Dashboard and Access Control Rule grants use, honors the
 * same option before it builds a payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ createShareNotification: vi.fn() }));

vi.mock('../custom/Permissions/shareNotification', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../custom/Permissions/shareNotification')>();
    return { ...actual, CreateShareNotification: mocks.createShareNotification };
});

import { ShareNotificationWanted } from '../custom/Permissions/shareNotification';
import { DispatchShareNotificationAfterSave } from '../custom/Permissions/BaseShareEntityExtended';

const GRANTOR = '11111111-1111-4111-8111-111111111111';
const GRANTEE = '22222222-2222-4222-8222-222222222222';

describe('ShareNotificationWanted', () => {
    it('wants a notice for a new share from one person to another', () => {
        expect(ShareNotificationWanted({ grantorUserId: GRANTOR, granteeUserId: GRANTEE })).toBe(true);
        expect(ShareNotificationWanted({ options: {}, grantorUserId: GRANTOR, granteeUserId: GRANTEE })).toBe(true);
        expect(ShareNotificationWanted({ options: { SkipShareNotification: false }, grantorUserId: GRANTOR, granteeUserId: GRANTEE })).toBe(true);
    });

    it('is silent when the save said SkipShareNotification: a grant written as plumbing', () => {
        expect(ShareNotificationWanted({ options: { SkipShareNotification: true }, grantorUserId: GRANTOR, granteeUserId: GRANTEE })).toBe(false);
    });

    it('is silent with no grantor to name, no grantee, or a person sharing with themself, whatever the case of the ids', () => {
        expect(ShareNotificationWanted({ grantorUserId: null, granteeUserId: GRANTEE })).toBe(false);
        expect(ShareNotificationWanted({ grantorUserId: GRANTOR, granteeUserId: undefined })).toBe(false);
        expect(ShareNotificationWanted({ grantorUserId: GRANTOR, granteeUserId: GRANTOR.toLowerCase() })).toBe(false);
    });
});

describe('DispatchShareNotificationAfterSave', () => {
    const entity = (providerType: string) => ({
        ProviderToUse: { ProviderType: providerType },
        ContextCurrentUser: { ID: GRANTOR },
    }) as unknown as import('@memberjunction/core').BaseEntity;
    const payload = (grantee: string) => (provider: unknown, grantorId: string) => ({
        Provider: provider as import('@memberjunction/core').IMetadataProvider,
        ContextUser: { ID: GRANTOR } as import('@memberjunction/core').UserInfo,
        GrantorUserID: grantorId,
        GranteeUserID: grantee,
        ResourceTypeLabel: 'Collection',
        ResourceRecordID: 'C-1',
    });

    beforeEach(() => mocks.createShareNotification.mockReset());

    it('sends the notice for a new server-side share', async () => {
        await DispatchShareNotificationAfterSave(entity('Database'), true, GRANTOR, payload(GRANTEE));
        expect(mocks.createShareNotification).toHaveBeenCalledTimes(1);
        expect(mocks.createShareNotification.mock.calls[0][0]).toMatchObject({ GrantorUserID: GRANTOR, GranteeUserID: GRANTEE });
    });

    it('sends nothing when the save said SkipShareNotification, and does not build the payload', async () => {
        const builder = vi.fn(payload(GRANTEE));
        await DispatchShareNotificationAfterSave(entity('Database'), true, GRANTOR, builder, { SkipShareNotification: true } as import('@memberjunction/core').EntitySaveOptions);
        expect(builder).not.toHaveBeenCalled();
        expect(mocks.createShareNotification).not.toHaveBeenCalled();
    });

    it('sends nothing to a person who shared with themself, and nothing from a client-side provider or for an update', async () => {
        await DispatchShareNotificationAfterSave(entity('Database'), true, GRANTOR, payload(GRANTOR));
        await DispatchShareNotificationAfterSave(entity('Network'), true, GRANTOR, payload(GRANTEE));
        await DispatchShareNotificationAfterSave(entity('Database'), false, GRANTOR, payload(GRANTEE));
        expect(mocks.createShareNotification).not.toHaveBeenCalled();
    });
});
