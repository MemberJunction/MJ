import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be defined before importing the module under test
// ============================================================================

let mockCurrentUser: { ID: string; UserRoles: { UserID: string; RoleID: string }[] };

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
            async Load(): Promise<void> {
                // no-op in tests
            }
            // Multi-provider migration: engines now use this.ProviderToUse instead of new Metadata()
            get ProviderToUse() {
                return {
                    get CurrentUser() { return mockCurrentUser; },
                    Applications: [],
                };
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class MockMetadata {
            get CurrentUser() {
                return mockCurrentUser;
            }
            Applications = [];
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

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks
// ---------------------------------------------------------------------------

import { UserInfoEngine } from '../engines/UserInfoEngine';

/**
 * Minimal shape of MJApplicationRoleEntity for test purposes.
 * The engine reads ApplicationID/RoleID/CanAccess — these plain-object stubs
 * satisfy those property accesses without requiring full BaseEntity mocking.
 */
interface ApplicationRoleRecord {
  ID: string;
  ApplicationID: string;
  RoleID: string;
  CanAccess: boolean;
  CanAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const APP_ADMIN = 'A0000000-0000-0000-0000-000000000001';
const APP_HOME = 'A0000000-0000-0000-0000-000000000002';
const APP_OPEN = 'A0000000-0000-0000-0000-000000000003'; // no role records

const ROLE_UI = 'R0000000-0000-0000-0000-000000000001';
const ROLE_DEV = 'R0000000-0000-0000-0000-000000000002';
const ROLE_INTEGRATION = 'R0000000-0000-0000-0000-000000000003';

const USER_ID = 'U0000000-0000-0000-0000-000000000001';

function makeAppRole(
    applicationId: string,
    roleId: string,
    canAccess: boolean,
    canAdmin: boolean
): ApplicationRoleRecord {
    return {
        ID: `AR-${applicationId}-${roleId}`,
        ApplicationID: applicationId,
        RoleID: roleId,
        CanAccess: canAccess,
        CanAdmin: canAdmin,
    };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('UserInfoEngine — Application Role Enforcement', () => {
    let engine: UserInfoEngine;

    beforeEach(() => {
        engine = UserInfoEngine.Instance;

        // Seed ApplicationRole data directly into the private field
        const appRoles: ApplicationRoleRecord[] = [
            // Admin: Developer=access+admin, Integration=access
            makeAppRole(APP_ADMIN, ROLE_DEV, true, true),
            makeAppRole(APP_ADMIN, ROLE_INTEGRATION, true, false),
            // Home: UI=access, Developer=access+admin, Integration=access
            makeAppRole(APP_HOME, ROLE_UI, true, false),
            makeAppRole(APP_HOME, ROLE_DEV, true, true),
            makeAppRole(APP_HOME, ROLE_INTEGRATION, true, false),
            // APP_OPEN: no records → open access
        ];
        (engine as unknown as { _applicationRoles: ApplicationRoleRecord[] })._applicationRoles = appRoles;

        // Default: user has only the UI role
        mockCurrentUser = {
            ID: USER_ID,
            UserRoles: [{ UserID: USER_ID, RoleID: ROLE_UI }],
        };
    });

    // ========================================================================
    // UserHasApplicationAccess
    // ========================================================================

    describe('UserHasApplicationAccess', () => {
        it('should return true for apps with zero ApplicationRole records (open access)', () => {
            expect(engine.UserHasApplicationAccess(APP_OPEN)).toBe(true);
        });

        it('should return true when user has a role with CanAccess=true', () => {
            // UI role has CanAccess for Home
            expect(engine.UserHasApplicationAccess(APP_HOME)).toBe(true);
        });

        it('should return false when user lacks any role with CanAccess=true', () => {
            // UI role is not assigned to Admin
            expect(engine.UserHasApplicationAccess(APP_ADMIN)).toBe(false);
        });

        it('should return true when user has multiple roles and one grants access', () => {
            mockCurrentUser.UserRoles = [
                { UserID: USER_ID, RoleID: ROLE_UI },
                { UserID: USER_ID, RoleID: ROLE_DEV },
            ];
            expect(engine.UserHasApplicationAccess(APP_ADMIN)).toBe(true);
        });

        it('should return false when user has no roles at all', () => {
            mockCurrentUser.UserRoles = [];
            expect(engine.UserHasApplicationAccess(APP_ADMIN)).toBe(false);
        });

        it('should return false when CanAccess is false for the matching role', () => {
            // Replace Admin's Dev role with CanAccess=false
            const appRoles = (engine as unknown as { _applicationRoles: ApplicationRoleRecord[] })._applicationRoles;
            const idx = appRoles.findIndex(
                ar => ar.ApplicationID === APP_ADMIN && ar.RoleID === ROLE_DEV
            );
            appRoles[idx] = makeAppRole(APP_ADMIN, ROLE_DEV, false, true);

            mockCurrentUser.UserRoles = [{ UserID: USER_ID, RoleID: ROLE_DEV }];
            expect(engine.UserHasApplicationAccess(APP_ADMIN)).toBe(false);
        });

        it('should handle case-insensitive UUID comparison', () => {
            mockCurrentUser.UserRoles = [
                { UserID: USER_ID, RoleID: ROLE_UI.toLowerCase() },
            ];
            // Home has UI role with CanAccess — UUIDs should match case-insensitively
            expect(engine.UserHasApplicationAccess(APP_HOME.toUpperCase())).toBe(true);
        });

        it('should still allow open-access apps when user has no roles', () => {
            mockCurrentUser.UserRoles = [];
            expect(engine.UserHasApplicationAccess(APP_OPEN)).toBe(true);
        });
    });

    // ========================================================================
    // UserCanAdminApplication
    // ========================================================================

    describe('UserCanAdminApplication', () => {
        it('should return false for apps with zero ApplicationRole records', () => {
            expect(engine.UserCanAdminApplication(APP_OPEN)).toBe(false);
        });

        it('should return true when user has a role with CanAdmin=true', () => {
            mockCurrentUser.UserRoles = [{ UserID: USER_ID, RoleID: ROLE_DEV }];
            expect(engine.UserCanAdminApplication(APP_ADMIN)).toBe(true);
        });

        it('should return false when user has access but not admin', () => {
            // UI role has CanAccess for Home but not CanAdmin
            expect(engine.UserCanAdminApplication(APP_HOME)).toBe(false);
        });

        it('should return false when user lacks any role for the app', () => {
            // UI role is not assigned to Admin at all
            expect(engine.UserCanAdminApplication(APP_ADMIN)).toBe(false);
        });

        it('should return false when user has no roles', () => {
            mockCurrentUser.UserRoles = [];
            expect(engine.UserCanAdminApplication(APP_HOME)).toBe(false);
        });

        it('should return true when one of multiple roles has CanAdmin', () => {
            mockCurrentUser.UserRoles = [
                { UserID: USER_ID, RoleID: ROLE_UI },
                { UserID: USER_ID, RoleID: ROLE_DEV },
            ];
            expect(engine.UserCanAdminApplication(APP_HOME)).toBe(true);
        });
    });

    // ========================================================================
    // CheckUserApplicationAccess (integration of role check + install status)
    // ========================================================================

    describe('CheckUserApplicationAccess', () => {
        it('should return not_authorized when user lacks role access', () => {
            // UI user, Admin app has no UI role
            expect(engine.CheckUserApplicationAccess(APP_ADMIN)).toBe('not_authorized');
        });

        it('should return not_installed when user has role access but no UserApplication record', () => {
            // UI user has role access to Home, but no UserApplication record exists
            expect(engine.CheckUserApplicationAccess(APP_HOME)).toBe('not_installed');
        });

        it('should return not_installed for open-access apps with no UserApplication record', () => {
            expect(engine.CheckUserApplicationAccess(APP_OPEN)).toBe('not_installed');
        });
    });
});
