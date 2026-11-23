import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfo, UserRoleInfo } from '@memberjunction/core';
import { InstanceConfigEngine, MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import {
    ApplyShellChromeVisibilityToFlags,
    AreShellChromeVisibilitiesEqual,
    CreateDefaultShellChromePolicyConfig,
    RESTRICTED_SHELL_CHROME_VISIBILITY,
    SHELL_CHROME_POLICY_CONFIG_SETTING_KEY,
    SHELL_CHROME_POLICY_INSTANCE_CONFIG_KEY,
    SHELL_CHROME_USER_PREFS_SETTING_KEY,
    ShellChromePolicyConfig,
    ShellChromePolicyService,
    ShellChromeVisibility,
    UNRESTRICTED_SHELL_CHROME_VISIBILITY,
} from './shell-chrome-policy.service';
import type { ShellChromeFlags } from '../shell-chrome-policy';

interface MockStorageTracker {
    localGet: ReturnType<typeof vi.fn>;
    localSet: ReturnType<typeof vi.fn>;
    sessionGet: ReturnType<typeof vi.fn>;
    sessionSet: ReturnType<typeof vi.fn>;
}

function makeUser(roles: Array<{ RoleID: string; Role: string }>, type: 'User' | 'Owner' = 'User'): UserInfo {
    const userRoles = roles.map(
        (r) => new UserRoleInfo({ UserID: '11111111-1111-1111-1111-111111111111', RoleID: r.RoleID, Role: r.Role }),
    );
    return new UserInfo(undefined, {
        ID: '11111111-1111-1111-1111-111111111111',
        Name: 'Test User',
        Email: 'test@example.com',
        Type: type,
        UserRoles: userRoles,
    });
}

interface MockEngineOptions {
    loaded?: boolean;
    loadedForUserId?: string | null;
    settings?: Record<string, string | undefined>;
    activeApps?: MJUserApplicationEntity[];
    accessibleAppIds?: string[];
    permissionConstrained?: boolean;
}

interface MockEngineBundle {
    engine: UserInfoEngine;
    setSettingDebounced: ReturnType<typeof vi.fn>;
    getSetting: ReturnType<typeof vi.fn>;
}

function createMockUserInfoEngine(options: MockEngineOptions = {}): MockEngineBundle {
    const settingsMap = new Map<string, string>();
    if (options.settings) {
        for (const [key, val] of Object.entries(options.settings)) {
            if (val !== undefined) {
                settingsMap.set(key, val);
            }
        }
    }

    const getSetting = vi.fn((key: string) => settingsMap.get(key));
    const setSettingDebounced = vi.fn((key: string, value: string) => {
        settingsMap.set(key, value);
    });

    const accessibleSet = options.accessibleAppIds ? new Set(options.accessibleAppIds.map((id) => id.toLowerCase())) : null;

    const engineStub: Partial<UserInfoEngine> & {
        Loaded: boolean;
        LoadedForUserId: string | null;
        ActiveUserApplications: MJUserApplicationEntity[];
        GetSetting: (key: string) => string | undefined;
        SetSettingDebounced: (key: string, value: string) => void;
        IsPropertyPermissionConstrained: (prop: string) => boolean;
        UserHasApplicationAccess: (appId: string) => boolean;
    } = {
        Loaded: options.loaded ?? false,
        LoadedForUserId: options.loadedForUserId ?? null,
        ActiveUserApplications: options.activeApps ?? [],
        GetSetting: getSetting,
        SetSettingDebounced: setSettingDebounced,
        IsPropertyPermissionConstrained: () => options.permissionConstrained ?? false,
        UserHasApplicationAccess: (appId: string) =>
            accessibleSet ? accessibleSet.has(appId.toLowerCase()) : true,
    };

    return {
        engine: engineStub as UserInfoEngine,
        setSettingDebounced,
        getSetting,
    };
}

function makeFakeUserApp(applicationId: string): MJUserApplicationEntity {
    return {
        ApplicationID: applicationId,
        IsActive: true,
    } as MJUserApplicationEntity;
}

function installStorageSpies(): MockStorageTracker {
    const localGet = vi.fn();
    const localSet = vi.fn();
    const sessionGet = vi.fn();
    const sessionSet = vi.fn();
    vi.stubGlobal('localStorage', {
        getItem: localGet,
        setItem: localSet,
        removeItem: vi.fn(),
        clear: vi.fn(),
    });
    vi.stubGlobal('sessionStorage', {
        getItem: sessionGet,
        setItem: sessionSet,
        removeItem: vi.fn(),
        clear: vi.fn(),
    });
    return { localGet, localSet, sessionGet, sessionSet };
}

describe('ShellChromePolicyService', () => {
    let storageTracker: MockStorageTracker;

    beforeEach(() => {
        storageTracker = installStorageSpies();
        vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('retains all shell chrome controls for unrestricted internal and administrative roles', () => {
        const service = new ShellChromePolicyService();
        const adminUser = makeUser([
            { RoleID: 'AAAA1111-1111-1111-1111-111111111111', Role: 'Administrator' },
            { RoleID: 'BBBB2222-2222-2222-2222-222222222222', Role: 'UI' },
        ]);
        const devUser = makeUser([{ RoleID: 'CCCC3333-3333-3333-3333-333333333333', Role: 'Developer' }]);
        const ownerUser = makeUser([], 'Owner');
        const standardUser = makeUser([{ RoleID: 'BBBB2222-2222-2222-2222-222222222222', Role: 'UI' }]);
        const { engine } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1111-1111-1111-111111111111')],
        });

        for (const user of [adminUser, devUser, ownerUser, standardUser]) {
            const visibility = service.EvaluateVisibility({ user, userInfoEngine: engine });
            expect(visibility).toEqual(UNRESTRICTED_SHELL_CHROME_VISIBILITY);
            expect(visibility.showGlobalSearch).toBe(true);
            expect(visibility.showFloatingChat).toBe(true);
            expect(visibility.showAppSwitcher).toBe(true);
            expect(visibility.showNotifications).toBe(true);
            expect(visibility.showAdminMenuItems).toBe(true);
            expect(visibility.isRestrictedParticipant).toBe(false);
        }

        service.ngOnDestroy();
    });

    it('retains full chrome for administrative users even when UserApplications list is empty', () => {
        const service = new ShellChromePolicyService();
        const adminUser = makeUser([{ RoleID: 'AAAA1111-1111-1111-1111-111111111111', Role: 'Administrator' }]);
        const { engine } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [],
        });

        const visibility = service.EvaluateVisibility({ user: adminUser, userInfoEngine: engine });
        expect(visibility).toEqual(UNRESTRICTED_SHELL_CHROME_VISIBILITY);
        service.ngOnDestroy();
    });

    it('hides global search, floating chat, app switcher, notification bell, and admin menu items for restricted participant roles', () => {
        const service = new ShellChromePolicyService();
        const restrictedRoles = [
            'External Participant',
            'Restricted Participant',
            'Participant',
            'External User',
            'Portal Guest',
            'Magic Link Baseline',
        ];
        const { engine } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1111-1111-1111-111111111111')],
        });

        for (const roleName of restrictedRoles) {
            const user = makeUser([{ RoleID: 'DDDD4444-4444-4444-4444-444444444444', Role: roleName }]);
            const visibility = service.EvaluateVisibility({ user, userInfoEngine: engine });
            expect(visibility).toEqual(RESTRICTED_SHELL_CHROME_VISIBILITY);
            expect(visibility.showGlobalSearch).toBe(false);
            expect(visibility.showFloatingChat).toBe(false);
            expect(visibility.showAppSwitcher).toBe(false);
            expect(visibility.showNotifications).toBe(false);
            expect(visibility.showAdminMenuItems).toBe(false);
            expect(visibility.isRestrictedParticipant).toBe(true);
        }

        service.ngOnDestroy();
    });

    it('restricts chrome when session is locked to a single application or when UserInfoEngine confirms zero accessible apps', () => {
        const service = new ShellChromePolicyService();
        const standardUser = makeUser([{ RoleID: 'BBBB2222-2222-2222-2222-222222222222', Role: 'UI' }]);

        const loadedWithApp = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1111-1111-1111-111111111111')],
        });
        const sessionLocked = service.EvaluateVisibility({
            user: standardUser,
            userInfoEngine: loadedWithApp.engine,
            sessionRestrictedToApplicationId: 'APP-1111-1111-1111-111111111111',
        });
        expect(sessionLocked).toEqual(RESTRICTED_SHELL_CHROME_VISIBILITY);

        const loadedZeroApps = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [],
        });
        const zeroAppsVisibility = service.EvaluateVisibility({
            user: standardUser,
            userInfoEngine: loadedZeroApps.engine,
        });
        expect(zeroAppsVisibility).toEqual(RESTRICTED_SHELL_CHROME_VISIBILITY);

        const loadedDeniedApps = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1111-1111-1111-111111111111')],
            accessibleAppIds: [],
        });
        expect(
            service.EvaluateVisibility({ user: standardUser, userInfoEngine: loadedDeniedApps.engine }),
        ).toEqual(RESTRICTED_SHELL_CHROME_VISIBILITY);

        const unloadedEngine = createMockUserInfoEngine({ loaded: false, activeApps: [] });
        expect(
            service.EvaluateVisibility({ user: standardUser, userInfoEngine: unloadedEngine.engine }),
        ).toEqual(UNRESTRICTED_SHELL_CHROME_VISIBILITY);

        service.ngOnDestroy();
    });

    it('supports custom domain-neutral roleRules with case-insensitive UUIDsEqual matching and fail-closed composition', () => {
        const ruleRoleId = 'eeee5555-5555-5555-5555-555555555555';
        const customConfig: Partial<ShellChromePolicyConfig> = {
            roleRules: [
                {
                    roleId: ruleRoleId.toUpperCase(),
                    isRestrictedParticipant: true,
                    visibility: {
                        showNotifications: true,
                        showFloatingChat: false,
                    },
                },
                {
                    roleName: 'Scoped Reviewer',
                    isRestrictedParticipant: true,
                    visibility: {
                        showNotifications: false,
                        showGlobalSearch: false,
                    },
                },
            ],
        };
        const service = new ShellChromePolicyService(customConfig);
        const { engine } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1')],
        });

        const singleRuleUser = makeUser([{ RoleID: ruleRoleId.toLowerCase(), Role: 'Custom Portal User' }]);
        const singleVis = service.EvaluateVisibility({ user: singleRuleUser, userInfoEngine: engine });
        expect(singleVis).toEqual({
            showGlobalSearch: false,
            showFloatingChat: false,
            showAppSwitcher: false,
            showNotifications: true,
            showAdminMenuItems: false,
            isRestrictedParticipant: true,
        });

        const multiRuleUser = makeUser([
            { RoleID: ruleRoleId.toLowerCase(), Role: 'Custom Portal User' },
            { RoleID: 'ffff6666-6666-6666-6666-666666666666', Role: 'scoped reviewer' },
        ]);
        const multiVis = service.EvaluateVisibility({ user: multiRuleUser, userInfoEngine: engine });
        expect(multiVis.showNotifications).toBe(false);
        expect(multiVis.isRestrictedParticipant).toBe(true);

        service.ngOnDestroy();
    });

    it('prevents user-writable UserInfoEngine settings from escalating restricted boundaries while honoring non-escalating narrowing and SetSettingDebounced', () => {
        const service = new ShellChromePolicyService();
        const restrictedUser = makeUser([{ RoleID: 'DDDD4444-4444-4444-4444-444444444444', Role: 'External Participant' }]);
        const standardUser = makeUser([{ RoleID: 'BBBB2222-2222-2222-2222-222222222222', Role: 'UI' }]);
        const { engine, setSettingDebounced } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1')],
            settings: {
                [SHELL_CHROME_USER_PREFS_SETTING_KEY]: JSON.stringify({
                    showGlobalSearch: true,
                    showFloatingChat: true,
                    showNotifications: false,
                }),
            },
        });

        // Read-only evaluation must NOT write settings
        const restrictedVis = service.EvaluateVisibility({ user: restrictedUser, userInfoEngine: engine });
        expect(setSettingDebounced).not.toHaveBeenCalled();
        expect(restrictedVis.showGlobalSearch).toBe(false);
        expect(restrictedVis.showFloatingChat).toBe(false);

        // Standard user preference can narrow (showNotifications: false)
        const standardVis = service.EvaluateVisibility({ user: standardUser, userInfoEngine: engine });
        expect(standardVis.showNotifications).toBe(false);
        expect(standardVis.showGlobalSearch).toBe(true);

        // Explicit mutation calls SetSettingDebounced on UserInfoEngine without touching web storage
        service.SetUserPreferences({ showGlobalSearch: false }, { user: standardUser, userInfoEngine: engine });
        expect(setSettingDebounced).toHaveBeenCalledWith(
            SHELL_CHROME_USER_PREFS_SETTING_KEY,
            expect.stringContaining('"showGlobalSearch":false'),
        );
        expect(service.EvaluateVisibility({ user: standardUser, userInfoEngine: engine }).showGlobalSearch).toBe(false);

        // User setting config cannot weaken default restrictedRoleNames or restrictOnZeroAccessibleApps
        const weakeningBundle = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1')],
            settings: {
                [SHELL_CHROME_POLICY_CONFIG_SETTING_KEY]: JSON.stringify({
                    restrictedRoleNames: [],
                    unrestrictedRoleNames: ['External Participant'],
                    restrictOnZeroAccessibleApps: false,
                }),
            },
        });
        expect(
            service.EvaluateVisibility({ user: restrictedUser, userInfoEngine: weakeningBundle.engine }),
        ).toEqual(RESTRICTED_SHELL_CHROME_VISIBILITY);

        // Verify zero localStorage or sessionStorage calls occurred
        expect(storageTracker.localGet).not.toHaveBeenCalled();
        expect(storageTracker.localSet).not.toHaveBeenCalled();
        expect(storageTracker.sessionGet).not.toHaveBeenCalled();
        expect(storageTracker.sessionSet).not.toHaveBeenCalled();

        service.ngOnDestroy();
    });

    it('reads InstanceConfigEngine policy config safely and ignores malformed JSON without throwing', () => {
        const service = new ShellChromePolicyService();
        const partnerUser = makeUser([{ RoleID: '99999999-9999-9999-9999-999999999999', Role: 'Partner Member' }]);
        const { engine } = createMockUserInfoEngine({
            loaded: true,
            loadedForUserId: '11111111-1111-1111-1111-111111111111',
            activeApps: [makeFakeUserApp('APP-1')],
        });

        vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation((key: string) =>
            key === SHELL_CHROME_POLICY_INSTANCE_CONFIG_KEY
                ? JSON.stringify({ restrictedRoleNames: ['External Participant', 'Partner Member'] })
                : undefined,
        );
        expect(service.EvaluateVisibility({ user: partnerUser, userInfoEngine: engine }).isRestrictedParticipant).toBe(true);

        vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue('{invalid-json');
        expect(() => service.EvaluateVisibility({ user: partnerUser, userInfoEngine: engine })).not.toThrow();

        service.ngOnDestroy();
    });

    it('narrows ShellChromeFlags monotonically via ApplyShellChromeVisibilityToFlags and compares snapshots accurately', () => {
        const baseline: ShellChromeFlags = {
            searchBar: true,
            searchPreview: true,
            notifications: true,
            appSwitcher: true,
            appSwitcherStyle: 'auto',
            appNav: true,
            chatOverlay: true,
            recordOpenStyle: 'records',
        };

        const narrowed = ApplyShellChromeVisibilityToFlags(baseline, RESTRICTED_SHELL_CHROME_VISIBILITY);
        expect(narrowed).toEqual({
            searchBar: false,
            searchPreview: false,
            notifications: false,
            appSwitcher: false,
            appSwitcherStyle: 'auto',
            appNav: true,
            chatOverlay: false,
            recordOpenStyle: 'records',
        });

        const ceilingOff: ShellChromeFlags = { ...baseline, searchBar: false, chatOverlay: false };
        const cannotWiden = ApplyShellChromeVisibilityToFlags(ceilingOff, UNRESTRICTED_SHELL_CHROME_VISIBILITY);
        expect(cannotWiden.searchBar).toBe(false);
        expect(cannotWiden.chatOverlay).toBe(false);

        const defaultConfig = CreateDefaultShellChromePolicyConfig();
        expect(defaultConfig.restrictedRoleNames.length).toBeGreaterThan(0);
        expect(
            AreShellChromeVisibilitiesEqual(UNRESTRICTED_SHELL_CHROME_VISIBILITY, { ...UNRESTRICTED_SHELL_CHROME_VISIBILITY }),
        ).toBe(true);
        expect(
            AreShellChromeVisibilitiesEqual(UNRESTRICTED_SHELL_CHROME_VISIBILITY, RESTRICTED_SHELL_CHROME_VISIBILITY),
        ).toBe(false);
    });

    it('contains zero localStorage, sessionStorage, any, unknown, or BaseEntity Get/Set calls in source', () => {
        const source = readFileSync(join(__dirname, 'shell-chrome-policy.service.ts'), 'utf8');
        expect(source).not.toMatch(/\blocalStorage\b/);
        expect(source).not.toMatch(/\bsessionStorage\b/);
        expect(source).not.toMatch(/:\s*any\b|\bas\s+any\b|<any>/);
        expect(source).not.toMatch(/:\s*unknown\b|\bas\s+unknown\b|<unknown>/);
        const withoutInstanceConfigGet = source.replace(/InstanceConfigEngine\.Instance\.Get\s*\(/g, '');
        expect(withoutInstanceConfigGet).not.toMatch(/\.Get\s*\(/);
        expect(withoutInstanceConfigGet).not.toMatch(/\.Set\s*\(/);
    });
});
