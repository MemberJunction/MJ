import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import type { BaseEnginePropertyConfig, IMetadataProvider, ProviderType, UserInfo } from '@memberjunction/core';
import type { MJUserApplicationEntity } from '../generated/entity_subclasses';

interface StubUserApp {
    ID: string;
    UserID: string;
    ApplicationID: string;
    Application: string;
    Sequence: number;
}

const dataChangeSubject = new Subject<string>();
let mockDefaultProviderType: ProviderType = 'Network';
let mockDefaultCurrentUser: { ID: string } | undefined;
let appsByUserId = new Map<string, StubUserApp[]>();
let nextLoadShouldThrow: Error | null = null;

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
            public readonly DataChange$ = dataChangeSubject.asObservable();

            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }

            get ProviderToUse(): {
                ProviderType: ProviderType;
                CurrentUser: { ID: string } | undefined;
                Applications: Array<{ ID: string; Name: string; DefaultSequence: number }>;
            } {
                return {
                    ProviderType: mockDefaultProviderType,
                    CurrentUser: mockDefaultCurrentUser,
                    Applications: [],
                };
            }

            protected GetConfigData<E>(name: string): E[] {
                const value = Reflect.get(this, name) as E[] | undefined;
                return value ?? [];
            }

            async Load(
                _configs: Partial<BaseEnginePropertyConfig>[],
                _provider?: IMetadataProvider,
                _forceRefresh?: boolean,
                contextUser?: UserInfo
            ): Promise<void> {
                if (nextLoadShouldThrow) {
                    const err = nextLoadShouldThrow;
                    nextLoadShouldThrow = null;
                    throw err;
                }
                const targetUserId = contextUser?.ID ?? mockDefaultCurrentUser?.ID ?? '';
                const rows = appsByUserId.get(targetUserId) ?? [];
                Reflect.set(this, '_userApplications', rows);
                // BaseEngine.Load populates properties and emits DataChange$ synchronously
                // before returning to the caller.
                dataChangeSubject.next('_userApplications');
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

describe('UserInfoEngine.Config — User-Switch DataChange$ Race', () => {
    beforeEach(() => {
        mockDefaultProviderType = 'Network';
        mockDefaultCurrentUser = { ID: USER_A.ID };
        nextLoadShouldThrow = null;
        appsByUserId = new Map<string, StubUserApp[]>([
            [
                USER_A.ID,
                [
                    {
                        ID: 'ua-a-1',
                        UserID: USER_A.ID,
                        ApplicationID: 'app-home',
                        Application: 'Home',
                        Sequence: 0,
                    },
                ],
            ],
            [
                USER_B.ID,
                [
                    {
                        ID: 'ua-b-1',
                        UserID: USER_B.ID,
                        ApplicationID: 'app-community',
                        Application: 'Community',
                        Sequence: 0,
                    },
                    {
                        ID: 'ua-b-2',
                        UserID: USER_B.ID,
                        ApplicationID: 'app-chat',
                        Application: 'Chat',
                        Sequence: 1,
                    },
                ],
            ],
        ]);
    });

    it('lets DataChange$ subscribers immediately read the new user UserApplications during a client user switch', async () => {
        const engine = createFreshEngine();
        const observedDuringEmissions: MJUserApplicationEntity[][] = [];

        const sub = (engine as unknown as { DataChange$: typeof dataChangeSubject }).DataChange$.subscribe(() => {
            observedDuringEmissions.push(engine.UserApplications);
        });

        try {
            // Initial load as USER_A
            await engine.Config(false, USER_A);
            expect(observedDuringEmissions).toHaveLength(1);
            expect(observedDuringEmissions[0].map((a) => a.Application)).toEqual(['Home']);

            // Switch to USER_B on the client — DataChange$ fires synchronously inside super.Load()
            mockDefaultCurrentUser = { ID: USER_B.ID };
            await engine.Config(false, USER_B);

            expect(observedDuringEmissions).toHaveLength(2);
            expect(observedDuringEmissions[1].map((a) => a.Application)).toEqual(['Community', 'Chat']);
            expect(engine.UserApplications.map((a) => a.Application)).toEqual(['Community', 'Chat']);
        } finally {
            sub.unsubscribe();
        }
    });

    it('restores _loadedForUserId and rethrows when super.Load fails during a user switch', async () => {
        const engine = createFreshEngine();

        await engine.Config(false, USER_A);
        expect(Reflect.get(engine, '_loadedForUserId')).toBe(USER_A.ID);
        expect(engine.UserApplications.map((a) => a.Application)).toEqual(['Home']);

        nextLoadShouldThrow = new Error('Network failure during user switch');
        mockDefaultCurrentUser = { ID: USER_B.ID };

        await expect(engine.Config(false, USER_B)).rejects.toThrow('Network failure during user switch');
        expect(Reflect.get(engine, '_loadedForUserId')).toBe(USER_A.ID);
        expect(engine.UserApplications.map((a) => a.Application)).toEqual(['Home']);
    });
});
