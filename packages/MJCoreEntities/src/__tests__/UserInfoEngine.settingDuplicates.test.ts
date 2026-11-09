import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #4224: `__mj.UserSetting` had no unique key on (UserID, Setting), so duplicates piled up and
 * `GetSetting` returned whichever row loaded first. The engine now reads the newest row, and
 * `SetSetting` on a cache miss looks the row up in the database before creating one.
 */

const USER_ID = 'U0000000-0000-0000-0000-000000000001';

interface FakeSetting {
    ID: string;
    UserID: string;
    Setting: string;
    Value: string;
    __mj_UpdatedAt: Date;
    IsSaved: boolean;
    Save: ReturnType<typeof vi.fn>;
    NewRecord: ReturnType<typeof vi.fn>;
}

function fakeSetting(id: string, setting: string, value: string, updatedAt: string): FakeSetting {
    return {
        ID: id,
        UserID: USER_ID,
        Setting: setting,
        Value: value,
        __mj_UpdatedAt: new Date(updatedAt),
        IsSaved: true,
        Save: vi.fn().mockResolvedValue(true),
        NewRecord: vi.fn(),
    };
}

let dbRows: FakeSetting[] = [];
let dbSuccess = true;
const runViewCalls: Array<{ ExtraFilter: string }> = [];
const createdRecords: FakeSetting[] = [];

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
            get ProviderToUse() {
                return {
                    CurrentUser: { ID: USER_ID },
                    async GetEntityObject(): Promise<FakeSetting> {
                        const record = fakeSetting('new-row', '', '', '2026-01-01T00:00:00Z');
                        record.IsSaved = false;
                        createdRecords.push(record);
                        return record;
                    },
                };
            }
            get RunViewProviderToUse() {
                return {};
            }
            get ContextUser() {
                return undefined;
            }
            IsPropertyPermissionConstrained(): boolean {
                return false;
            }
            protected GetConfigData<E>(name: string): E[] {
                return ((this as unknown as Record<string, unknown>)[name] as E[]) ?? [];
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        RunView: class {
            async RunView(params: { ExtraFilter: string }) {
                runViewCalls.push(params);
                return dbSuccess
                    ? { Success: true, Results: dbRows, ErrorMessage: '' }
                    : { Success: false, Results: [], ErrorMessage: 'boom' };
            }
        },
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
    };
});

vi.mock('../generated/entity_subclasses', () => ({
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

type EngineState = {
    _loadedForUserId: string | null;
    _userSettings: FakeSetting[];
};

function freshEngine(settings: FakeSetting[]): UserInfoEngine {
    const engine = new (UserInfoEngine as unknown as { new (): UserInfoEngine })();
    const state = engine as unknown as EngineState;
    state._loadedForUserId = USER_ID;
    state._userSettings = settings;
    return engine;
}

describe('UserInfoEngine — duplicate settings (#4224)', () => {
    beforeEach(() => {
        dbRows = [];
        dbSuccess = true;
        runViewCalls.length = 0;
        createdRecords.length = 0;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('GetSetting and GetSettingEntity return the newest of several rows for one key', () => {
        const older = fakeSetting('a', 'Explorer.Theme', 'light', '2026-01-01T00:00:00Z');
        const newest = fakeSetting('b', 'Explorer.Theme', 'dark', '2026-03-01T00:00:00Z');
        const middle = fakeSetting('c', 'Explorer.Theme', 'blue', '2026-02-01T00:00:00Z');
        const engine = freshEngine([older, newest, middle]);

        expect(engine.GetSetting('Explorer.Theme')).toBe('dark');
        expect(engine.GetSettingEntity('Explorer.Theme')?.ID).toBe('b');
    });

    it('SetSetting on a cache miss updates the row the database already has instead of creating one', async () => {
        const existing = fakeSetting('db-row', 'Explorer.Theme', 'light', '2026-01-01T00:00:00Z');
        dbRows = [existing];
        const engine = freshEngine([]);

        await expect(engine.SetSetting('Explorer.Theme', 'dark')).resolves.toBe(true);

        expect(createdRecords).toHaveLength(0);
        expect(existing.Value).toBe('dark');
        expect(existing.Save).toHaveBeenCalledTimes(1);
        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].ExtraFilter).toContain(`UserID='${USER_ID}'`);
        expect(runViewCalls[0].ExtraFilter).toContain(`Setting='Explorer.Theme'`);
        expect(engine.GetSettingEntity('Explorer.Theme')?.ID).toBe('db-row');
    });

    it('SetSetting creates a row when neither the cache nor the database has one', async () => {
        const engine = freshEngine([]);

        await expect(engine.SetSetting('Explorer.Theme', 'dark')).resolves.toBe(true);

        expect(createdRecords).toHaveLength(1);
        expect(createdRecords[0].Setting).toBe('Explorer.Theme');
        expect(createdRecords[0].Value).toBe('dark');
    });

    it('SetSetting with a cached row does not query the database', async () => {
        const cached = fakeSetting('cached', 'Explorer.Theme', 'light', '2026-01-01T00:00:00Z');
        const engine = freshEngine([cached]);

        await expect(engine.SetSetting('Explorer.Theme', 'dark')).resolves.toBe(true);

        expect(runViewCalls).toHaveLength(0);
        expect(cached.Value).toBe('dark');
    });

    it('a failed database lookup falls back to create and logs a warning', async () => {
        dbSuccess = false;
        const engine = freshEngine([]);

        await expect(engine.SetSetting('Explorer.Theme', 'dark')).resolves.toBe(true);

        expect(createdRecords).toHaveLength(1);
        expect(console.warn).toHaveBeenCalled();
    });

    it("escapes quotes in the setting key used in the lookup filter", async () => {
        const engine = freshEngine([]);

        await engine.SetSetting("it's", 'x');

        expect(runViewCalls[0].ExtraFilter).toContain(`Setting='it''s'`);
    });
});
