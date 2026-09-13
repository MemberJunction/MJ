import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';

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
 * No new entity is needed: the communication framework's Expo provider takes a push token as the
 * recipient address, so token storage is the application's business, and `MJ: User Settings` is
 * already per-user, server-side and cross-device.
 */

/** `MJ: User Settings` key holding this user's device-token map. */
export const PUSH_TOKEN_SETTING_KEY = 'mobile.pushDeviceToken';

/** One device's registration. */
export type StoredPushToken = {
    /** The Expo push token to send to. */
    token: string;
    /** Platform the token belongs to, for diagnostics and per-platform payload shaping. */
    platform: string;
    /** ISO timestamp of the last registration, so stale entries are identifiable. */
    updatedAt: string;
};

/** Every device a user has registered, keyed by a stable per-installation id. */
export type StoredPushTokenMap = Record<string, StoredPushToken>;

/**
 * Parses a stored value into a token map.
 *
 * Tolerant on purpose. A malformed value yields an empty map rather than throwing, and the legacy
 * single-token shape is migrated under the supplied installation id rather than discarded — the
 * device it belongs to is still registered with Expo, so throwing its token away would silently
 * stop notifications for a device that was working a moment ago.
 *
 * @param raw The raw `MJ: User Settings` value.
 * @param installationId This device's id, used when migrating a legacy value.
 */
export function ParsePushTokenMap(raw: string | null | undefined, installationId: string): StoredPushTokenMap {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const asRecord = parsed as Record<string, unknown>;
        if (typeof asRecord.token === 'string') {
            return { [installationId]: asRecord as unknown as StoredPushToken };
        }
        return asRecord as StoredPushTokenMap;
    } catch {
        return {};
    }
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
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    if (!currentUser?.ID) {
        console.warn('[push-token-store] no current user; cannot register device token');
        return false;
    }

    const setting = await FindOrCreateSetting(md, currentUser);
    // Merge rather than replace, so registering on one device does not unregister the others.
    const tokens = ParsePushTokenMap(setting.Value, installationId);
    tokens[installationId] = { token, platform, updatedAt: new Date().toISOString() };
    setting.Value = JSON.stringify(tokens);

    const saved = await setting.Save();
    if (!saved) {
        console.warn('[push-token-store] failed to persist device token:', setting.LatestResult?.CompleteMessage ?? 'unknown');
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
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    if (!currentUser?.ID) return true;

    const existing = await LoadSetting(currentUser);
    if (!existing) return true;

    const tokens = ParsePushTokenMap(existing.Value, installationId);
    delete tokens[installationId];

    existing.Value = JSON.stringify(tokens);
    const saved = await existing.Save();
    if (!saved) {
        console.warn('[push-token-store] failed to remove device token:', existing.LatestResult?.CompleteMessage ?? 'unknown');
    }
    return saved;
}

/** Loads the user's token setting row, or `null` when they have none. */
export async function LoadSetting(user: UserInfo): Promise<MJUserSettingEntity | null> {
    const result = await new RunView().RunView<MJUserSettingEntity>(
        {
            EntityName: 'MJ: User Settings',
            ExtraFilter: `UserID='${user.ID}' AND Setting='${PUSH_TOKEN_SETTING_KEY}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        },
        user,
    );
    return result.Success && result.Results?.length ? result.Results[0] : null;
}

/** Loads the user's token setting row, creating an unsaved one when absent. */
async function FindOrCreateSetting(md: Metadata, user: UserInfo): Promise<MJUserSettingEntity> {
    const existing = await LoadSetting(user);
    if (existing) return existing;

    const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', user);
    setting.NewRecord();
    setting.UserID = user.ID;
    setting.Setting = PUSH_TOKEN_SETTING_KEY;
    return setting;
}
