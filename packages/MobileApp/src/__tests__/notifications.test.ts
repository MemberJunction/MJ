import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the push-notification service and the token store beneath it.
 *
 * `expo-notifications` and MJ's `UserInfoEngine` are mocked; the mutable `state` drives permission,
 * token, and persistence outcomes so we can assert the graceful-degradation paths a simulator hits
 * as well as the multi-device merge rules.
 */
type UserOrNull = { ID: string } | null;

const state = vi.hoisted(() => ({
    perm: { granted: true, ios: { status: 2 } } as { granted: boolean; ios?: { status: number } },
    requestPerm: { granted: true } as { granted: boolean; ios?: { status: number } },
    token: 'ExponentPushToken[abc]' as string | null,
    tokenThrows: false,
    saveResult: true,
    currentUser: { ID: 'user-1' } as UserOrNull,
    /** What `UserInfoEngine.GetSetting` returns — i.e. what is already stored for this user. */
    storedValue: null as string | null,
    /** What `UserInfoEngine.SetSetting` was last asked to write. */
    lastSavedValue: null as string | null,
    /** Keys any code under test tried to DELETE — must stay empty; the UI role cannot delete. */
    deletedKeys: [] as string[],
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
    class Metadata {
        get CurrentUser(): UserOrNull {
            return state.currentUser;
        }
    }
    return { Metadata };
});

vi.mock('@memberjunction/core-entities', () => {
    const instance = {
        Config: async () => undefined,
        GetSetting: () => state.storedValue ?? undefined,
        SetSetting: async (_key: string, value: string) => {
            state.lastSavedValue = value;
            return state.saveResult;
        },
        DeleteSetting: async (key: string) => {
            state.deletedKeys.push(key);
            return true;
        },
    };
    return { UserInfoEngine: { Instance: instance } };
});

import {
    GetExpoPushToken,
    RegisterDeviceToken,
    RegisterForPushNotifications,
    RequestNotificationPermission,
    UnregisterDeviceToken,
} from '@/data/services/notifications';
import { ParsePushTokenMap } from '@/data/services/push-token-store';

beforeEach(() => {
    state.perm = { granted: true, ios: { status: 2 } };
    state.requestPerm = { granted: true };
    state.token = 'ExponentPushToken[abc]';
    state.tokenThrows = false;
    state.saveResult = true;
    state.currentUser = { ID: 'user-1' };
    state.storedValue = null;
    state.lastSavedValue = null;
    state.deletedKeys = [];
});

/** Reads the map the code under test last wrote. */
function savedMap(): Record<string, { token: string }> {
    expect(state.lastSavedValue).not.toBeNull();
    return JSON.parse(state.lastSavedValue as string) as Record<string, { token: string }>;
}

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

describe('ParsePushTokenMap', () => {
    it('drops entries that are not well-formed registrations', () => {
        // The stored value is user-writable JSON, so "it parsed" is not the same as "it is a map of
        // registrations". Asserting the shape is what keeps a bad entry out of the type.
        const raw = JSON.stringify({
            good: { token: 't', platform: 'ios', updatedAt: 'x' },
            bad: { token: 42 },
            alsoBad: 'not-an-object',
        });
        expect(Object.keys(ParsePushTokenMap(raw, 'this-device'))).toEqual(['good']);
    });

    it('returns an empty map for an array, rather than one keyed "0", "1"', () => {
        expect(ParsePushTokenMap(JSON.stringify([{ token: 't', platform: 'ios', updatedAt: 'x' }]), 'd')).toEqual({});
    });

    it('returns an empty map for malformed JSON', () => {
        expect(ParsePushTokenMap('{not json', 'd')).toEqual({});
        expect(ParsePushTokenMap(null, 'd')).toEqual({});
    });
});

describe('RegisterDeviceToken', () => {
    it("persists the token under this device's slot", async () => {
        expect(await RegisterDeviceToken('tok-1')).toBe(true);
        const slots = Object.values(savedMap());
        expect(slots).toHaveLength(1);
        expect(slots[0].token).toBe('tok-1');
    });

    it('keeps other devices when a second one registers', async () => {
        // The single-token shape this replaces meant signing in on a tablet silently stopped the
        // phone receiving notifications, with nothing to indicate why.
        state.storedValue = JSON.stringify({
            'other-device': { token: 'tok-other', platform: 'android', updatedAt: '2026-01-01T00:00:00.000Z' },
        });
        expect(await RegisterDeviceToken('tok-mine')).toBe(true);
        expect(Object.values(savedMap()).map((t) => t.token).sort()).toEqual(['tok-mine', 'tok-other']);
    });

    it('migrates a legacy single-token value instead of discarding it', async () => {
        state.storedValue = JSON.stringify({ token: 'legacy', platform: 'ios', updatedAt: 'x' });
        expect(await RegisterDeviceToken('tok-new')).toBe(true);
        // Same installation, so the legacy entry is replaced rather than duplicated.
        expect(Object.values(savedMap()).map((t) => t.token)).toEqual(['tok-new']);
    });

    it('reports failure when the setting could not be written', async () => {
        state.saveResult = false;
        expect(await RegisterDeviceToken('tok-1')).toBe(false);
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
        expect(state.lastSavedValue).toBeNull();
    });

    it('empties the stored map rather than deleting the row', async () => {
        // The standard UI role has Update but deliberately NOT Delete on MJ: User Settings, so
        // removing the last device has to clear the value — deleting would fail for the very
        // people the setting belongs to. Registering first means the stored key is this device's,
        // which is the whole point: seeding a key the code never computes would make this pass
        // while removing nothing.
        await RegisterDeviceToken('tok-1');
        state.storedValue = state.lastSavedValue;
        state.lastSavedValue = null;

        expect(await UnregisterDeviceToken()).toBe(true);
        expect(savedMap()).toEqual({});
        expect(state.deletedKeys).toEqual([]);
    });

    it('leaves other devices registered when one unregisters', async () => {
        await RegisterDeviceToken('tok-mine');
        const mine = JSON.parse(state.lastSavedValue as string) as Record<string, unknown>;
        state.storedValue = JSON.stringify({
            ...mine,
            'other-device': { token: 'keep-me', platform: 'android', updatedAt: 'x' },
        });
        state.lastSavedValue = null;

        expect(await UnregisterDeviceToken()).toBe(true);
        const map = savedMap();
        expect(map['other-device'].token).toBe('keep-me');
        expect(Object.keys(map)).toHaveLength(1);
    });
});
