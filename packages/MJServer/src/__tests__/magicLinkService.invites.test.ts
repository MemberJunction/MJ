/**
 * MagicLinkService: invite shape (identity mode, kind, resource) and the open-application rule
 * applied at redemption (issues #5942 and #3537).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    runViewResults: [] as Array<{ ID: string; RoleID: string }>,
    runViewSuccess: true,
    runViewCalls: [] as Array<{ ExtraFilter?: string }>,
    savedAppRoles: [] as Array<Record<string, unknown>>,
    cachedUsers: [] as Array<{ ID: string; Email: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(params: { ExtraFilter?: string }) {
            mocks.runViewCalls.push(params);
            return { Success: mocks.runViewSuccess, Results: mocks.runViewResults, ErrorMessage: mocks.runViewSuccess ? undefined : 'boom' };
        }
    }
    class FakeMetadata {
        async GetEntityObject() {
            const row: Record<string, unknown> = {
                NewRecord: () => undefined,
                Save: async () => {
                    mocks.savedAppRoles.push({ ApplicationID: row.ApplicationID, RoleID: row.RoleID, CanAccess: row.CanAccess });
                    return true;
                },
            };
            return row;
        }
    }
    return { ...actual, RunView: FakeRunView, Metadata: FakeMetadata };
});
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { Users: mocks.cachedUsers } },
}));
vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            SendSingleMessage: vi.fn(async () => ({ Success: true })),
        },
    },
}));
vi.mock('@memberjunction/communication-types', () => ({
    Message: class {},
}));
vi.mock('../config.js', () => ({
    configInfo: { cors: { allowedOrigins: [] } },
}));
vi.mock('../isolatedProvider.js', () => ({
    CreateIsolatedProvider: async () => {
        throw new Error('provisioning is not exercised in this suite');
    },
}));

import type { IMetadataProvider, RoleInfo, UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import type { MagicLinkConfig } from '../config.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { DecideAppAccessGrant, MagicLinkService, ValidateInviteShape } from '../auth/magicLink/MagicLinkService.js';
import type { CreateMagicLinkInviteParams } from '../auth/magicLink/types.js';

const RESOURCE_TYPE_ID = '11111111-1111-1111-1111-111111111111';
const RESOURCE_ID = '22222222-2222-2222-2222-222222222222';

function makeConfig(): MagicLinkConfig {
    return {
        enabled: true,
        audience: 'mj-magic-link',
        restrictedRoleName: 'External Guest',
        grantableRoleNames: ['External Guest'],
        inviteIssuerRoleNames: ['Invite Issuer'],
        defaultExpiresInHours: 24,
        sessionTokenTtlHours: 8,
        explorerUrl: 'https://explorer.example.com',
        communicationProvider: 'SendGrid',
        fromAddress: 'noreply@example.com',
        provisioningGuard: 'block',
        rateLimitWindowMs: 60_000,
        redeemRateLimitMax: 20,
        createRateLimitMax: 20,
    } as MagicLinkConfig;
}

/** Saved invite rows, as the service wrote them. */
type SavedInvite = Record<string, unknown>;

function makeFakeProvider(saved: SavedInvite[]): IMetadataProvider {
    const provider = {
        Roles: [{ ID: 'role-guest', Name: 'External Guest' }],
        Applications: [{ ID: 'app-forms', Name: 'Public Forms', Path: 'public-forms' }],
        GetEntityObject: async (entityName: string) => {
            const row: Record<string, unknown> = {
                ID: '',
                NewRecord: () => {
                    row.ID = `${entityName}-${saved.length + 1}`;
                },
                Save: async () => {
                    if (entityName === 'MJ: Magic Link Invites') {
                        saved.push({ ...row });
                    }
                    return true;
                },
            };
            return row;
        },
    };
    return provider as object as IMetadataProvider;
}

const owner = { ID: 'user-owner', Email: 'owner@example.com', Type: 'Owner', UserRoles: [] } as object as UserInfo;
const guest = { ID: 'user-guest', Email: 'guest@example.com', Type: 'User', UserRoles: [{ Role: 'External Guest' }] } as object as UserInfo;

