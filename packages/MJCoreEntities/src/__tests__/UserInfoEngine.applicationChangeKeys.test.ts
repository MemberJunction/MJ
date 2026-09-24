import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

let mockCurrentUser: { ID: string; UserRoles: { UserID: string; RoleID: string }[] };

/** Every `PropertyName` the engine declared on its last `Config()` call. */
let mockDeclaredConfigs: Array<{ PropertyName: string }>;
/** Property names passed to `emitPropertyChange`, in call order. */
let mockEmittedNames: string[];
/** Configs passed to `notifyAlreadyAppliedMutation`, in call order. */
let mockNotifiedConfigs: Array<{ PropertyName: string }>;

let mockRunViewResults: { Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string };

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
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
            async Load(configs: Array<{ PropertyName: string }>): Promise<void> {
                mockDeclaredConfigs = configs;
            }
            get Configs() {
                return mockDeclaredConfigs;
            }
            GetConfigData<T>(propertyName: string): T[] {
                return ((this as unknown as Record<string, T[]>)[propertyName] ?? []) as T[];
            }
            emitPropertyChange(propertyName: string): void {
                mockEmittedNames.push(propertyName);
            }
            notifyAlreadyAppliedMutation(config: { PropertyName: string }): void {
                mockNotifiedConfigs.push(config);
            }
            get ProviderToUse() {
                return {
                    get CurrentUser() { return mockCurrentUser; },
                    Applications: [],
                    ProviderType: 'Network',
                };
            }
            get RunViewProviderToUse() {
                return {};
            }
            get ContextUser() {
                return mockCurrentUser;
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class MockMetadata {
            get CurrentUser() {
                return mockCurrentUser;
            }
        },
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
        LogStatus: vi.fn(),
        RunView: class MockRunView {
            constructor(_provider?: unknown) {}
            async RunView() {
                return mockRunViewResults;
            }
        },
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

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks
// ---------------------------------------------------------------------------

import { UserInfoEngine } from '../engines/UserInfoEngine';

const USER_ID = 'U0000000-0000-0000-0000-000000000001';
const APP_ID = 'A0000000-0000-0000-0000-0000000000AA';

/** The config key the applications cache is registered under. */
function applicationsPropertyName(): string {
    const config = mockDeclaredConfigs.find((c) => c.PropertyName.toLowerCase() === '_userapplications');
    if (!config) throw new Error('no applications config declared');
    return config.PropertyName;
}

/**
 * The applications cache is addressed by string in five places — the config, the observable,
 * two reads, the uninstall lookup and the repair emit. `BaseEngine` keys observers by string,
 * so a rename that moves only some of them still compiles and silently drops notifications.
 * These tests assert the runtime keys against the DECLARED config rather than a literal, so
 * they fail whichever side of a half-rename is left behind.
 */
describe('UserInfoEngine — application cache change keys', () => {
    let engine: UserInfoEngine;

    beforeEach(async () => {
        engine = UserInfoEngine.Instance;
        mockCurrentUser = { ID: USER_ID, UserRoles: [] };
        mockDeclaredConfigs = [];
        mockEmittedNames = [];
        mockNotifiedConfigs = [];
        mockRunViewResults = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };

        await engine.Config(true, mockCurrentUser as never);
        (engine as unknown as { _loadedForUserId: string })._loadedForUserId = USER_ID;
        (engine as unknown as { _applicationRoles: unknown[] })._applicationRoles = [];
    });

    it('notifies observers after UninstallApplication splices the cache', async () => {
        const userApp = {
            ID: 'UA-1',
            UserID: USER_ID,
            ApplicationID: APP_ID,
            Sequence: 0,
            IsActive: true,
            Delete: vi.fn().mockResolvedValue(true),
            LatestResult: null,
        };
        (engine as unknown as { _userApplications: unknown[] })._userApplications = [userApp];

        const result = await engine.UninstallApplication(APP_ID);

        expect(result).toBe(true);
        expect(userApp.Delete).toHaveBeenCalled();
        // The splice happened, so the debounced BaseEngine handler stays silent and this
        // code owns the notification. Losing it leaves the app switcher showing a dead app.
        expect(mockNotifiedConfigs.map((c) => c.PropertyName)).toContain(applicationsPropertyName());
    });

    it('emits on the declared property name when repairing the cache from the database', async () => {
        (engine as unknown as { _userApplications: unknown[] })._userApplications = [];
        mockRunViewResults = {
            Success: true,
            Results: [{ ID: 'UA-1', UserID: USER_ID, ApplicationID: APP_ID, Sequence: 0, IsActive: true }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
        };

        await engine.CreateDefaultApplications();

        // ObserveProperty subscribes under the config's PropertyName; an emit on any other
        // string reaches nobody, so the repaired cache never propagates to the UI.
        expect(mockEmittedNames).toContain(applicationsPropertyName());
    });
});
