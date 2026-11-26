import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LocalCacheManager } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import {
    MJ_USER_IMPERSONATION_TRANSPORT,
    MJUserImpersonationService,
    type MJImpersonationAppAdapter,
    type MJImpersonationMode,
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
    canImpersonateWithWrites?: boolean;
    activeAppPath?: string;
    activeAppName?: string;
    connectShouldFail?: boolean;
    expiresAt?: string;
}): TestHarness {
    const canImpersonate = opts?.canImpersonate ?? true;
    const canImpersonateWithWrites = opts?.canImpersonateWithWrites ?? false;
    const disposedProviders: MJImpersonationProviderLike[] = [];

    const executeGql = vi.fn().mockImplementation(async (query: string, variables?: Record<string, unknown>) => {
        if (query.includes('MJCanImpersonateUsers')) {
            return {
                MJCanImpersonateUsers: {
                    CanImpersonate: canImpersonate,
                    CanImpersonateWithWrites: canImpersonate && canImpersonateWithWrites,
                    AuthorizationName: 'User Impersonation',
                    WriteAuthorizationName: 'User Impersonation: Act As (Allow Writes)',
                    DefaultTTLMinutes: 15,
                    MaxTTLMinutes: 60,
                    ResultCode: canImpersonate ? 'OK' : 'FEATURE_DISABLED',
                    Message: canImpersonate ? 'Authorized' : 'Disabled',
                },
            };
        }
        if (query.includes('MJListImpersonatableUsers')) {
            return {
                MJListImpersonatableUsers: {
                    Authorized: canImpersonate,
                    ResultCode: canImpersonate ? 'OK' : 'FEATURE_DISABLED',
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
            const input = (variables?.['input'] ?? {}) as { TargetUserID?: string; Mode?: MJImpersonationMode };
            const isB = input.TargetUserID === USER_B_ID;
            const mode: MJImpersonationMode = input.Mode === 'ActAs' ? 'ActAs' : 'ViewAs';
            return {
                MJStartUserImpersonation: {
                    Success: true,
                    ResultCode: 'IMPERSONATION_STARTED',
                    RawApiKey: isB ? 'mj_sk_key_b_secret' : 'mj_sk_key_a_secret',
                    APIKeyID: isB ? KEY_B_ID : KEY_A_ID,
                    ExpiresAt: opts?.expiresAt ?? '2027-12-01T12:00:00.000Z',
                    Mode: mode,
                    ReadOnly: mode !== 'ActAs',
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
            Token: 'eyJ_mock_jwt',
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
                    ID: rawApiKey === 'mj_sk_key_b_secret' ? USER_B_ID : USER_A_ID,
                    Name: rawApiKey === 'mj_sk_key_b_secret' ? 'Cara Manager' : 'Bob Analyst',
                    Email: rawApiKey === 'mj_sk_key_b_secret' ? 'cara@example.com' : 'bob@example.com',
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

    it('defaults canImpersonate and canImpersonateWithWrites to false and reflects server dual-gate check', async () => {
        const denied = createServiceHarness({ canImpersonate: false });
        expect(denied.service.CanImpersonate).toBe(false);
        expect(denied.service.CanImpersonateWithWrites).toBe(false);
        expect(await denied.service.CheckCanImpersonate()).toBe(false);

        const roOnly = createServiceHarness({ canImpersonate: true, canImpersonateWithWrites: false });
        expect(await roOnly.service.CheckCanImpersonate()).toBe(true);
        expect(roOnly.service.CanImpersonate).toBe(true);
        expect(roOnly.service.CanImpersonateWithWrites).toBe(false);
        expect(roOnly.service.CurrentState.defaultTtlMinutes).toBe(15);
        expect(roOnly.service.CurrentState.maxTtlMinutes).toBe(60);

        // Rejects ActAs client-side when canImpersonateWithWrites is false
        const actAsDenied = await roOnly.service.StartImpersonation(USER_A_ID, undefined, 'ActAs');
        expect(actAsDenied.success).toBe(false);
        expect(roOnly.service.IsImpersonating).toBe(false);
    });

    it('defaults to Read-Only ViewAs mode, never retains rawApiKey on service state, suppresses UserInfoEngine writes during RO, and restores on Exit', async () => {
        const { service, actorProvider, transport, activeProviderRef, disposedProviders } =
            createServiceHarness({ canImpersonate: true });

        const engine = UserInfoEngine.Instance;
        const originalSetSetting = engine.SetSetting;
        const setSettingSpy = vi.fn().mockResolvedValue(true);
        engine.SetSetting = setSettingSpy;

        try {
            await service.CheckCanImpersonate();
            const startA = await service.StartImpersonation(USER_A_ID);
            expect(startA.success).toBe(true);
            expect(service.IsImpersonating).toBe(true);
            expect(service.IsReadOnlySession).toBe(true);
            expect(service.CurrentState.mode).toBe('ViewAs');
            expect(service.CurrentState.readOnly).toBe(true);
            expect(JSON.stringify(service.CurrentState)).not.toContain('mj_sk_key_a_secret');

            // UserInfoEngine.SetSetting is suppressed while in Read-Only impersonation
            await engine.SetSetting('explorer.test.pref', '1');
            expect(setSettingSpy).not.toHaveBeenCalled();

            // Switch directly User A -> User B serializes cleanly, revokes Key A, disposes Provider A
            const startB = await service.StartImpersonation(USER_B_ID);
            expect(startB.success).toBe(true);
            expect(service.ActiveTarget?.userId).toBe(USER_B_ID);
            expect(transport.syncProviderReferences).toHaveBeenCalledTimes(2);
            expect(actorProvider.ExecuteGQL).toHaveBeenCalledWith(
                expect.stringContaining('MJEndUserImpersonation'),
                { input: { APIKeyID: KEY_A_ID } }
            );
            expect(disposedProviders).toHaveLength(1);

            // Exit restores original actor provider AND restores UserInfoEngine.SetSetting
            const exitRes = await service.ExitImpersonation();
            expect(exitRes.success).toBe(true);
            expect(service.IsImpersonating).toBe(false);
            expect(activeProviderRef.current).toBe(actorProvider);
            await engine.SetSetting('explorer.test.pref', '2');
            expect(setSettingSpy).toHaveBeenCalledWith('explorer.test.pref', '2');
        } finally {
            engine.SetSetting = originalSetSetting;
        }
    });

    it('serializes concurrent StartImpersonation calls through transition mutex without race conditions', async () => {
        const { service, actorProvider } = createServiceHarness({ canImpersonate: true });
        await service.CheckCanImpersonate();

        const [resA, resB] = await Promise.all([
            service.StartImpersonation(USER_A_ID),
            service.StartImpersonation(USER_B_ID),
        ]);
        expect(resA.success).toBe(true);
        expect(resB.success).toBe(true);
        expect(service.ActiveTarget?.userId).toBe(USER_B_ID);
        expect(actorProvider.ExecuteGQL).toHaveBeenCalledWith(
            expect.stringContaining('MJEndUserImpersonation'),
            { input: { APIKeyID: KEY_A_ID } }
        );
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

        await service.StartImpersonation(USER_A_ID);
        expect(afterSwitchSpy).toHaveBeenCalledWith(
            expect.objectContaining({ userId: USER_A_ID, organization: 'Acme Corp' })
        );

        await service.ExitImpersonation();
        expect(afterSwitchSpy).toHaveBeenCalledWith(null);

        unregisterCrm();
        expect(service.GetActiveAdapters()).toEqual([]);
    });

    it('emits MJEventType.TenantChanged and clears LocalCacheManager on default workspace reset to isolate actor and target caches', async () => {
        const raiseSpy = vi.spyOn(MJGlobal.Instance, 'RaiseEvent');
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        const clearAllSpy = vi.spyOn(LocalCacheManager.Instance, 'ClearAll').mockResolvedValue(0);
        const actorProvider: MJImpersonationProviderLike = {
            CurrentUser: {
                ID: ACTOR_USER_ID,
                Name: 'Alice',
                Email: 'alice@example.com',
            } as MJImpersonationProviderLike['CurrentUser'],
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
                            Mode: 'ViewAs',
                            ReadOnly: true,
                            TargetUser: {
                                UserID: USER_A_ID,
                                Name: 'Bob',
                                Email: 'bob@example.com',
                                RoleNames: [],
                            },
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
        expect(clearAllSpy).toHaveBeenCalledTimes(1);

        await service.ExitImpersonation();
        expect(clearAllSpy).toHaveBeenCalledTimes(2);
    });
});
