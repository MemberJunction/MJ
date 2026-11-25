import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import {
    MJ_USER_IMPERSONATION_TRANSPORT,
    MJUserImpersonationService,
    type MJImpersonationAppAdapter,
    type MJImpersonationProviderLike,
    type MJImpersonationTransportAdapter,
} from './index';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_A_ID = '22222222-2222-4222-8222-222222222222';
const USER_B_ID = '33333333-3333-4333-8333-333333333333';
const KEY_A_ID = 'aaaa1111-1111-4111-8111-111111111111';
const KEY_B_ID = 'bbbb2222-2222-4222-8222-222222222222';

interface TestHarness {
    service: MJUserImpersonationService;
    actorProvider: MJImpersonationProviderLike & { ExecuteGQL: ReturnType<typeof vi.fn> };
    transport: MJImpersonationTransportAdapter & {
        installProvider: ReturnType<typeof vi.fn>;
        createImpersonatedProvider: ReturnType<typeof vi.fn>;
        syncProviderReferences: ReturnType<typeof vi.fn>;
        resetWorkspaceAfterSwitch: ReturnType<typeof vi.fn>;
    };
    activeProviderRef: { current: MJImpersonationProviderLike | null };
    disposedProviders: MJImpersonationProviderLike[];
}

function createServiceHarness(opts?: {
    canImpersonate?: boolean;
    activeAppPath?: string;
    activeAppName?: string;
    connectShouldFail?: boolean;
}): TestHarness {
    const canImpersonate = opts?.canImpersonate ?? true;
    const disposedProviders: MJImpersonationProviderLike[] = [];

    const executeGql = vi.fn().mockImplementation(async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('MJCanImpersonateUsers')) {
            return {
                MJCanImpersonateUsers: {
                    CanImpersonate: canImpersonate,
                    AuthorizationName: 'User Impersonation',
                    ResultCode: canImpersonate ? 'OK' : 'FORBIDDEN',
                    Message: canImpersonate ? 'Authorized' : 'Denied',
                },
            };
        }
        if (query.includes('MJListImpersonatableUsers')) {
            return {
                MJListImpersonatableUsers: {
                    Authorized: canImpersonate,
                    ResultCode: canImpersonate ? 'OK' : 'FORBIDDEN',
                    TotalCount: 2,
                    Users: canImpersonate
                        ? [
                              {
                                  UserID: USER_A_ID,
                                  Name: 'Bob Analyst',
                                  FirstName: 'Bob',
                                  LastName: 'Analyst',
                                  Email: 'bob@example.com',
                                  Title: 'Analyst',
                                  Type: 'User',
                                  RoleNames: ['Analyst'],
                              },
                              {
                                  UserID: USER_B_ID,
                                  Name: 'Cara Manager',
                                  FirstName: 'Cara',
                                  LastName: 'Manager',
                                  Email: 'cara@example.com',
                                  Title: 'Manager',
                                  Type: 'User',
                                  RoleNames: ['Manager'],
                              },
                          ]
                        : [],
                },
            };
        }
        if (query.includes('MJStartUserImpersonation')) {
            const input = (variables?.['input'] ?? {}) as { TargetUserID?: string };
            const isB = input.TargetUserID === USER_B_ID;
            return {
                MJStartUserImpersonation: {
                    Success: true,
                    ResultCode: 'IMPERSONATION_STARTED',
                    RawApiKey: isB ? 'mj_sk_key_b' : 'mj_sk_key_a',
                    APIKeyID: isB ? KEY_B_ID : KEY_A_ID,
                    ExpiresAt: '2026-12-01T12:00:00.000Z',
                    TargetUser: isB
                        ? {
                              UserID: USER_B_ID,
                              Name: 'Cara Manager',
                              Email: 'cara@example.com',
                              RoleNames: ['Manager'],
                          }
                        : {
                              UserID: USER_A_ID,
                              Name: 'Bob Analyst',
                              Email: 'bob@example.com',
                              RoleNames: ['Analyst'],
                          },
                },
            };
        }
        if (query.includes('MJEndUserImpersonation')) {
            const input = (variables?.['input'] ?? {}) as { APIKeyID?: string };
            return {
                MJEndUserImpersonation: {
                    Success: true,
                    ResultCode: 'IMPERSONATION_ENDED',
                    APIKeyID: input.APIKeyID,
                },
            };
        }
        return {};
    });

    const actorProvider = {
        CurrentUser: {
            ID: ACTOR_USER_ID,
            Name: 'Alice Admin',
            Email: 'alice@example.com',
        } as MJImpersonationProviderLike['CurrentUser'],
        ConfigData: {
            URL: 'https://api.example.com/graphql',
            WSURL: 'wss://api.example.com/graphql',
        },
        ExecuteGQL: executeGql,
    };

    const activeProviderRef: { current: MJImpersonationProviderLike | null } = {
        current: actorProvider,
    };

    const transport = {
        getActiveProvider: () => activeProviderRef.current,
        installProvider: vi.fn((p: MJImpersonationProviderLike) => {
            activeProviderRef.current = p;
        }),
        createImpersonatedProvider: vi.fn(async ({ rawApiKey }: { rawApiKey: string }) => {
            if (opts?.connectShouldFail) {
                throw new Error('WebSocket handshake failed');
            }
            const created: MJImpersonationProviderLike = {
                CurrentUser: {
                    ID: rawApiKey === 'mj_sk_key_b' ? USER_B_ID : USER_A_ID,
                    Name: rawApiKey === 'mj_sk_key_b' ? 'Cara Manager' : 'Bob Analyst',
                    Email: rawApiKey === 'mj_sk_key_b' ? 'cara@example.com' : 'bob@example.com',
                } as MJImpersonationProviderLike['CurrentUser'],
                ExecuteGQL: vi.fn().mockResolvedValue({}),
                Dispose: vi.fn(() => {
                    disposedProviders.push(created);
                }),
            };
            return created;
        }),
        syncProviderReferences: vi.fn().mockResolvedValue(undefined),
        resetWorkspaceAfterSwitch: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            MJUserImpersonationService,
            { provide: MJ_USER_IMPERSONATION_TRANSPORT, useValue: transport },
            {
                provide: ApplicationManager,
                useValue: {
                    GetActiveApp: () =>
                        opts?.activeAppPath || opts?.activeAppName
                            ? { Path: opts?.activeAppPath ?? '', Name: opts?.activeAppName ?? '' }
                            : null,
                },
            },
        ],
    });

    const service = TestBed.inject(MJUserImpersonationService);
    return {
        service,
        actorProvider,
        transport,
        activeProviderRef,
        disposedProviders,
    };
}

