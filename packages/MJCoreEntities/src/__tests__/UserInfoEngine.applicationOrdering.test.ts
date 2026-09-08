import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test.
// Exercises the UserApplications ordering (Sequence → Application.DefaultSequence
// → Application name). Duplicate Sequences are reachable without user action
// (new rows default to 0; nextUserApplicationSequence returns 0 for a user with
// no active rows), and before this ordering existed a tie resolved purely
// alphabetically — which is how "Accounting" beat "Home" as the session landing
// app for users who never touched the ordering UI.
// ============================================================================

let mockUserAppRows: Record<string, unknown>[] = [];
let mockApplications: { ID: string; Name: string; DefaultSequence?: number }[] = [];

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
            GetConfigData(_propertyName: string): Record<string, unknown>[] {
                return mockUserAppRows;
            }
            get ProviderToUse() {
                return {
                    Applications: mockApplications,
                };
            }
            emitPropertyChange(_name: string): void {
                // no-op in tests
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class MockMetadata {},
        ApplicationInfo: class {},
        RegisterForStartup: () => () => {},
        UserInfo: class {},
        LogStatus: vi.fn(),
        RunView: class MockRunView {},
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'USER-1';

interface StubUserAppRow {
    ID: string;
    UserID: string;
    ApplicationID: string;
    Application: string;
    Sequence: number;
    IsActive: boolean;
}

function makeRow(overrides: Partial<StubUserAppRow> & Pick<StubUserAppRow, 'ID' | 'ApplicationID' | 'Application'>): StubUserAppRow {
    return {
        UserID: USER_ID,
        Sequence: 0,
        IsActive: true,
        ...overrides,
    };
}

function orderedApplicationNames(
    rows: StubUserAppRow[],
    applications: { ID: string; Name: string; DefaultSequence?: number }[]
): string[] {
    mockUserAppRows = rows as unknown as Record<string, unknown>[];
    mockApplications = applications;
    const engine = UserInfoEngine.Instance;
    Reflect.set(engine, '_loadedForUserId', USER_ID);
    return engine.UserApplications.map((ua) => ua.Application ?? '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserInfoEngine.UserApplications ordering', () => {
    it('orders by the user-owned Sequence first', () => {
        const names = orderedApplicationNames(
            [
                makeRow({ ID: 'UA-1', ApplicationID: 'APP-ACC', Application: 'Accounting', Sequence: 2 }),
                makeRow({ ID: 'UA-2', ApplicationID: 'APP-HOME', Application: 'Home', Sequence: 0 }),
                makeRow({ ID: 'UA-3', ApplicationID: 'APP-ADM', Application: 'Admin', Sequence: 1 }),
            ],
            [
                { ID: 'APP-HOME', Name: 'Home', DefaultSequence: -1 },
                { ID: 'APP-ADM', Name: 'Admin', DefaultSequence: 100 },
                { ID: 'APP-ACC', Name: 'Accounting', DefaultSequence: 100 },
            ]
        );
        expect(names).toEqual(['Home', 'Admin', 'Accounting']);
    });

    it('breaks a Sequence tie by Application.DefaultSequence, not alphabetically (the landing-app regression)', () => {
        // Both rows at Sequence 0 — reachable without the user reordering anything.
        // Alphabetical tie-break would put "Accounting" first; DefaultSequence -1
        // must keep Home ahead.
        const names = orderedApplicationNames(
            [
                makeRow({ ID: 'UA-1', ApplicationID: 'APP-ACC', Application: 'Accounting', Sequence: 0 }),
                makeRow({ ID: 'UA-2', ApplicationID: 'APP-HOME', Application: 'Home', Sequence: 0 }),
            ],
            [
                { ID: 'APP-HOME', Name: 'Home', DefaultSequence: -1 },
                { ID: 'APP-ACC', Name: 'Accounting', DefaultSequence: 100 },
            ]
        );
        expect(names).toEqual(['Home', 'Accounting']);
    });

    it('falls back to application name when Sequence AND DefaultSequence tie', () => {
        const names = orderedApplicationNames(
            [
                makeRow({ ID: 'UA-1', ApplicationID: 'APP-B', Application: 'Bravo', Sequence: 0 }),
                makeRow({ ID: 'UA-2', ApplicationID: 'APP-A', Application: 'Alpha', Sequence: 0 }),
            ],
            [
                { ID: 'APP-A', Name: 'Alpha', DefaultSequence: 100 },
                { ID: 'APP-B', Name: 'Bravo', DefaultSequence: 100 },
            ]
        );
        expect(names).toEqual(['Alpha', 'Bravo']);
    });

    it('treats an application missing from metadata as DefaultSequence 100', () => {
        const names = orderedApplicationNames(
            [
                makeRow({ ID: 'UA-1', ApplicationID: 'APP-GONE', Application: 'Aardvark', Sequence: 0 }),
                makeRow({ ID: 'UA-2', ApplicationID: 'APP-HOME', Application: 'Home', Sequence: 0 }),
            ],
            [{ ID: 'APP-HOME', Name: 'Home', DefaultSequence: -1 }]
        );
        expect(names).toEqual(['Home', 'Aardvark']);
    });
});
