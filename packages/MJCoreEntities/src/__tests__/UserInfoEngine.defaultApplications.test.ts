import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test.
// GetDefaultApplicationsForNewUser is a pure static, but importing UserInfoEngine
// still pulls in the engine's dependencies, so we stub them out (mirrors the
// setup in UserInfoEngine.repairApplications.test.ts).
// ============================================================================

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
        BaseEngine: class MockBaseEngine {},
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

interface StubApp {
    ID: string;
    Name: string;
    DefaultForNewUser: boolean;
    Status: 'Active' | 'Disabled' | 'Pending';
    DefaultSequence?: number;
}

function makeApp(overrides: Partial<StubApp> & Pick<StubApp, 'ID' | 'Name'>): StubApp {
    return {
        DefaultForNewUser: true,
        Status: 'Active',
        DefaultSequence: 0,
        ...overrides,
    };
}

/** Invoke the selector with a stub metadata source exposing only `Applications`. */
function select(apps: StubApp[]): StubApp[] {
    const md = { Applications: apps } as unknown as Parameters<
        typeof UserInfoEngine.GetDefaultApplicationsForNewUser
    >[0];
    return UserInfoEngine.GetDefaultApplicationsForNewUser(md) as unknown as StubApp[];
}

// ---------------------------------------------------------------------------
// Tests — bug F2: single source of truth for default-app provisioning
// ---------------------------------------------------------------------------

describe('UserInfoEngine.GetDefaultApplicationsForNewUser (F2)', () => {
    it('returns Active apps flagged DefaultForNewUser', () => {
        const apps = [
            makeApp({ ID: 'A', Name: 'Home', DefaultSequence: 0 }),
            makeApp({ ID: 'B', Name: 'Admin', DefaultSequence: 1 }),
        ];
        expect(select(apps).map((a) => a.ID)).toEqual(['A', 'B']);
    });

    it('EXCLUDES an inactive app even when flagged DefaultForNewUser (the F2 regression)', () => {
        const apps = [
            makeApp({ ID: 'A', Name: 'Home', Status: 'Active' }),
            makeApp({ ID: 'B', Name: 'Retired', Status: 'Disabled' }),
        ];
        const ids = select(apps).map((a) => a.ID);
        expect(ids).toEqual(['A']);
        expect(ids).not.toContain('B');
    });

    it('excludes Active apps NOT flagged DefaultForNewUser', () => {
        const apps = [
            makeApp({ ID: 'A', Name: 'Home', DefaultForNewUser: true }),
            makeApp({ ID: 'B', Name: 'Optional', DefaultForNewUser: false }),
        ];
        expect(select(apps).map((a) => a.ID)).toEqual(['A']);
    });

    it('sorts by DefaultSequence ascending', () => {
        const apps = [
            makeApp({ ID: 'C', Name: 'Third', DefaultSequence: 20 }),
            makeApp({ ID: 'A', Name: 'First', DefaultSequence: 0 }),
            makeApp({ ID: 'B', Name: 'Second', DefaultSequence: 10 }),
        ];
        expect(select(apps).map((a) => a.ID)).toEqual(['A', 'B', 'C']);
    });

    it('treats a missing DefaultSequence as 100 for ordering', () => {
        const apps = [
            makeApp({ ID: 'NOSEQ', Name: 'Unsequenced', DefaultSequence: undefined }),
            makeApp({ ID: 'SEQ50', Name: 'Sequenced', DefaultSequence: 50 }),
        ];
        // SEQ50 (50) sorts before NOSEQ (defaulted to 100)
        expect(select(apps).map((a) => a.ID)).toEqual(['SEQ50', 'NOSEQ']);
    });

    it('returns an empty array when no app qualifies', () => {
        const apps = [
            makeApp({ ID: 'A', Name: 'Inactive default', Status: 'Disabled' }),
            makeApp({ ID: 'B', Name: 'Active non-default', DefaultForNewUser: false }),
        ];
        expect(select(apps)).toEqual([]);
    });
});