describe('ValidateInviteShape', () => {
    it('defaults to an email-mode app-session invite', () => {
        expect(ValidateInviteShape({ email: ' a@example.com ', ApplicationId: 'app' })).toEqual({
            Ok: true, Email: 'a@example.com', IdentityMode: 'email', Kind: 'app-session', ResourceTypeID: null, ResourceID: null,
        });
    });

    it('requires an email in email mode', () => {
        expect(ValidateInviteShape({ email: '  ', ApplicationId: 'app' }).Ok).toBe(false);
    });

    it('keeps an anonymous invite\'s email as its delivery address', () => {
        expect(ValidateInviteShape({ IdentityMode: 'anonymous', email: ' x@example.com ', ApplicationId: 'app' })).toEqual({
            Ok: true, Email: 'x@example.com', IdentityMode: 'anonymous', Kind: 'app-session', ResourceTypeID: null, ResourceID: null,
        });
    });

    it('stores no email on an anonymous invite without one', () => {
        expect(ValidateInviteShape({ IdentityMode: 'anonymous', email: '  ', ApplicationId: 'app' })).toMatchObject({ Ok: true, Email: null });
    });

    it('requires both resource fields for resource-share and refuses them on other kinds', () => {
        expect(ValidateInviteShape({ IdentityMode: 'anonymous', ApplicationId: 'app', Kind: 'resource-share', ResourceTypeID: RESOURCE_TYPE_ID }).Ok).toBe(false);
        expect(ValidateInviteShape({ email: 'a@example.com', ApplicationId: 'app', ResourceID: RESOURCE_ID }).Ok).toBe(false);
    });

    it('does not mint anonymous-embed invites', () => {
        const params = { IdentityMode: 'anonymous', ApplicationId: 'app', Kind: 'anonymous-embed' } as object as CreateMagicLinkInviteParams;
        const result = ValidateInviteShape(params);
        expect(result.Ok).toBe(false);
    });
});

describe('MagicLinkService.CreateInvite identity mode and resource', () => {
    beforeEach(() => {
        MagicLinkKeyManager.Instance.Initialize();
        vi.clearAllMocks();
    });

    it('writes an anonymous resource-share invite and never emails it', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite(
            { IdentityMode: 'anonymous', ApplicationId: 'app-forms', Kind: 'resource-share', ResourceTypeID: RESOURCE_TYPE_ID, ResourceID: RESOURCE_ID },
            owner,
            makeFakeProvider(saved),
        );

        expect(res.success).toBe(true);
        expect(res.emailSent).toBe(false);
        expect(res.rawToken).toBeDefined();
        expect(CommunicationEngine.Instance.SendSingleMessage).not.toHaveBeenCalled();
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            Email: null,
            IdentityMode: 'anonymous',
            Kind: 'resource-share',
            ResourceTypeID: RESOURCE_TYPE_ID,
            ResourceID: RESOURCE_ID,
            RoleID: 'role-guest',
        });
    });

    it('keeps today\'s columns for a plain email invite', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite({ email: 'person@example.com', ApplicationId: 'app-forms', SendEmail: false }, owner, makeFakeProvider(saved));

        expect(res.success).toBe(true);
        expect(saved[0]).toMatchObject({ Email: 'person@example.com', IdentityMode: 'email', Kind: 'app-session', ResourceTypeID: null, ResourceID: null });
    });

    it('writes an anonymous invite with a delivery email and returns the link when SendEmail is false', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite(
            { IdentityMode: 'anonymous', email: 'recipient@example.com', ApplicationId: 'app-forms', SendEmail: false },
            owner,
            makeFakeProvider(saved),
        );

        expect(res.success).toBe(true);
        expect(res.emailSent).toBe(false);
        expect(res.rawToken).toBeDefined();
        expect(CommunicationEngine.Instance.SendSingleMessage).not.toHaveBeenCalled();
        expect(saved[0]).toMatchObject({ Email: 'recipient@example.com', IdentityMode: 'anonymous', Kind: 'app-session' });
    });

    it('emails an anonymous invite to its delivery address by default', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite(
            { IdentityMode: 'anonymous', email: 'recipient@example.com', ApplicationId: 'app-forms' },
            owner,
            makeFakeProvider(saved),
        );

        expect(res.success).toBe(true);
        expect(res.emailSent).toBe(true);
        expect(res.rawToken).toBeUndefined();
        expect(CommunicationEngine.Instance.SendSingleMessage).toHaveBeenCalledTimes(1);
    });

    it('refuses a resource-share invite with no resource', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite({ IdentityMode: 'anonymous', ApplicationId: 'app-forms', Kind: 'resource-share' }, owner, makeFakeProvider(saved));

        expect(res.success).toBe(false);
        expect(saved).toHaveLength(0);
    });

    it('still refuses a non-issuer, anonymous or not', async () => {
        const saved: SavedInvite[] = [];
        const service = new MagicLinkService('https://api.example.com', makeConfig());

        const res = await service.CreateInvite(
            { IdentityMode: 'anonymous', ApplicationId: 'app-forms', Kind: 'resource-share', ResourceTypeID: RESOURCE_TYPE_ID, ResourceID: RESOURCE_ID },
            guest,
            makeFakeProvider(saved),
        );

        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('forbidden');
        expect(saved).toHaveLength(0);
    });
});

