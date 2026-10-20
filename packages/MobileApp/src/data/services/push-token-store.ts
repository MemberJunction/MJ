import { Metadata, type UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * @fileoverview Where a user's push tokens live, and how several devices share that space.
 *
 * Deliberately free of any Expo or React Native import. Obtaining a push token needs a device;
 * *storing* one is plain MemberJunction and works anywhere — which is what lets this be verified
 * against a live server from Node instead of only by hand on hardware. `notifications.ts` keeps the
 * device half.
 *
 * ## Why a map, not a token
 *
 * The original shape stored one token per user, so signing in on a second device silently
 * overwrote the first and that device stopped receiving notifications with nothing to indicate
 * why. Keying by installation makes "a person has a phone and a tablet" the normal case.
 *
 * ## Why `UserInfoEngine` and not a hand-rolled row
 *
 * No new entity is needed: the communication framework's Expo provider takes a push token as the
 * recipient address, so token storage is the application's business, and `MJ: User Settings` is
 * already per-user, server-side and cross-device. MJ's own accessor for that table is
 * `UserInfoEngine.GetSetting` / `SetSetting`, which this module uses rather than repeating — the
 * engine caches the rows, and its write path recovers when the cached row has been deleted from
 * another device by recreating it instead of reporting a failed save. A hand-rolled
 * `RunView` + `GetEntityObject` pair loses exactly that recovery, on the one entity most likely to
 * be written from two devices at once.
 */

/** `MJ: User Settings` key holding this user's device-token map. */
export const PUSH_TOKEN_SETTING_KEY = 'mobile.pushDeviceToken';

/** One device's registration. */
export type StoredPushToken = {
    /** The Expo push token to send to. */
    token: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Platform the token belongs to, for diagnostics and per-platform payload shaping. */
    platform: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** ISO timestamp of the last registration, so stale entries are identifiable. */
    updatedAt: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
};

/** Every device a user has registered, keyed by a stable per-installation id. */
export type StoredPushTokenMap = Record<string, StoredPushToken>;

/** Whether a parsed value is a well-formed device registration. */
function isStoredPushToken(value: unknown): value is StoredPushToken {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.token === 'string' &&
        typeof candidate.platform === 'string' &&
        typeof candidate.updatedAt === 'string'
    );
}

/**
 * Parses a stored value into a token map.
 *
 * Tolerant on purpose, and validating for the same reason: a malformed value yields an empty map
 * rather than throwing, and entries that are not well-formed registrations are dropped rather than
 * asserted into the type. The legacy single-token shape is migrated under the supplied installation
 * id rather than discarded — the device it belongs to is still registered with Expo, so throwing
 * its token away would silently stop notifications for a device that was working a moment ago.
 *
 * @param raw The raw `MJ: User Settings` value.
 * @param installationId This device's id, used when migrating a legacy value.
 */
export function ParsePushTokenMap(raw: string | null | undefined, installationId: string): StoredPushTokenMap {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        // An array is an object too, and `Object.entries` would turn it into a map keyed "0", "1".
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        if (isStoredPushToken(parsed)) {
            return { [installationId]: parsed };
        }
        const result: StoredPushTokenMap = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (isStoredPushToken(value)) {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Resolves the user this call acts for and makes sure their settings are loaded.
 *
 * @returns The user, or `null` when nobody is signed in.
 */
async function resolveUser(contextUser?: UserInfo): Promise<UserInfo | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    if (!currentUser?.ID) return null;
    await UserInfoEngine.Instance.Config(false, currentUser);
    return currentUser;
}

/**
 * Records this device's push token, preserving every other device's.
 *
 * @param installationId Stable id for this app installation.
 * @param token The Expo push token.
 * @param platform Platform string, e.g. `'ios'`.
 * @param contextUser Optional context user; defaults to the signed-in user.
 * @returns `true` when the map was saved.
 */
export async function SavePushToken(
    installationId: string,
    token: string,
    platform: string,
    contextUser?: UserInfo,
): Promise<boolean> {
    const currentUser = await resolveUser(contextUser);
    if (!currentUser) {
        console.warn('[push-token-store] no current user; cannot register device token');
        return false;
    }

    // Merge rather than replace, so registering on one device does not unregister the others.
    const tokens = ParsePushTokenMap(UserInfoEngine.Instance.GetSetting(PUSH_TOKEN_SETTING_KEY), installationId);
    tokens[installationId] = { token, platform, updatedAt: new Date().toISOString() };

    const saved = await UserInfoEngine.Instance.SetSetting(
        PUSH_TOKEN_SETTING_KEY,
        JSON.stringify(tokens),
        currentUser,
    );
    if (!saved) {
        console.warn('[push-token-store] failed to persist device token');
    }
    return saved;
}

/**
 * Removes this device's token, leaving the user's other devices registered.
 *
 * Turning notifications off on a phone must not stop them reaching the same person's tablet, so
 * only this installation's slot is removed.
 *
 * When no devices remain the row is **emptied rather than deleted**: the standard `UI` role has
 * Create and Update on `MJ: User Settings` but deliberately not Delete — settings are meant to be
 * changed, not removed, by the people they belong to. An empty map is equivalent for every reader
 * and does not depend on a permission end users are not given.
 *
 * @returns `true` when the change was persisted, or there was nothing to remove.
 */
export async function RemovePushToken(installationId: string, contextUser?: UserInfo): Promise<boolean> {
    const currentUser = await resolveUser(contextUser);
    if (!currentUser) return true;

    const raw = UserInfoEngine.Instance.GetSetting(PUSH_TOKEN_SETTING_KEY);
    if (!raw) return true;

    const tokens = ParsePushTokenMap(raw, installationId);
    delete tokens[installationId];

    const saved = await UserInfoEngine.Instance.SetSetting(
        PUSH_TOKEN_SETTING_KEY,
        JSON.stringify(tokens),
        currentUser,
    );
    if (!saved) {
        console.warn('[push-token-store] failed to remove device token');
    }
    return saved;
}
