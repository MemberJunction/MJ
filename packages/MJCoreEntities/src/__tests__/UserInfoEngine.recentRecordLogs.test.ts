import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

interface MockUser {
    ID: string;
}

interface MockProvider {
    ProviderType: 'Network' | 'Database';
    CurrentUser: MockUser | undefined;
    Applications: never[];
}

interface CapturedConfig {
    EntityName?: string;
    PropertyName?: string;
}

interface CapturedRunViewParams {
    EntityName: string;
    ExtraFilter: string;
    OrderBy: string;
    MaxRows: number;
    ResultType: string;
}

interface MockRunViewResult {
    Success: boolean;
    Results: { ID: string }[];
    ErrorMessage?: string;
}

const state = vi.hoisted(() => ({
    engineProvider: undefined as MockProvider | undefined,
    loadedConfigs: [] as CapturedConfig[],
    runViewResult: { Success: true, Results: [] } as MockRunViewResult,
    runViewCalls: [] as { provider: MockProvider; params: CapturedRunViewParams; user: MockUser | undefined }[],
    logError: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => {
    return {
        BaseEngine: class MockBaseEngine {
            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }
            async Load(configs: CapturedConfig[]): Promise<void> {
                state.loadedConfigs = configs;
            }
            get ProviderToUse(): MockProvider | undefined {
                return state.engineProvider;
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
        LogStatus: vi.fn(),
        LogError: state.logError,
        RunView: {
            FromMetadataProvider: (provider: MockProvider) => ({
                RunView: async (params: CapturedRunViewParams, user: MockUser | undefined) => {
                    state.runViewCalls.push({ provider, params, user });
                    return state.runViewResult;
                },
            }),
        },
    };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJApplicationRoleEntity: class {},
    MJUserNotificationEntity: class {},
    MJUserNotificationTypeEntity: class {},
    MJWorkspaceEntity: class {},
    MJUserApplicationEntity: class {},
    MJUserFavoriteEntity: class {},
    MJUserRecordLogEntity: class {},
    MJUserSettingEntity: class {},
    MJUserNotificationPreferenceEntity: class {},
}));

import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '../engines/UserInfoEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENGINE_USER: MockUser = { ID: 'U0000000-0000-0000-0000-000000000001' };
const OTHER_USER: MockUser = { ID: 'U0000000-0000-0000-0000-000000000002' };

function makeProvider(providerType: MockProvider['ProviderType'], currentUser: MockUser | undefined): MockProvider {
    return { ProviderType: providerType, CurrentUser: currentUser, Applications: [] };
}

function asUser(user: MockUser): UserInfo {
    return user as unknown as UserInfo;
}

function asProvider(provider: MockProvider): IMetadataProvider {
    return provider as unknown as IMetadataProvider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserInfoEngine — record logs are queried, not cached', () => {
    let engine: UserInfoEngine;

    beforeEach(() => {
        engine = UserInfoEngine.Instance;
        state.engineProvider = makeProvider('Network', ENGINE_USER);
        state.loadedConfigs = [];
        state.runViewCalls = [];
        state.runViewResult = { Success: true, Results: [] };
        state.logError.mockClear();
    });

    describe('Config', () => {
        it.each(['Network', 'Database'] as const)('does not register MJ: User Record Logs on a %s provider', async (providerType) => {
            state.engineProvider = makeProvider(providerType, ENGINE_USER);

            await engine.Config(true, asUser(ENGINE_USER));

            expect(state.loadedConfigs.length).toBeGreaterThan(0);
            expect(state.loadedConfigs.map((c) => c.EntityName)).not.toContain('MJ: User Record Logs');
        });
    });

    describe('LoadRecentRecordLogs', () => {
        it("queries the user's logs, newest first, limited to maxItems", async () => {
            state.runViewResult = { Success: true, Results: [{ ID: 'log-1' }, { ID: 'log-2' }] };

            const logs = await engine.LoadRecentRecordLogs(7, asUser(OTHER_USER));

            expect(logs.map((l) => l.ID)).toEqual(['log-1', 'log-2']);
            expect(state.runViewCalls).toHaveLength(1);
            expect(state.runViewCalls[0].params).toEqual({
                EntityName: 'MJ: User Record Logs',
                ExtraFilter: `UserID='${OTHER_USER.ID}'`,
                OrderBy: 'LatestAt DESC',
                MaxRows: 7,
                ResultType: 'entity_object',
            });
            expect(state.runViewCalls[0].user).toBe(OTHER_USER);
        });

        it("defaults to the engine provider and that provider's current user", async () => {
            await engine.LoadRecentRecordLogs(5);

            expect(state.runViewCalls[0].provider).toBe(state.engineProvider);
            expect(state.runViewCalls[0].params.ExtraFilter).toBe(`UserID='${ENGINE_USER.ID}'`);
        });

        it("queries through the provider it is given, and uses that provider's current user", async () => {
            const other = makeProvider('Network', OTHER_USER);

            await engine.LoadRecentRecordLogs(5, undefined, asProvider(other));

            expect(state.runViewCalls[0].provider).toBe(other);
            expect(state.runViewCalls[0].params.ExtraFilter).toBe(`UserID='${OTHER_USER.ID}'`);
        });

        it('does not need Config to have run', async () => {
            state.runViewResult = { Success: true, Results: [{ ID: 'log-1' }] };
            const fresh = new (UserInfoEngine as unknown as new () => UserInfoEngine)();

            const logs = await fresh.LoadRecentRecordLogs(3);

            expect(logs).toHaveLength(1);
        });

        it('returns [] without querying when there is no user', async () => {
            state.engineProvider = makeProvider('Network', undefined);

            const logs = await engine.LoadRecentRecordLogs(5);

            expect(logs).toEqual([]);
            expect(state.runViewCalls).toHaveLength(0);
        });

        it('returns [] and logs the error when the query fails', async () => {
            state.runViewResult = { Success: false, Results: [], ErrorMessage: 'boom' };

            const logs = await engine.LoadRecentRecordLogs(5);

            expect(logs).toEqual([]);
            expect(state.logError).toHaveBeenCalledWith(expect.stringContaining('boom'));
        });
    });
});
