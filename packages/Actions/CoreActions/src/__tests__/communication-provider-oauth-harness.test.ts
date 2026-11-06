import * as crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJCommunicationProviderEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import type { BaseCommunicationProvider } from '@memberjunction/communication-types';

const {
    agentsList,
    providersList,
    providerInstancesMap,
    runViewMock,
    getPolicyMock,
    credentialEngineMock,
} = vi.hoisted(() => ({
    agentsList: [{ ID: 'cos-agent-id', Name: 'Chief of Staff' }],
    providersList: [] as MJCommunicationProviderEntity[],
    providerInstancesMap: new Map<string, BaseCommunicationProvider>(),
    runViewMock: vi.fn(),
    getPolicyMock: vi.fn(),
    credentialEngineMock: {
        StoreUserDelegatedCredential: vi.fn(async () => ({ ID: 'cred-from-engine' })),
        GetUserDelegatedCredential: vi.fn(async () => null),
        RevokeUserDelegatedCredential: vi.fn(async () => true),
    },
}));

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: { Instance: credentialEngineMock },
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: object) => target,
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase(),
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    Metadata: class {},
    RunView: class {
        RunView = (...args: [object, UserInfo?]) => runViewMock(...args);
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents() {
                return agentsList;
            },
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AgentUserPolicyEngine: {
        Instance: {
            GetPolicyForAgentAndUser: (...args: [string, string, UserInfo]) => getPolicyMock(...args),
            EvaluateCalendarOperation: () => ({ verdict: 'Allow', reason: 'Allowed' }),
            EvaluateEmailOperation: () => ({ verdict: 'Allow', reason: 'Allowed' }),
        },
    },
}));

vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Providers() {
                return providersList;
            },
            GetProvider: (name: string) => {
                const inst = providerInstancesMap.get(name);
                if (!inst) throw new Error(`Provider ${name} not found`);
                return inst;
            },
        },
    },
}));

import {
    VerifyMyCommunicationCapabilitiesAction,
    GetMyCalendarAndAvailabilityAction,
    ManageMyCalendarEventAction,
} from '../custom/ai/user-scoped-communication.action';
import {
    CommunicationUserOAuthService,
    IOAuthTokenTransport,
    IUserDelegatedCredentialStore,
    ProviderUserOAuthPolicyConfig,
    ReadProviderUserOAuthGates,
    StoreUserDelegatedOAuthInput,
} from '../custom/ai/communication-oauth-service';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

interface TestableAction {
    InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>;
}

function invokeAction(action: object, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as TestableAction).InternalRunAction(params);
}

function makeUser(id: string, name: string, email: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = email;
    u.IsActive = true;
    return u;
}

