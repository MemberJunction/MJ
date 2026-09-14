import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the push-notification service. `expo-notifications` and the MJ
 * object model (`@memberjunction/core`) are mocked; the mutable `state` drives
 * permission, token, and persistence outcomes so we can assert the graceful
 * degradation paths a simulator hits.
 */
type UserOrNull = { ID: string } | null;

const state = vi.hoisted(() => ({
    perm: { granted: true, ios: { status: 2 } } as { granted: boolean; ios?: { status: number } },
    requestPerm: { granted: true } as { granted: boolean; ios?: { status: number } },
    token: 'ExponentPushToken[abc]' as string | null,
    tokenThrows: false,
    runViewResults: [] as unknown[],
    saveResult: true,
    deleteResult: true,
    currentUser: { ID: 'user-1' } as UserOrNull,
    lastSavedValue: null as string | null,
    existingValue: null as string | null,
}));

vi.mock('@/data/preferences', () => {
    const store = new Map<string, string>();
    return {
        PrefsStorage: {
            getString: (k: string) => store.get(k),
            set: (k: string, v: string) => { store.set(k, v); },
        },
    };
});

vi.mock('expo-notifications', () => ({
    IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
    setNotificationHandler: vi.fn(),
    getPermissionsAsync: () => Promise.resolve(state.perm),
    requestPermissionsAsync: () => Promise.resolve(state.requestPerm),
    getExpoPushTokenAsync: () =>
        state.tokenThrows ? Promise.reject(new Error('no APNs')) : Promise.resolve({ data: state.token }),
    unregisterForNotificationsAsync: () => Promise.resolve(),
}));

vi.mock('@memberjunction/core', () => {
    class FakeSetting {
        ID = 'setting-1';
        UserID = '';
        Setting = '';
        // Seeded from `state.existingValue` so a test can express "this user already has tokens".
        Value: string | null = state.existingValue;
        LatestResult = { CompleteMessage: 'err' };
        NewRecord(): void {}
        async Save(): Promise<boolean> {
            state.lastSavedValue = this.Value;
            return state.saveResult;
        }
        async Delete(): Promise<boolean> {
            return state.deleteResult;
        }
    }
    class Metadata {
        get CurrentUser(): UserOrNull {
            return state.currentUser;
        }
        async GetEntityObject(): Promise<FakeSetting> {
            return new FakeSetting();
        }
    }
    class RunView {
        async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: state.runViewResults };
        }
    }
    return { Metadata, RunView };
});

import {
    GetExpoPushToken,
    RegisterDeviceToken,
    RegisterForPushNotifications,
    RequestNotificationPermission,
    UnregisterDeviceToken,
} from '@/data/services/notifications';

beforeEach(() => {
    state.perm = { granted: true, ios: { status: 2 } };
    state.requestPerm = { granted: true };
    state.token = 'ExponentPushToken[abc]';
    state.tokenThrows = false;
    state.runViewResults = [];
    state.saveResult = true;
    state.deleteResult = true;
    state.currentUser = { ID: 'user-1' };
    state.existingValue = null;
    state.lastSavedValue = null;
    state.lastSavedValue = null;
});

describe('RequestNotificationPermission', () => {
    it('is true when already granted (no re-prompt)', async () => {
        expect(await RequestNotificationPermission()).toBe(true);
    });

    it('prompts and honors the request result when undecided', async () => {
        state.perm = { granted: false, ios: { status: 0 } };
        state.requestPerm = { granted: true };
        expect(await RequestNotificationPermission()).toBe(true);
    });

    it('treats iOS provisional authorization as granted', async () => {
        state.perm = { granted: false, ios: { status: 3 } };
        expect(await RequestNotificationPermission()).toBe(true);
    });

    it('is false when denied both times', async () => {
        state.perm = { granted: false, ios: { status: 1 } };
        state.requestPerm = { granted: false, ios: { status: 1 } };
        expect(await RequestNotificationPermission()).toBe(false);
    });
});

describe('GetExpoPushToken', () => {
    it('returns the token data when available', async () => {
        expect(await GetExpoPushToken()).toBe('ExponentPushToken[abc]');
    });

    it('returns null (no throw) when the token cannot be minted', async () => {
        state.tokenThrows = true;
        expect(await GetExpoPushToken()).toBeNull();
    });
});

