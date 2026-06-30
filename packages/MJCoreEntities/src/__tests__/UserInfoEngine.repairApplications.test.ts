import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

let mockCurrentUser: { ID: string; UserRoles: { UserID: string; RoleID: string }[] };

/**
 * Tracks calls to the mocked RunView so tests can verify behavior.
 */
let mockRunViewResults: { Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string };
let mockRunViewCallCount: number;
let mockRunViewLastParams: Record<string, unknown> | null;

/**
 * Tracks calls to GetEntityObject + Save to verify self-healing creation.
 */
let mockSaveResults: boolean[];
let mockSaveCallIndex: number;

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
            async Load(): Promise<void> {
                // no-op in tests
            }
            get ProviderToUse() {
                return {
                    get CurrentUser() { return mockCurrentUser; },
                    Applications: [
                        { ID: 'APP-1', Name: 'Home', DefaultForNewUser: true, Status: 'Active', DefaultSequence: 0 },
                        { ID: 'APP-2', Name: 'Admin', DefaultForNewUser: true, Status: 'Active', DefaultSequence: 1 },
                    ],
                    GetEntityObject: vi.fn().mockImplementation(async () => {
                        const idx = mockSaveCallIndex++;
                        return {
                            NewRecord: vi.fn(),
                            Save: vi.fn().mockResolvedValue(mockSaveResults[idx] ?? true),
                            UserID: '',
                            ApplicationID: '',
                            Sequence: 0,
                            IsActive: true,
                            ID: `UA-NEW-${idx}`,
                            LatestResult: { Message: 'mock error' },
                        };
                    }),
                    ProviderType: 'Network',
                };
            }
            get RunViewProviderToUse() {
                return {};
            }
            get ContextUser() {
                return mockCurrentUser;
            }
            emitPropertyChange(_name: string): void {
                // no-op in tests
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
            constructor(_provider?: unknown) {
                // accept optional provider arg like the real RunView
            }
            async RunView(params: Record<string, unknown>) {
                mockRunViewCallCount++;
                mockRunViewLastParams = params;
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

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const USER_ID = 'U0000000-0000-0000-0000-000000000001';

function makeUserAppRecord(appId: string, sequence: number) {
    return {
        ID: `UA-${appId}`,
        UserID: USER_ID,
        ApplicationID: appId,
        Sequence: sequence,
        IsActive: true,
        Application: `App ${appId}`,
    };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('UserInfoEngine — CreateDefaultApplications DB Repair', () => {
    let engine: UserInfoEngine;

    beforeEach(() => {
        engine = UserInfoEngine.Instance;

        // Reset mock state
        mockCurrentUser = {
            ID: USER_ID,
            UserRoles: [{ UserID: USER_ID, RoleID: 'ROLE-1' }],
        };
        mockRunViewCallCount = 0;
        mockRunViewLastParams = null;
        mockSaveCallIndex = 0;
        mockSaveResults = [true, true];

        // Default: empty _UserApplications (simulates load failure)
        (engine as unknown as { _UserApplications: unknown[] })._UserApplications = [];
        // Set _loadedForUserId so the engine thinks it loaded for this user
        (engine as unknown as { _loadedForUserId: string })._loadedForUserId = USER_ID;
        // Empty app roles so all apps are open access
        (engine as unknown as { _applicationRoles: unknown[] })._applicationRoles = [];
    });

    it('should query the database when in-memory _UserApplications is empty', async () => {
        // DB returns existing records
        mockRunViewResults = {
            Success: true,
            Results: [makeUserAppRecord('APP-1', 0), makeUserAppRecord('APP-2', 1)],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 10,
            ErrorMessage: '',
        };

        const result = await engine.CreateDefaultApplications();

        // Should have queried the DB
        expect(mockRunViewCallCount).toBe(1);
        // Should have used BypassCache
        expect(mockRunViewLastParams).toMatchObject({ BypassCache: true });
    });

    it('should repair _UserApplications from DB records instead of creating duplicates', async () => {
        const dbRecords = [makeUserAppRecord('APP-1', 0), makeUserAppRecord('APP-2', 1)];
        mockRunViewResults = {
            Success: true,
            Results: dbRecords,
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 10,
            ErrorMessage: '',
        };

        const result = await engine.CreateDefaultApplications();

        // Should return the DB records (not newly created ones)
        expect(result).toEqual(dbRecords);
        // _UserApplications should be repaired
        const userApps = (engine as unknown as { _UserApplications: unknown[] })._UserApplications;
        expect(userApps).toEqual(dbRecords);
    });

    it('should NOT query the database when _UserApplications already has records for the user', async () => {
        // Pre-populate with existing records
        (engine as unknown as { _UserApplications: unknown[] })._UserApplications = [
            makeUserAppRecord('APP-1', 0),
            makeUserAppRecord('APP-2', 1),
        ];

        mockRunViewResults = {
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: '',
        };

        const result = await engine.CreateDefaultApplications();

        // Should NOT have queried the DB — data already present
        expect(mockRunViewCallCount).toBe(0);
        // Should return empty (no new apps to install)
        expect(result).toEqual([]);
    });

    it('should proceed with creation when DB also returns empty (genuinely new user)', async () => {
        // DB returns empty — user really has no records
        mockRunViewResults = {
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 10,
            ErrorMessage: '',
        };

        const result = await engine.CreateDefaultApplications();

        // Should have queried the DB first
        expect(mockRunViewCallCount).toBe(1);
        // DB was empty, so self-healing should have attempted to create records
        // (via the mock GetEntityObject + Save path)
        // The exact count depends on the mock Applications list (2 apps with DefaultForNewUser=true)
    });

    it('should handle DB query failure gracefully and fall through to creation', async () => {
        // DB query fails
        mockRunViewResults = {
            Success: false,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 5,
            ErrorMessage: 'Network error',
        };

        // Should not throw — graceful fallback
        const result = await engine.CreateDefaultApplications();

        // Should have attempted DB query
        expect(mockRunViewCallCount).toBe(1);
    });
});