describe('MJUserImpersonationService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('defaults canImpersonate to false and reflects server authorization check', async () => {
        const denied = createServiceHarness({ canImpersonate: false });
        expect(denied.service.CanImpersonate).toBe(false);
        expect(await denied.service.CheckCanImpersonate()).toBe(false);
        expect(denied.service.CanImpersonate).toBe(false);

        const allowed = createServiceHarness({ canImpersonate: true });
        expect(await allowed.service.CheckCanImpersonate()).toBe(true);
        expect(allowed.service.CanImpersonate).toBe(true);
    });

    it('preserves original actor provider across User A -> User B -> Exit and revokes old keys', async () => {
        const { service, actorProvider, transport, activeProviderRef, disposedProviders } =
            createServiceHarness({ canImpersonate: true });

        await service.CheckCanImpersonate();
        const startA = await service.StartImpersonation(USER_A_ID);
        expect(startA.success).toBe(true);
        expect(service.IsImpersonating).toBe(true);
        expect(service.ActiveTarget?.userId).toBe(USER_A_ID);
        expect(activeProviderRef.current).not.toBe(actorProvider);
        expect(transport.syncProviderReferences).toHaveBeenCalledTimes(1);

        // Switch directly from User A -> User B using the preserved original actor provider
        const startB = await service.StartImpersonation(USER_B_ID);
        expect(startB.success).toBe(true);
        expect(service.ActiveTarget?.userId).toBe(USER_B_ID);
        // Key A must have been revoked via the original actor provider and provider A disposed
        expect(actorProvider.ExecuteGQL).toHaveBeenCalledWith(
            expect.stringContaining('MJEndUserImpersonation'),
            { input: { APIKeyID: KEY_A_ID } }
        );
        expect(disposedProviders).toHaveLength(1);

        // Exit impersonation restores original actor provider and revokes Key B
        const exitRes = await service.ExitImpersonation();
        expect(exitRes.success).toBe(true);
        expect(service.IsImpersonating).toBe(false);
        expect(service.ActiveTarget).toBeNull();
        expect(activeProviderRef.current).toBe(actorProvider);
        expect(actorProvider.ExecuteGQL).toHaveBeenCalledWith(
            expect.stringContaining('MJEndUserImpersonation'),
            { input: { APIKeyID: KEY_B_ID } }
        );
        expect(disposedProviders).toHaveLength(2);
    });

    it('silently revokes minted key if impersonated provider connection fails', async () => {
        const { service, actorProvider, activeProviderRef } = createServiceHarness({
            canImpersonate: true,
            connectShouldFail: true,
        });

        await service.CheckCanImpersonate();
        const res = await service.StartImpersonation(USER_A_ID);
        expect(res.success).toBe(false);
        expect(service.IsImpersonating).toBe(false);
        expect(activeProviderRef.current).toBe(actorProvider);
        expect(actorProvider.ExecuteGQL).toHaveBeenCalledWith(
            expect.stringContaining('MJEndUserImpersonation'),
            { input: { APIKeyID: KEY_A_ID } }
        );
    });

    it('applies active MJImpersonationAppAdapter enrichment, filtering, and afterSwitch hooks', async () => {
        const { service } = createServiceHarness({
            canImpersonate: true,
            activeAppPath: 'crm',
            activeAppName: 'CRM',
        });

        const afterSwitchSpy = vi.fn();
        const crmAdapter: MJImpersonationAppAdapter = {
            id: 'crm-adapter',
            appPaths: ['crm'],
            priority: 10,
            title: 'View CRM As User',
            enrichCandidates: (users) =>
                users.map((u) =>
                    u.userId === USER_A_ID
                        ? {
                              ...u,
                              organization: 'Acme Corp',
                              categoryKey: 'external',
                              badges: [{ label: 'VIP', tone: 'brand' }],
                          }
                        : { ...u, hidden: true }
                ),
            afterSwitch: afterSwitchSpy,
        };
        const otherAppAdapter: MJImpersonationAppAdapter = {
            id: 'other-adapter',
            appPaths: ['finance'],
            title: 'Should Not Apply',
        };

        const unregisterCrm = service.RegisterAppAdapter(crmAdapter);
        service.RegisterAppAdapter(otherAppAdapter);

        expect(service.GetActiveAdapters().map((a) => a.id)).toEqual(['crm-adapter']);

        await service.CheckCanImpersonate();
        const users = await service.LoadUsers('', true);
        expect(users).toHaveLength(1);
        expect(users[0].organization).toBe('Acme Corp');
        expect(users[0].badges?.[0].label).toBe('VIP');

        await service.StartImpersonation(USER_A_ID);
        expect(afterSwitchSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A_ID, organization: 'Acme Corp' }));

        await service.ExitImpersonation();
        expect(afterSwitchSpy).toHaveBeenCalledWith(null);

        unregisterCrm();
        expect(service.GetActiveAdapters()).toEqual([]);
    });

    it('emits MJEventType.TenantChanged on default workspace reset to flush cached tabs', async () => {
        const raiseSpy = vi.spyOn(MJGlobal.Instance, 'RaiseEvent');
        const actorProvider: MJImpersonationProviderLike = {
            CurrentUser: { ID: ACTOR_USER_ID, Name: 'Alice', Email: 'alice@example.com' } as MJImpersonationProviderLike['CurrentUser'],
            ExecuteGQL: vi.fn().mockImplementation(async (query: string) => {
                if (query.includes('MJCanImpersonateUsers')) {
                    return { MJCanImpersonateUsers: { CanImpersonate: true } };
                }
                if (query.includes('MJStartUserImpersonation')) {
                    return {
                        MJStartUserImpersonation: {
                            Success: true,
                            RawApiKey: 'mj_sk_x',
                            APIKeyID: KEY_A_ID,
                            TargetUser: { UserID: USER_A_ID, Name: 'Bob', Email: 'bob@example.com', RoleNames: [] },
                        },
                    };
                }
                return {};
            }),
        };

        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                MJUserImpersonationService,
                {
                    provide: MJ_USER_IMPERSONATION_TRANSPORT,
                    useValue: {
                        getActiveProvider: () => actorProvider,
                        installProvider: vi.fn(),
                        createImpersonatedProvider: vi.fn().mockResolvedValue(actorProvider),
                        syncProviderReferences: vi.fn().mockResolvedValue(undefined),
                    } satisfies MJImpersonationTransportAdapter,
                },
            ],
        });

        const service = TestBed.inject(MJUserImpersonationService);
        await service.CheckCanImpersonate();
        await service.StartImpersonation(USER_A_ID);

        expect(raiseSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: MJEventType.TenantChanged })
        );
    });
});
