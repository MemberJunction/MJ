import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseEnginePropertyConfig, IMetadataProvider, ProviderType, UserInfo } from '@memberjunction/core';

interface LoadCallRecord {
    configs: Partial<BaseEnginePropertyConfig>[];
    provider: IMetadataProvider | undefined;
    forceRefresh: boolean | undefined;
    contextUser: UserInfo | undefined;
}

const loadCalls: LoadCallRecord[] = [];
let mockDefaultProviderType: ProviderType = 'Database';
let mockDefaultCurrentUser: { ID: string } | undefined = { ID: '00000000-0000-4000-8000-000000000001' };

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: object) => target,
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
            get ProviderToUse(): { ProviderType: ProviderType; CurrentUser: { ID: string } | undefined } {
                return {
                    ProviderType: mockDefaultProviderType,
                    CurrentUser: mockDefaultCurrentUser,
                };
            }
            async Load(
                configs: Partial<BaseEnginePropertyConfig>[],
                provider?: IMetadataProvider,
                forceRefresh?: boolean,
                contextUser?: UserInfo
            ): Promise<void> {
                loadCalls.push({ configs, provider, forceRefresh, contextUser });
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        RunView: class {},
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
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

import { UserInfoEngine } from '../engines/UserInfoEngine';

const USER_A = { ID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' } as UserInfo;
const USER_B = { ID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB' } as UserInfo;

function createFreshEngine(): UserInfoEngine {
    const Ctor = UserInfoEngine as unknown as { new (): UserInfoEngine };
    return new Ctor();
}

describe('UserInfoEngine.Config — Server vs Client Multi-User Reload Behavior', () => {
    beforeEach(() => {
        loadCalls.length = 0;
        mockDefaultProviderType = 'Database';
        mockDefaultCurrentUser = { ID: USER_A.ID };
    });

    it('does NOT forceRefresh or clobber _loadedForUserId across different users on a server Database provider', async () => {
        mockDefaultProviderType = 'Database';
        const engine = createFreshEngine();

        await engine.Config(false, USER_A);
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].forceRefresh).toBe(false);
        expect(loadCalls[0].configs.every(c => c.Filter === undefined)).toBe(true);

        // Second request under USER_B must NOT trigger a full 8-table BypassCache reload
        await engine.Config(false, USER_B);
        expect(loadCalls).toHaveLength(2);
        expect(loadCalls[1].forceRefresh).toBe(false);
        expect(Reflect.get(engine, '_loadedForUserId')).toBe(USER_A.ID);
    });

    it('DOES forceRefresh and update _loadedForUserId when switching users on a client Network provider', async () => {
        mockDefaultProviderType = 'Network';
        const engine = createFreshEngine();

        await engine.Config(false, USER_A);
        expect(loadCalls).toHaveLength(1);
        expect(loadCalls[0].forceRefresh).toBe(false);
        expect(loadCalls[0].configs.find(c => c.PropertyName === '_userSettings')?.Filter).toBe(
            `UserID='${USER_A.ID}'`
        );

        // Same user with different UUID casing does NOT trigger a redundant forceRefresh
        const userALower = { ID: USER_A.ID.toLowerCase() } as UserInfo;
        await engine.Config(false, userALower);
        expect(loadCalls[1].forceRefresh).toBe(false);

        // Switching to USER_B on the client DOES forceRefresh and re-scopes the UserID filter
        await engine.Config(false, USER_B);
        expect(loadCalls[2].forceRefresh).toBe(true);
        expect(loadCalls[2].configs.find(c => c.PropertyName === '_userSettings')?.Filter).toBe(
            `UserID='${USER_B.ID}'`
        );
        expect(Reflect.get(engine, '_loadedForUserId')).toBe(USER_B.ID);
    });

    it('uses the explicit provider argument ProviderType when passed to Config()', async () => {
        mockDefaultProviderType = 'Database';
        const engine = createFreshEngine();
        const explicitNetworkProvider = {
            ProviderType: 'Network' as ProviderType,
            CurrentUser: USER_A,
        } as unknown as IMetadataProvider;

        await engine.Config(false, USER_A, explicitNetworkProvider);
        expect(loadCalls[0].configs.find(c => c.PropertyName === '_userSettings')?.Filter).toBe(
            `UserID='${USER_A.ID}'`
        );
    });
});