describe('RegisterDeviceToken', () => {
    it('persists the token under this device\'s slot', async () => {
        expect(await RegisterDeviceToken('tok-1')).toBe(true);
        expect(state.lastSavedValue).not.toBeNull();
        const map = JSON.parse(state.lastSavedValue as string) as Record<string, { token: string }>;
        const slots = Object.values(map);
        expect(slots).toHaveLength(1);
        expect(slots[0].token).toBe('tok-1');
    });

    it('keeps other devices when a second one registers', async () => {
        // The single-token shape this replaces meant signing in on a tablet silently stopped the
        // phone receiving notifications, with nothing to indicate why.
        state.existingValue = JSON.stringify({
            'other-device': { token: 'tok-other', platform: 'android', updatedAt: '2026-01-01T00:00:00.000Z' },
        });
        expect(await RegisterDeviceToken('tok-mine')).toBe(true);
        const map = JSON.parse(state.lastSavedValue as string) as Record<string, { token: string }>;
        expect(Object.values(map).map((t) => t.token).sort()).toEqual(['tok-mine', 'tok-other']);
    });

    it('migrates a legacy single-token value instead of discarding it', async () => {
        state.existingValue = JSON.stringify({ token: 'legacy', platform: 'ios', updatedAt: 'x' });
        expect(await RegisterDeviceToken('tok-new')).toBe(true);
        const map = JSON.parse(state.lastSavedValue as string) as Record<string, { token: string }>;
        // Same installation, so the legacy entry is replaced rather than duplicated.
        expect(Object.values(map).map((t) => t.token)).toEqual(['tok-new']);
    });

    it('no-ops (false) when there is no current user', async () => {
        state.currentUser = null;
        expect(await RegisterDeviceToken('tok-1')).toBe(false);
    });
});

describe('RegisterForPushNotifications', () => {
    it('reports not-granted when permission is denied', async () => {
        state.perm = { granted: false, ios: { status: 1 } };
        state.requestPerm = { granted: false, ios: { status: 1 } };
        const result = await RegisterForPushNotifications();
        expect(result).toMatchObject({ granted: false, token: null, persisted: false });
    });

    it('degrades gracefully when granted but no token (simulator)', async () => {
        state.tokenThrows = true;
        const result = await RegisterForPushNotifications();
        expect(result).toMatchObject({ granted: true, token: null, persisted: false });
        expect(result.reason).toMatch(/simulator|APNs/i);
    });

    it('persists the token on the happy path', async () => {
        const result = await RegisterForPushNotifications();
        expect(result).toMatchObject({ granted: true, token: 'ExponentPushToken[abc]', persisted: true });
    });
});

describe('UnregisterDeviceToken', () => {
    it('is a no-op (true) when there is no stored token', async () => {
        expect(await UnregisterDeviceToken()).toBe(true);
    });

    it('empties the stored map rather than deleting the row', async () => {
        // The standard UI role has Update but deliberately NOT Delete on MJ: User Settings, so
        // removing the last device has to clear the value — deleting would fail for the very
        // people the setting belongs to.
        let savedValue: string | null = null as string | null;
        state.runViewResults = [
            {
                ID: 'setting-1',
                Value: JSON.stringify({ 'this-device': { token: 't', platform: 'ios', updatedAt: 'x' } }),
                async Save(): Promise<boolean> {
                    savedValue = (this as { Value: string }).Value;
                    return true;
                },
                async Delete(): Promise<boolean> {
                    throw new Error('Delete must not be attempted — the UI role cannot delete user settings');
                },
                LatestResult: { CompleteMessage: '' },
            },
        ];
        expect(await UnregisterDeviceToken()).toBe(true);
        expect(savedValue).not.toBeNull();
    });

    it('leaves other devices registered when one unregisters', async () => {
        let savedValue: string | null = null as string | null;
        state.runViewResults = [
            {
                ID: 'setting-1',
                Value: JSON.stringify({
                    'other-device': { token: 'keep-me', platform: 'android', updatedAt: 'x' },
                }),
                async Save(): Promise<boolean> {
                    savedValue = (this as { Value: string }).Value;
                    return true;
                },
                async Delete(): Promise<boolean> {
                    throw new Error('Delete must not be attempted');
                },
                LatestResult: { CompleteMessage: '' },
            },
        ];
        expect(await UnregisterDeviceToken()).toBe(true);
        const map = JSON.parse(String(savedValue)) as Record<string, { token: string }>;
        expect(map['other-device'].token).toBe('keep-me');
    });
});
