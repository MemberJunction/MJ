import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * External magic-link sessions hold only 'Magic Link Baseline' plus a granted role, so
 * UserInfoEngine is permission-constrained for them by design: every config is skipped and the
 * collection getters throw PermissionConstrainedError (BaseEngine's safety net).
 *
 * Lookups whose empty answer is safe — a setting value ("not set"), the notification badge —
 * run at every Explorer boot for such users. They threw, uncaught. These tests pin that they now
 * answer empty, log the denial ONCE, and that the raw collection getters keep throwing (a caller
 * that equates "empty" with "new user" must not silently auto-create records).
 */

const logStatus = vi.fn();
let denied = new Set<string>();

class FakePermissionConstrainedError extends Error {}

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
                return { CurrentUser: { ID: 'magic-user' } };
            }
            IsPropertyPermissionConstrained(name: string): boolean {
                return denied.has(name);
            }
            protected GetConfigData<E>(name: string): E[] {
                if (denied.has(name)) {
                    throw new FakePermissionConstrainedError(`UserInfoEngine data is not available (${name})`);
                }
                return ((this as unknown as Record<string, unknown>)[name] as E[]) ?? [];
            }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogStatus: (...args: unknown[]) => logStatus(...args),
        LogError: vi.fn(),
        RunView: class {},
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
    _userSettings: { UserID: string; Setting: string; Value: string }[];
    _userNotifications: { UserID: string; Unread: boolean; Get(f: string): Date }[];
    _permissionNoticesLogged: Set<string>;
};

/** A fresh, isolated engine instance per test (the singleton is shared module state). */
function freshEngine(): UserInfoEngine {
    const engine = new (UserInfoEngine as unknown as { new (): UserInfoEngine })();
    const state = engine as unknown as EngineState;
    state._loadedForUserId = 'magic-user';
    state._userSettings = [];
    state._userNotifications = [];
    return engine;
}

describe('UserInfoEngine — permission-constrained (magic-link) session', () => {
    beforeEach(() => {
        logStatus.mockClear();
        denied = new Set(['_userSettings', '_userNotifications', '_workspaces', '_userApplications']);
    });

    it('GetSetting / GetSettingEntity answer "not set" instead of throwing', () => {
        const engine = freshEngine();
        expect(engine.GetSetting('theme')).toBeUndefined();
        expect(engine.GetSettingEntity('theme')).toBeUndefined();
    });

    it('the notification badge reads empty instead of throwing', () => {
        const engine = freshEngine();
        expect(engine.UserNotificationsIfPermitted).toEqual([]);
        expect(engine.UnreadNotifications).toEqual([]);
        expect(engine.UnreadNotificationCount).toBe(0);
    });

    it('logs each denied property once, however often it is read', () => {
        const engine = freshEngine();
        for (let i = 0; i < 5; i++) {
            engine.GetSetting('theme');
            void engine.UnreadNotificationCount;
        }
        expect(logStatus).toHaveBeenCalledTimes(2);
    });

    it('raw collection getters still throw — "empty" must not read as "new user"', () => {
        const engine = freshEngine();
        expect(() => engine.Workspaces).toThrow(FakePermissionConstrainedError);
        expect(() => engine.UserApplications).toThrow(FakePermissionConstrainedError);
        expect(() => engine.UserSettings).toThrow(FakePermissionConstrainedError);
    });

    it('an ordinary user is unaffected and nothing is logged', () => {
        denied = new Set();
        const engine = freshEngine();
        const state = engine as unknown as EngineState;
        state._userSettings = [{ UserID: 'magic-user', Setting: 'theme', Value: 'dark' }];
        state._userNotifications = [{ UserID: 'magic-user', Unread: true, Get: () => new Date('2026-10-01') }];
        expect(engine.GetSetting('theme')).toBe('dark');
        expect(engine.UnreadNotificationCount).toBe(1);
        expect(logStatus).not.toHaveBeenCalled();
    });
});