describe('open applications at redemption (#3537)', () => {
    const service = new MagicLinkService('https://api.example.com', makeConfig());
    const contextUser = { ID: 'ctx' } as UserInfo;

    beforeEach(() => {
        mocks.runViewResults = [];
        mocks.runViewSuccess = true;
        mocks.runViewCalls = [];
        mocks.savedAppRoles = [];
    });

    it('DecideAppAccessGrant: open, already granted, or grant', () => {
        expect(DecideAppAccessGrant([], 'ROLE-A')).toBe('open');
        expect(DecideAppAccessGrant([{ RoleID: 'role-a' }], 'ROLE-A')).toBe('already-granted');
        expect(DecideAppAccessGrant([{ RoleID: 'role-b' }], 'role-a')).toBe('grant');
    });

    it('creates no Application Roles row for an application that has none, so it stays open', async () => {
        await service['ensureAppAccess']('role-guest', 'app-open', contextUser);

        expect(mocks.savedAppRoles).toHaveLength(0);
        expect(mocks.runViewCalls[0].ExtraFilter).toBe("ApplicationID = 'app-open'");
    });

    it('adds the invited role once to an allowlisted application', async () => {
        mocks.runViewResults = [{ ID: 'ar-1', RoleID: 'role-staff' }];

        await service['ensureAppAccess']('role-guest', 'app-allowlisted', contextUser);

        expect(mocks.savedAppRoles).toEqual([{ ApplicationID: 'app-allowlisted', RoleID: 'role-guest', CanAccess: true }]);
    });

    it('writes nothing when the role already has a row', async () => {
        mocks.runViewResults = [{ ID: 'ar-1', RoleID: 'ROLE-GUEST' }];

        await service['ensureAppAccess']('role-guest', 'app-allowlisted', contextUser);

        expect(mocks.savedAppRoles).toHaveLength(0);
    });

    it('writes nothing when the role rows cannot be read', async () => {
        mocks.runViewSuccess = false;

        await service['ensureAppAccess']('role-guest', 'app-x', contextUser);

        expect(mocks.savedAppRoles).toHaveLength(0);
    });
});

describe('anonymous redemption ignores the delivery email', () => {
    const ANONYMOUS_USER_ID = '273910DF-28F1-45C1-A8F8-6E9AD8E5F008';

    beforeEach(() => {
        mocks.runViewResults = [];
        mocks.runViewSuccess = true;
        mocks.cachedUsers.splice(0, mocks.cachedUsers.length,
            { ID: ANONYMOUS_USER_ID, Email: 'anonymous@magic-link.local' },
            { ID: 'user-recipient', Email: 'recipient@example.com' },
        );
    });

    it('resolves the Anonymous principal, never the user who owns the delivery address', async () => {
        const service = new MagicLinkService('https://api.example.com', makeConfig());
        const invite = { IdentityMode: 'anonymous', Email: 'recipient@example.com', RoleID: 'role-guest', ApplicationID: 'app-forms' } as object as MJMagicLinkInviteEntity;
        const role = { ID: 'role-guest', Name: 'External Guest' } as object as RoleInfo;

        const result = await service['provisionUser'](invite, role, { ID: 'ctx' } as UserInfo);

        expect(result).toMatchObject({ success: true, userId: ANONYMOUS_USER_ID, email: 'anonymous@magic-link.local' });
    });
});
