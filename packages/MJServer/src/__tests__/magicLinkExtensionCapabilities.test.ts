import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCorsConfig } = vi.hoisted(() => ({
    mockCorsConfig: {
        allowedOrigins: ['https://portal.example.com', 'https://forms.example.com'],
    },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { Users: [] } },
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
    Message: class {
        From = '';
        To = '';
        Subject = '';
        Body = '';
        HTMLBody = '';
    },
}));
vi.mock('../config.js', () => ({
    configInfo: {
        cors: mockCorsConfig,
    },
}));
vi.mock('../isolatedProvider.js', () => ({
    CreateIsolatedProvider: async () => {
        throw new Error('provisioning is not exercised in this suite');
    },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import type { MagicLinkConfig } from '../config.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { MagicLinkService, IsMagicLinkRedirectUrlAllowed } from '../auth/magicLink/MagicLinkService.js';
import { BuildSessionClaims, HashToken } from '../auth/magicLink/magicLinkCore.js';

interface StoredInviteState {
    ID: string;
    TokenHash: string;
    Email: string | null;
    ApplicationID: string;
    RoleID: string;
    ExpiresAt: Date;
    MaxUses: number;
    UseCount: number;
    CreatedByUserID: string;
    Status: MJMagicLinkInviteEntity['Status'];
}

function makeConfig(overrides: Partial<MagicLinkConfig> = {}): MagicLinkConfig {
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
        ...overrides,
    };
}

function makeFakeProvider(storedInvites: Map<string, StoredInviteState>): IMetadataProvider {
    let seq = 1;
    const provider = {
        Roles: [{ ID: 'role-guest', Name: 'External Guest' }],
        Applications: [{ ID: 'app-forms', Name: 'Public Forms', Path: 'public-forms' }],
        GetEntityObject: async (entityName: string) => {
            if (entityName === 'MJ: Magic Link Invites') {
                const record: StoredInviteState & {
                    NewRecord: () => void;
                    Load: (id: string) => Promise<boolean>;
                    Save: () => Promise<boolean>;
                    LatestResult?: { CompleteMessage: string };
                } = {
                    ID: '',
                    TokenHash: '',
                    Email: null,
                    ApplicationID: '',
                    RoleID: '',
                    ExpiresAt: new Date(),
                    MaxUses: 1,
                    UseCount: 0,
                    CreatedByUserID: '',
                    Status: 'Active',
                    NewRecord: () => {
                        record.ID = `invite-${seq++}`;
                    },
                    Load: async (id: string) => {
                        const existing = storedInvites.get(id);
                        if (!existing) {
                            return false;
                        }
                        Object.assign(record, existing);
                        return true;
                    },
                    Save: async () => {
                        storedInvites.set(record.ID, {
                            ID: record.ID,
                            TokenHash: record.TokenHash,
                            Email: record.Email,
                            ApplicationID: record.ApplicationID,
                            RoleID: record.RoleID,
                            ExpiresAt: record.ExpiresAt,
                            MaxUses: record.MaxUses,
                            UseCount: record.UseCount,
                            CreatedByUserID: record.CreatedByUserID,
                            Status: record.Status,
                        });
                        return true;
                    },
                };
                return record;
            }
            return {
                NewRecord: () => undefined,
                Save: async () => true,
            };
        },
    };
    return provider as object as IMetadataProvider;
}

describe('MagicLinkService programmatic extension capabilities (Item 3.6)', () => {
    const ownerUser = {
        ID: 'user-owner',
        Email: 'owner@example.com',
        Type: 'Owner',
        UserRoles: [],
    } as object as UserInfo;

    const regularUser = {
        ID: 'user-guest',
        Email: 'guest@example.com',
        Type: 'User',
        UserRoles: [{ Role: 'External Guest' }],
    } as object as UserInfo;

    beforeEach(() => {
        mockCorsConfig.allowedOrigins = ['https://portal.example.com', 'https://forms.example.com'];
        MagicLinkKeyManager.Instance.Initialize();
        vi.clearAllMocks();
    });

    describe('IsMagicLinkRedirectUrlAllowed', () => {
        it('allows matching http(s) origins and rejects non-http schemes, unlisted origins, and wildcard *', () => {
            const allowed = ['https://explorer.example.com', 'https://forms.example.com:8443'];
            expect(IsMagicLinkRedirectUrlAllowed('https://forms.example.com:8443/respond/abc?step=2', allowed)).toBe(true);
            expect(IsMagicLinkRedirectUrlAllowed('https://evil.example.com/phish', allowed)).toBe(false);
            expect(IsMagicLinkRedirectUrlAllowed('javascript:alert(1)', allowed)).toBe(false);
            expect(IsMagicLinkRedirectUrlAllowed('https://anywhere.example/cb', ['*'])).toBe(false);
            expect(IsMagicLinkRedirectUrlAllowed('https://anywhere.example.org/ok', ['*', ''])).toBe(false);
        });
    });

    describe('CreateInvite RedirectUrl & SendEmail controls', () => {
        it('binds a permitted RedirectUrl via RS256 and skips default email when SendEmail=false', async () => {
            const invites = new Map<string, StoredInviteState>();
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService('https://api.example.com', makeConfig());

            const res = await service.CreateInvite(
                {
                    email: 'respondent@example.com',
                    ApplicationId: 'app-forms',
                    RedirectUrl: 'https://forms.example.com/survey/42',
                    SendEmail: false,
                },
                ownerUser,
                provider,
            );

            expect(res.success).toBe(true);
            expect(res.emailSent).toBe(false);
            expect(res.rawToken).toBeDefined();
            expect(CommunicationEngine.Instance.SendSingleMessage).not.toHaveBeenCalled();

            const url = new URL(res.redemptionUrl!);
            const rt = url.searchParams.get('rt') ?? undefined;
            expect(rt).toBeTruthy();

            // Validated against matching rawToken
            expect(service.ResolveVerifiedRedirectUrl(res.rawToken!, rt)).toBe('https://forms.example.com/survey/42');
            // Fails closed if an attacker swaps `rt` onto a different invite's token
            expect(service.ResolveVerifiedRedirectUrl('mj_ml_0000000000000000000000000000000000000000000000000000000000000000', rt)).toBeUndefined();
        });

        it('rejects disallowed RedirectUrl origins with invalid_redirect_url', async () => {
            const invites = new Map<string, StoredInviteState>();
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService('https://api.example.com', makeConfig());

            const res = await service.CreateInvite(
                {
                    email: 'respondent@example.com',
                    ApplicationId: 'app-forms',
                    RedirectUrl: 'https://attacker.invalid/steal',
                },
                ownerUser,
                provider,
            );

            expect(res.success).toBe(false);
            expect(res.errorCode).toBe('invalid_redirect_url');
            expect(invites.size).toBe(0);
        });

        it('ignores wildcard * in cors.allowedOrigins while honoring explicit magicLink.allowedRedirectOrigins', async () => {
            mockCorsConfig.allowedOrigins = ['*'];
            const invites = new Map<string, StoredInviteState>();
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService(
                'https://api.example.com',
                makeConfig({
                    explorerUrl: 'https://explorer.example.com',
                    allowedRedirectOrigins: ['https://surveys.example.com'],
                }),
            );

            // Wildcard CORS does NOT open up arbitrary redirect origins
            const rejected = await service.CreateInvite(
                {
                    email: 'respondent@example.com',
                    ApplicationId: 'app-forms',
                    RedirectUrl: 'https://anywhere.example/cb',
                    SendEmail: false,
                },
                ownerUser,
                provider,
            );
            expect(rejected.success).toBe(false);
            expect(rejected.errorCode).toBe('invalid_redirect_url');

            // Explicit magicLink.allowedRedirectOrigins works cleanly under wildcard CORS
            const permitted = await service.CreateInvite(
                {
                    email: 'respondent@example.com',
                    ApplicationId: 'app-forms',
                    RedirectUrl: 'https://surveys.example.com/respond/99',
                    SendEmail: false,
                },
                ownerUser,
                provider,
            );
            expect(permitted.success).toBe(true);
            const url = new URL(permitted.redemptionUrl!);
            const rt = url.searchParams.get('rt') ?? undefined;
            expect(service.ResolveVerifiedRedirectUrl(permitted.rawToken!, rt)).toBe('https://surveys.example.com/respond/99');
        });
    });

    describe('RevokeInvite & UpdateInviteExpiry', () => {
        it('revokes an active invite and enforces issuer authorization', async () => {
            const invites = new Map<string, StoredInviteState>();
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService('https://api.example.com', makeConfig());

            const created = await service.CreateInvite(
                { email: 'person@example.com', ApplicationId: 'app-forms', SendEmail: false },
                ownerUser,
                provider,
            );
            expect(created.success).toBe(true);

            const denied = await service.RevokeInvite(created.inviteId!, regularUser, provider);
            expect(denied.success).toBe(false);
            expect(denied.errorCode).toBe('forbidden');

            const revoked = await service.RevokeInvite(created.inviteId!, ownerUser, provider);
            expect(revoked.success).toBe(true);
            expect(revoked.status).toBe('Revoked');
            expect(invites.get(created.inviteId!)?.Status).toBe('Revoked');

            // Cannot extend a revoked invite
            const extendRevoked = await service.UpdateInviteExpiry(
                created.inviteId!,
                new Date(Date.now() + 72 * 3600 * 1000),
                ownerUser,
                provider,
            );
            expect(extendRevoked.success).toBe(false);
            expect(extendRevoked.errorCode).toBe('invalid_state');
        });

        it('updates expiry on an active or expired invite and re-activates expired status when extended', async () => {
            const invites = new Map<string, StoredInviteState>();
            invites.set('inv-expired', {
                ID: 'inv-expired',
                TokenHash: HashToken('mj_ml_sample'),
                Email: 'late@example.com',
                ApplicationID: 'app-forms',
                RoleID: 'role-guest',
                ExpiresAt: new Date(Date.now() - 3600_000),
                MaxUses: 1,
                UseCount: 0,
                CreatedByUserID: ownerUser.ID,
                Status: 'Expired',
            });
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService('https://api.example.com', makeConfig());

            const newExpiry = new Date(Date.now() + 48 * 3600 * 1000);
            const updated = await service.UpdateInviteExpiry('inv-expired', newExpiry, ownerUser, provider);
            expect(updated.success).toBe(true);
            expect(updated.status).toBe('Active');
            expect(updated.expiresAt).toBe(newExpiry.toISOString());
        });

        it('keeps &rt= redirect binding valid after UpdateInviteExpiry extends an invite past its initial expiry, and guards UseCount/past-expiry transitions', async () => {
            const invites = new Map<string, StoredInviteState>();
            const provider = makeFakeProvider(invites);
            const service = new MagicLinkService('https://api.example.com', makeConfig());

            const rawToken = 'mj_ml_1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
            const tokenHash = HashToken(rawToken);
            const pastExpiry = new Date(Date.now() - 3600_000);
            // Mint redirect binding with a past ExpiresAt epoch
            const rt = MagicLinkKeyManager.Instance.SignRedirectBinding(
                tokenHash,
                'https://forms.example.com/survey/extended',
                Math.floor(pastExpiry.getTime() / 1000),
            );

            invites.set('inv-extend-rt', {
                ID: 'inv-extend-rt',
                TokenHash: tokenHash,
                Email: 'respondent@example.com',
                ApplicationID: 'app-forms',
                RoleID: 'role-guest',
                ExpiresAt: pastExpiry,
                MaxUses: 1,
                UseCount: 0,
                CreatedByUserID: ownerUser.ID,
                Status: 'Expired',
            });

            // Extend invite into the future without re-issuing the URL
            const extendedExpiry = new Date(Date.now() + 24 * 3600_000);
            const extended = await service.UpdateInviteExpiry('inv-extend-rt', extendedExpiry, ownerUser, provider);
            expect(extended.success).toBe(true);
            expect(extended.status).toBe('Active');

            // Original &rt= binding still resolves the allowlisted RedirectUrl
            expect(service.ResolveVerifiedRedirectUrl(rawToken, rt)).toBe('https://forms.example.com/survey/extended');

            // Shortening an Active invite to <= now transitions Status to Expired
            const shortened = await service.UpdateInviteExpiry('inv-extend-rt', new Date(Date.now() - 1000), ownerUser, provider);
            expect(shortened.success).toBe(true);
            expect(shortened.status).toBe('Expired');

            // An Expired invite whose UseCount >= MaxUses is NOT reactivated to Active
            invites.set('inv-exhausted-expired', {
                ID: 'inv-exhausted-expired',
                TokenHash: HashToken('mj_ml_exhausted'),
                Email: 'used@example.com',
                ApplicationID: 'app-forms',
                RoleID: 'role-guest',
                ExpiresAt: pastExpiry,
                MaxUses: 1,
                UseCount: 1,
                CreatedByUserID: ownerUser.ID,
                Status: 'Expired',
            });
            const notReactivated = await service.UpdateInviteExpiry('inv-exhausted-expired', extendedExpiry, ownerUser, provider);
            expect(notReactivated.success).toBe(true);
            expect(notReactivated.status).toBe('Expired');
        });
    });

    describe('VerifySessionToken', () => {
        it('verifies a signed magic-link session JWT and rejects wrong audience or issuer', () => {
            const service = new MagicLinkService('https://api.example.com', makeConfig());
            const nowSeconds = Math.floor(Date.now() / 1000);
            const claims = BuildSessionClaims({
                issuer: 'https://api.example.com',
                audience: 'mj-magic-link',
                inviteId: 'inv-123',
                email: 'person@example.com',
                applicationId: 'app-forms',
                roleName: 'External Guest',
                nowSeconds,
                ttlSeconds: 3600,
            });
            const jwtToken = MagicLinkKeyManager.Instance.Sign(claims);

            const verified = service.VerifySessionToken(jwtToken);
            expect(verified).not.toBeNull();
            expect(verified?.email).toBe('person@example.com');
            expect(verified?.mj_app_id).toBe('app-forms');

            const wrongIssuerService = new MagicLinkService('https://other-api.example.com', makeConfig());
            expect(wrongIssuerService.VerifySessionToken(jwtToken)).toBeNull();
        });
    });
});