describe('Stage 8 Deliverable 3 — Communication Provider Integration Harness (Postures 1 & 2 + HubSpot/Calendly)', () => {
    const alice = makeUser('00000000-0000-0000-0000-00000000A11C', 'Alice Executive', 'alice@company.com');

    beforeEach(() => {
        providersList.length = 0;
        providerInstancesMap.clear();
        runViewMock.mockReset().mockResolvedValue({ Success: true, Results: [] });
        getPolicyMock.mockReset().mockResolvedValue({
            EmailChannelMode: 'DraftWithApproval',
            CalendarChannelMode: 'ProposeWithApproval',
            PhoneChannelMode: 'OutboundWithApproval',
            MessagingChannelMode: 'Enabled',
        } as unknown as MJAIAgentUserPolicyEntity);
    });

    it('validates Posture 1 (UtilityMailboxesOnly): routes Mail to dedicated utility mailbox and blocks personal Calendar access', async () => {
        const msGraphProvider = {
            ID: 'prov-msgraph',
            Name: 'Microsoft Graph',
            Status: 'Active',
            SupportsCalendar: true,
            SupportsFreeBusy: true,
            EnterpriseScopeMode: 'UtilityMailboxesOnly',
            AllowedEmailDomains: 'company.com',
        } as unknown as MJCommunicationProviderEntity;
        providersList.push(msGraphProvider);

        const mockGraphInstance = {
            supportsOperation: () => true,
            VerifyMailboxAccess: vi.fn(),
        } as unknown as BaseCommunicationProvider;
        providerInstancesMap.set('Microsoft Graph', mockGraphInstance);

        // Return utility mailbox from MJ: AI Bridge Agent Identities
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [
                {
                    ID: 'bridge-id-1',
                    IdentityType: 'Email',
                    IdentityValue: 'cos-alice@company.com',
                    DisplayName: 'Alice CoS Inbox',
                    IsActive: true,
                } as unknown as MJAIBridgeAgentIdentityEntity,
            ],
        });
        // Second call during mailGate evaluation
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [
                {
                    ID: 'bridge-id-1',
                    IdentityType: 'Email',
                    IdentityValue: 'cos-alice@company.com',
                    DisplayName: 'Alice CoS Inbox',
                    IsActive: true,
                } as unknown as MJAIBridgeAgentIdentityEntity,
            ],
        });
        // Third call during calendarGate evaluation
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [],
        });

        const action = new VerifyMyCommunicationCapabilitiesAction();
        const params: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Params: [],
        };

        const result = await invokeAction(action, params);
        expect(result.Success).toBe(true);

        const reportParam = params.Params.find((p) => p.Name === 'CapabilitiesReport');
        const report = reportParam?.Value as {
            EnterpriseProviders: Array<{
                ProviderName: string;
                MailGate: { Allowed: boolean; UsingUtilityMailbox: boolean; TargetMailbox: string; ReasonCode: string };
                CalendarGate: { Allowed: boolean; ReasonCode: string };
            }>;
        };

        expect(report.EnterpriseProviders).toHaveLength(1);
        expect(report.EnterpriseProviders[0].MailGate.Allowed).toBe(true);
        expect(report.EnterpriseProviders[0].MailGate.UsingUtilityMailbox).toBe(true);
        expect(report.EnterpriseProviders[0].MailGate.TargetMailbox).toBe('cos-alice@company.com');
        expect(report.EnterpriseProviders[0].MailGate.ReasonCode).toBe('ALLOWED_UTILITY_MAILBOX');

        expect(report.EnterpriseProviders[0].CalendarGate.Allowed).toBe(false);
        expect(report.EnterpriseProviders[0].CalendarGate.ReasonCode).toBe('UTILITY_MAILBOXES_ONLY');
    });

    it('validates Posture 2 (SecurityGroupScoped + VerifyMailboxAccess): allows in-group users and denies out-of-group users', async () => {
        const gmailProvider = {
            ID: 'prov-gmail',
            Name: 'Gmail',
            Status: 'Active',
            SupportsCalendar: true,
            SupportsFreeBusy: true,
            EnterpriseScopeMode: 'SecurityGroupScoped',
            AllowedEmailDomains: 'company.com',
        } as unknown as MJCommunicationProviderEntity;
        providersList.push(gmailProvider);

        const verifyMock = vi
            .fn()
            // 1st call (Mail check): allowed
            .mockResolvedValueOnce({
                Success: true,
                Identifier: 'alice@company.com',
                CanReadMail: true,
                CanReadCalendar: true,
            })
            // 2nd call (Calendar check): denied by Exchange RBAC / Workspace scope
            .mockResolvedValueOnce({
                Success: false,
                Identifier: 'alice@company.com',
                CanReadMail: true,
                CanReadCalendar: false,
                ErrorMessage: 'ErrorAccessDenied: User is not in ApplicationAccessPolicy security group',
            });

        providerInstancesMap.set('Gmail', {
            supportsOperation: (op: string) => op === 'VerifyMailboxAccess',
            VerifyMailboxAccess: verifyMock,
        } as unknown as BaseCommunicationProvider);

        const action = new VerifyMyCommunicationCapabilitiesAction();
        const params: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Params: [],
        };

        const result = await invokeAction(action, params);
        expect(result.Success).toBe(true);

        const reportParam = params.Params.find((p) => p.Name === 'CapabilitiesReport');
        const report = reportParam?.Value as {
            EnterpriseProviders: Array<{
                MailGate: { Allowed: boolean; ReasonCode: string; TargetMailbox: string };
                CalendarGate: { Allowed: boolean; ReasonCode: string; Message: string };
            }>;
        };

        expect(report.EnterpriseProviders[0].MailGate.Allowed).toBe(true);
        expect(report.EnterpriseProviders[0].MailGate.ReasonCode).toBe('ALLOWED_PERSONAL_MAILBOX');
        expect(report.EnterpriseProviders[0].MailGate.TargetMailbox).toBe('alice@company.com');

        expect(report.EnterpriseProviders[0].CalendarGate.Allowed).toBe(false);
        expect(report.EnterpriseProviders[0].CalendarGate.ReasonCode).toBe('MAILBOX_ACCESS_DENIED_BY_TENANT_POLICY');
        expect(report.EnterpriseProviders[0].CalendarGate.Message).toContain('ApplicationAccessPolicy');
    });

    it('validates HubSpot Meetings API v3 and Calendly API v2 external scheduling connectors', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = String(input);
            if (url === 'https://api.hubapi.com/scheduler/v3/meetings/meeting-links') {
                return new Response(
                    JSON.stringify({
                        results: [
                            {
                                id: 'hs-link-1',
                                slug: 'exec-sync',
                                name: 'Executive Sync',
                                link: 'https://meetings.hubspot.com/alice/exec-sync',
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (url.includes('api.hubapi.com/scheduler/v3/meetings/meeting-links/book/availability-page/exec-sync')) {
                return new Response(
                    JSON.stringify({
                        linkAvailability: {
                            linkAvailabilityByDuration: {
                                '1800000': {
                                    availabilities: [
                                        {
                                            startMillisUtc: Date.parse('2026-10-27T15:00:00.000Z'),
                                            endMillisUtc: Date.parse('2026-10-27T15:30:00.000Z'),
                                        },
                                    ],
                                },
                            },
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (url.includes('api.calendly.com/event_type_available_times')) {
                return new Response(
                    JSON.stringify({
                        collection: [
                            {
                                start_time: '2026-10-27T16:00:00.000Z',
                                scheduling_url: 'https://calendly.com/alice/30min/2026-10-27T16:00:00Z',
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (url.includes('api.calendly.com/scheduling_links')) {
                return new Response(
                    JSON.stringify({
                        resource: {
                            booking_url: 'https://calendly.com/d/single-use-xyz',
                        },
                    }),
                    { status: 201, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response('Not Found', { status: 404 });
        });

        try {
            const availAction = new GetMyCalendarAndAvailabilityAction();
            const availParams: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: alice,
                Params: [
                    { Name: 'Operation', Value: 'CheckExternalSchedulingAvailability', Type: 'Input' },
                    { Name: 'HubSpotAccessToken', Value: 'hs-pat-test', Type: 'Input' },
                    { Name: 'HubSpotMeetingSlug', Value: 'exec-sync', Type: 'Input' },
                    { Name: 'CalendlyAccessToken', Value: 'cal-pat-test', Type: 'Input' },
                    { Name: 'CalendlyEventTypeUri', Value: 'https://api.calendly.com/event_types/EVT1', Type: 'Input' },
                ],
            };

            const availRes = await invokeAction(availAction, availParams);
            expect(availRes.Success).toBe(true);

            const calendlyLinkAction = new ManageMyCalendarEventAction();
            const linkParams: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: alice,
                Params: [
                    { Name: 'Operation', Value: 'CreateCalendlySingleUseLink', Type: 'Input' },
                    { Name: 'CalendlyAccessToken', Value: 'cal-pat-test', Type: 'Input' },
                    { Name: 'CalendlyEventTypeUri', Value: 'https://api.calendly.com/event_types/EVT1', Type: 'Input' },
                ],
            };
            const linkRes = await invokeAction(calendlyLinkAction, linkParams);
            expect(linkRes.Success).toBe(true);
            const bookingUrlParam = linkParams.Params.find((p) => p.Name === 'BookingUrl');
            expect(bookingUrlParam?.Value).toBe('https://calendly.com/d/single-use-xyz');
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

describe('Stage 8 Deliverable 4 — Posture 3 Per-User OAuth 2.0 (3LO) with PKCE (S256) & 4 Security Gates', () => {
    const alice = makeUser('00000000-0000-0000-0000-00000000A11C', 'Alice Executive', 'alice@company.com');
    const bob = makeUser('00000000-0000-0000-0000-00000000B0B2', 'Bob Peer', 'bob@company.com');

    const basePolicy: ProviderUserOAuthPolicyConfig = {
        ProviderName: 'Microsoft Graph',
        AllowUserDelegatedOAuth: true,
        AllowedEmailDomains: 'company.com,subsidiary.com',
        AllowedOAuthTenantIDs: ['tenant-corp-001'],
        ClientId: 'msgraph-client-id',
        AuthorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        TokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        RevocationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
        RedirectUri: 'https://mj.company.com/api/v1/communication-oauth/callback',
        Scopes: ['openid', 'profile', 'email', 'offline_access', 'Mail.ReadWrite', 'Calendars.ReadWrite'],
    };

    function createMockCredentialStore(): {
        store: IUserDelegatedCredentialStore;
        storeCalls: StoreUserDelegatedOAuthInput[];
        revokeCalls: Array<{ providerName: string; userId: string }>;
    } {
        const storeCalls: StoreUserDelegatedOAuthInput[] = [];
        const revokeCalls: Array<{ providerName: string; userId: string }> = [];

        const store: IUserDelegatedCredentialStore = {
            StoreUserDelegatedCredential: vi.fn(async (opts: StoreUserDelegatedOAuthInput) => {
                storeCalls.push(opts);
                return { ID: 'cred-3lo-alice' } as Pick<MJCredentialEntity, 'ID'>;
            }),
            GetUserDelegatedCredential: vi.fn(async (_providerName: string, user: UserInfo) => ({
                values: {
                    ownerUserId: user.ID,
                    principalEmail: user.Email,
                    providerName: 'Microsoft Graph',
                    accessToken: 'at-live-123',
                    refreshToken: 'rt-live-456',
                    tokenType: 'Bearer',
                    scope: 'Mail.ReadWrite',
                    tenantId: 'tenant-corp-001',
                    issuedAt: new Date().toISOString(),
                },
            })),
            RevokeUserDelegatedCredential: vi.fn(async (providerName: string, user: UserInfo) => {
                revokeCalls.push({ providerName, userId: user.ID });
                return true;
            }),
        };

        return { store, storeCalls, revokeCalls };
    }

    beforeEach(() => {
        CommunicationUserOAuthService.Instance.ClearPendingSessions();
    });

    it('generates RFC 7636 PKCE (S256) code_verifier and SHA-256 code_challenge', () => {
        const pkce = CommunicationUserOAuthService.Instance.GeneratePkcePair();
        expect(pkce.codeChallengeMethod).toBe('S256');
        expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);

        const expectedChallenge = crypto
            .createHash('sha256')
            .update(pkce.codeVerifier, 'ascii')
            .digest('base64url');
        expect(pkce.codeChallenge).toBe(expectedChallenge);
    });

    it('enforces Gate 1 (AllowUserDelegatedOAuth === true) before initiating OAuth', () => {
        const disabledPolicy: ProviderUserOAuthPolicyConfig = {
            ...basePolicy,
            AllowUserDelegatedOAuth: false,
        };

        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(disabledPolicy, alice);
        expect(initRes.Success).toBe(false);
        expect(initRes.ResultCode).toBe('GATE_1_USER_OAUTH_DISABLED');
        expect(initRes.AuthorizationUrl).toBeNull();
    });

    it('enforces Gate 2 (AllowedEmailDomains) when user or token domain is outside corporate allowlist', async () => {
        const externalUser = makeUser('user-ext', 'Contractor', 'contractor@gmail.com');
        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(basePolicy, externalUser);
        expect(initRes.Success).toBe(false);
        expect(initRes.ResultCode).toBe('GATE_2_DOMAIN_MISMATCH');
    });

    it('enforces Gate 3 (AllowedOAuthTenantIDs) when token tenant ID does not match corporate tenant allowlist', async () => {
        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(basePolicy, alice);
        expect(initRes.Success).toBe(true);

        const transport: IOAuthTokenTransport = {
            ExchangeAuthorizationCode: vi.fn(async () => ({
                AccessToken: 'at-1',
                PrincipalEmail: 'alice@company.com',
                TenantID: 'rogue-tenant-999',
            })),
        };

        const cbRes = await CommunicationUserOAuthService.Instance.HandleOAuthCallback({
            state: initRes.State!,
            code: 'auth-code-123',
            policy: basePolicy,
            contextUser: alice,
            transport,
        });

        expect(cbRes.Success).toBe(false);
        expect(cbRes.ResultCode).toBe('GATE_3_TENANT_MISMATCH');
        expect(cbRes.CredentialID).toBeNull();
    });

    it('enforces Gate 4 (Strict Principal Match: token.email === contextUser.Email) to block cross-account linking', async () => {
        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(basePolicy, alice);
        expect(initRes.Success).toBe(true);

        // Alice tries to authenticate with Bob's corporate account during the OAuth popup
        const transport: IOAuthTokenTransport = {
            ExchangeAuthorizationCode: vi.fn(async () => ({
                AccessToken: 'at-bob',
                PrincipalEmail: bob.Email, // bob@company.com != alice@company.com
                TenantID: 'tenant-corp-001',
            })),
        };

        const cbRes = await CommunicationUserOAuthService.Instance.HandleOAuthCallback({
            state: initRes.State!,
            code: 'auth-code-bob',
            policy: basePolicy,
            contextUser: alice,
            transport,
        });

        expect(cbRes.Success).toBe(false);
        expect(cbRes.ResultCode).toBe('GATE_4_PRINCIPAL_EMAIL_MISMATCH');
        expect(cbRes.CredentialID).toBeNull();
    });

    it('reads the admin gates from the MJ: Communication Providers row (AllowUserDelegatedOAuth, domains, tenant allowlist)', () => {
        const providerRow = {
            Name: 'Microsoft Graph',
            AllowUserDelegatedOAuth: true,
            AllowedEmailDomains: 'company.com,subsidiary.com',
            AllowedOAuthTenantIDs: ' tenant-corp-001 , tenant-corp-002 ,',
        } as unknown as MJCommunicationProviderEntity;

        expect(ReadProviderUserOAuthGates(providerRow)).toEqual({
            ProviderName: 'Microsoft Graph',
            AllowUserDelegatedOAuth: true,
            AllowedEmailDomains: 'company.com,subsidiary.com',
            AllowedOAuthTenantIDs: ['tenant-corp-001', 'tenant-corp-002'],
        });

        const closedRow = {
            Name: 'Gmail',
            AllowUserDelegatedOAuth: false,
            AllowedEmailDomains: null,
            AllowedOAuthTenantIDs: null,
        } as unknown as MJCommunicationProviderEntity;
        const gates = ReadProviderUserOAuthGates(closedRow);
        expect(gates.AllowUserDelegatedOAuth).toBe(false);
        expect(gates.AllowedOAuthTenantIDs).toBeNull();
        expect(CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow({ ...basePolicy, ...gates }, alice).ResultCode)
            .toBe('GATE_1_USER_OAUTH_DISABLED');
    });

    it('stores through CredentialEngine.Instance when no credential store is injected', async () => {
        credentialEngineMock.StoreUserDelegatedCredential.mockClear();
        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(basePolicy, alice);
        expect(initRes.Success).toBe(true);

        const transport: IOAuthTokenTransport = {
            ExchangeAuthorizationCode: vi.fn(async () => ({
                AccessToken: 'at-engine',
                PrincipalEmail: 'alice@company.com',
                TenantID: 'tenant-corp-001',
            })),
        };
        const cbRes = await CommunicationUserOAuthService.Instance.HandleOAuthCallback({
            state: initRes.State!,
            code: 'auth-code-engine',
            policy: basePolicy,
            contextUser: alice,
            transport,
        });

        expect(cbRes.Success).toBe(true);
        expect(cbRes.CredentialID).toBe('cred-from-engine');
        expect(credentialEngineMock.StoreUserDelegatedCredential).toHaveBeenCalledTimes(1);
        const [opts, user] = credentialEngineMock.StoreUserDelegatedCredential.mock.calls[0] as unknown as [
            { ownerUserId: string; providerName: string },
            UserInfo,
        ];
        expect(opts.ownerUserId).toBe(alice.ID);
        expect(opts.providerName).toBe('Microsoft Graph');
        expect(user.ID).toBe(alice.ID);
    });

    it('completes full PKCE (S256) flow, stores OwnerUserID-isolated credential, and supports one-click Disconnect & Revoke', async () => {
        const { store, storeCalls, revokeCalls } = createMockCredentialStore();

        const initRes = CommunicationUserOAuthService.Instance.InitiateAuthorizationFlow(basePolicy, alice);
        expect(initRes.Success).toBe(true);
        expect(initRes.AuthorizationUrl).toContain('code_challenge_method=S256');
        expect(initRes.AuthorizationUrl).toContain('login_hint=alice%40company.com');

        const revokeProviderMock = vi.fn(async () => true);
        const transport: IOAuthTokenTransport = {
            ExchangeAuthorizationCode: vi.fn(async ({ codeVerifier }) => {
                // Verify the codeVerifier sent to token endpoint hashes to the codeChallenge in the initiate URL
                const challenge = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
                expect(challenge).toBe(initRes.CodeChallenge);
                return {
                    AccessToken: 'at-alice-valid',
                    RefreshToken: 'rt-alice-valid',
                    ExpiresInSeconds: 3600,
                    PrincipalEmail: 'ALICE@company.com',
                    TenantID: 'tenant-corp-001',
                };
            }),
            RevokeToken: revokeProviderMock,
        };

        const cbRes = await CommunicationUserOAuthService.Instance.HandleOAuthCallback({
            state: initRes.State!,
            code: 'auth-code-valid',
            policy: basePolicy,
            contextUser: alice,
            transport,
            credentialStore: store,
        });

        expect(cbRes.Success).toBe(true);
        expect(cbRes.ResultCode).toBe('OAUTH_CONNECTED');
        expect(cbRes.CredentialID).toBe('cred-3lo-alice');
        expect(cbRes.OwnerUserID).toBe(alice.ID);
        expect(cbRes.PrincipalEmail).toBe('alice@company.com');
        expect(storeCalls).toHaveLength(1);
        expect(storeCalls[0]).toMatchObject({
            ownerUserId: alice.ID,
            principalEmail: 'alice@company.com',
            providerName: 'Microsoft Graph',
        });

        // One-Click Disconnect & Revoke
        const disconnectRes = await CommunicationUserOAuthService.Instance.DisconnectAndRevokeUserOAuth({
            policy: basePolicy,
            contextUser: alice,
            transport,
            credentialStore: store,
        });

        expect(disconnectRes.Success).toBe(true);
        expect(disconnectRes.ResultCode).toBe('OAUTH_DISCONNECTED');
        expect(disconnectRes.RevokedAtProvider).toBe(true);
        expect(disconnectRes.CredentialDeactivated).toBe(true);
        expect(revokeProviderMock).toHaveBeenCalledTimes(1);
        expect(revokeCalls).toEqual([{ providerName: 'Microsoft Graph', userId: alice.ID }]);
    });
});
