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
}));

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
        Value: string | null = null;
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
    getExpoPushToken,
    registerDeviceToken,
    registerForPushNotifications,
    requestNotificationPermission,
    unregisterDeviceToken,
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
    state.lastSavedValue = null;
});

describe('requestNotificationPermission', () => {
    it('is true when already granted (no re-prompt)', async () => {
        expect(await requestNotificationPermission()).toBe(true);
    });

    it('prompts and honors the request result when undecided', async () => {
        state.perm = { granted: false, ios: { status: 0 } };
        state.requestPerm = { granted: true };
        expect(await requestNotificationPermission()).toBe(true);
    });

    it('treats iOS provisional authorization as granted', async () => {
        state.perm = { granted: false, ios: { status: 3 } };
        expect(await requestNotificationPermission()).toBe(true);
    });

    it('is false when denied both times', async () => {
        state.perm = { granted: false, ios: { status: 1 } };
        state.requestPerm = { granted: false, ios: { status: 1 } };
        expect(await requestNotificationPermission()).toBe(false);
    });
});

describe('getExpoPushToken', () => {
    it('returns the token data when available', async () => {
        expect(await getExpoPushToken()).toBe('ExponentPushToken[abc]');
    });

    it('returns null (no throw) when the token cannot be minted', async () => {
        state.tokenThrows = true;
        expect(await getExpoPushToken()).toBeNull();
    });
});

describe('registerDeviceToken', () => {
    it('persists the token as JSON for the current user', async () => {
        expect(await registerDeviceToken('tok-1')).toBe(true);
        expect(state.lastSavedValue).not.toBeNull();
        expect(JSON.parse(state.lastSavedValue as string).token).toBe('tok-1');
    });

    it('no-ops (false) when there is no current user', async () => {
        state.currentUser = null;
        expect(await registerDeviceToken('tok-1')).toBe(false);
    });
});

describe('registerForPushNotifications', () => {
    it('reports not-granted when permission is denied', async () => {
        state.perm = { granted: false, ios: { status: 1 } };
        state.requestPerm = { granted: false, ios: { status: 1 } };
        const result = await registerForPushNotifications();
        expect(result).toMatchObject({ granted: false, token: null, persisted: false });
    });

    it('degrades gracefully when granted but no token (simulator)', async () => {
        state.tokenThrows = true;
        const result = await registerForPushNotifications();
        expect(result).toMatchObject({ granted: true, token: null, persisted: false });
        expect(result.reason).toMatch(/simulator|APNs/i);
    });

    it('persists the token on the happy path', async () => {
        const result = await registerForPushNotifications();
        expect(result).toMatchObject({ granted: true, token: 'ExponentPushToken[abc]', persisted: true });
    });
});

describe('unregisterDeviceToken', () => {
    it('is a no-op (true) when there is no stored token', async () => {
        expect(await unregisterDeviceToken()).toBe(true);
    });

    it('deletes the stored token row when present', async () => {
        state.runViewResults = [
            {
                ID: 'setting-1',
                async Delete(): Promise<boolean> {
                    return true;
                },
                LatestResult: { CompleteMessage: '' },
            },
        ];
        expect(await unregisterDeviceToken()).toBe(true);
    });
});
