/**
 * Push-notification client service (P2.3, client side).
 *
 * A typed, simulator-safe wrapper over `expo-notifications` plus the backend
 * persistence of this device's push token via the MJ object model. Every path
 * degrades gracefully: a simulator (which can't mint a real Expo push token and
 * can't receive APNs) logs and no-ops rather than throwing, and callers get a
 * structured {@link PushRegistrationResult} describing exactly what happened.
 *
 * Token persistence: MemberJunction has no dedicated device / push-token entity
 * today, so we store the token under the user's server-side settings
 * (`MJ: User Settings`, key {@link PUSH_TOKEN_SETTING_KEY}). This is per-user,
 * not per-device — a single row holds one token. See the TODO on
 * {@link registerDeviceToken}: a dedicated `Device Tokens` entity (one row per
 * device, so a user with multiple devices can be targeted individually) is the
 * proper follow-up.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';

/** `MJ: User Settings` key under which this user's push token bundle is stored. */
export const PUSH_TOKEN_SETTING_KEY = 'mobile.pushDeviceToken';

/** Outcome of {@link registerForPushNotifications}. */
export type PushRegistrationResult = {
    /** Whether the OS granted notification permission (or provisional on iOS). */
    granted: boolean;
    /** The acquired Expo push token, or `null` when one couldn't be minted (simulator). */
    token: string | null;
    /** Whether the token was successfully written to the backend. */
    persisted: boolean;
    /** Human-readable explanation when `token`/`persisted` is falsy. */
    reason?: string;
};

/** Shape persisted as the JSON `Value` of the push-token user setting. */
type StoredPushToken = {
    token: string;
    platform: typeof Platform.OS;
    updatedAt: string;
};

/**
 * Install the foreground notification handler: while the app is open, show the
 * banner + list entry but stay quiet (no sound/badge). Safe to call more than
 * once — the last handler wins.
 */
export function configureNotificationHandler(): void {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });
}

/**
 * Ensure notification permission, prompting the user if it hasn't been decided.
 * iOS "provisional" authorization counts as granted (quiet notifications).
 *
 * @returns `true` if notifications are permitted; `false` on denial or error.
 */
export async function requestNotificationPermission(): Promise<boolean> {
    try {
        const current = await Notifications.getPermissionsAsync();
        if (isGranted(current)) return true;
        const requested = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        return isGranted(requested);
    } catch (e) {
        console.warn('[notifications] permission request failed:', errText(e));
        return false;
    }
}

/** Treat both a full grant and iOS provisional authorization as "granted". */
function isGranted(status: Notifications.NotificationPermissionsStatus): boolean {
    return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/**
 * Acquire this device's Expo push token. Requires a real APNs-capable build and
 * an EAS project id; on a simulator (or offline) this throws internally and we
 * return `null` so the caller can degrade gracefully.
 *
 * @returns The Expo push token string, or `null` when unavailable.
 */
export async function getExpoPushToken(): Promise<string | null> {
    try {
        // projectId defaults from Constants.expoConfig.extra.eas.projectId.
        const result = await Notifications.getExpoPushTokenAsync();
        return result.data ?? null;
    } catch (e) {
        // Expected on simulators / without push credentials — not an error.
        console.log('[notifications] Expo push token unavailable (simulator/no APNs):', errText(e));
        return null;
    }
}

/**
 * Persist this device's push token to the backend so the server can target it.
 *
 * TODO(P2.3 follow-up): replace this single-row `MJ: User Settings` fallback
 * with a dedicated per-device entity (e.g. `Device Tokens`) so a user's
 * multiple devices can each be addressed. Today one row holds one token per
 * user, so signing in on a second device overwrites the first.
 *
 * @param token The Expo push token to store.
 * @param contextUser Optional server context user (defaults to the current user).
 * @returns `true` when the token was saved.
 */
export async function registerDeviceToken(token: string, contextUser?: UserInfo): Promise<boolean> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    if (!currentUser?.ID) {
        console.warn('[notifications] no current user; cannot register device token');
        return false;
    }
    const setting = await findOrCreateTokenSetting(md, currentUser);
    const payload: StoredPushToken = { token, platform: Platform.OS, updatedAt: new Date().toISOString() };
    setting.Value = JSON.stringify(payload);
    const saved = await setting.Save();
    if (!saved) {
        console.warn('[notifications] failed to persist device token:', setting.LatestResult?.CompleteMessage ?? 'unknown');
    }
    return saved;
}

/**
 * Remove this device's stored push token from the backend and stop the OS from
 * delivering pushes. Used when the user turns push notifications off. All steps
 * are best-effort and never throw.
 *
 * @param contextUser Optional server context user (defaults to the current user).
 * @returns `true` when the stored token was deleted (or there was nothing to delete).
 */
export async function unregisterDeviceToken(contextUser?: UserInfo): Promise<boolean> {
    try {
        await Notifications.unregisterForNotificationsAsync();
    } catch (e) {
        console.log('[notifications] unregisterForNotificationsAsync no-op:', errText(e));
    }
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    if (!currentUser?.ID) return true;
    const existing = await loadTokenSetting(currentUser);
    if (!existing) return true;
    const deleted = await existing.Delete();
    if (!deleted) {
        console.warn('[notifications] failed to delete device token:', existing.LatestResult?.CompleteMessage ?? 'unknown');
    }
    return deleted;
}

/**
 * Full client-side registration flow: install the foreground handler, ensure
 * permission, mint the Expo push token, and persist it to the backend. Every
 * branch degrades cleanly so a simulator run reports its state instead of
 * throwing.
 *
 * @param contextUser Optional server context user (defaults to the current user).
 * @returns A {@link PushRegistrationResult} describing what succeeded.
 */
export async function registerForPushNotifications(contextUser?: UserInfo): Promise<PushRegistrationResult> {
    configureNotificationHandler();

    const granted = await requestNotificationPermission();
    if (!granted) {
        return { granted: false, token: null, persisted: false, reason: 'Notification permission not granted.' };
    }

    const token = await getExpoPushToken();
    if (!token) {
        return { granted: true, token: null, persisted: false, reason: 'No Expo push token (simulator or APNs unavailable).' };
    }

    const persisted = await registerDeviceToken(token, contextUser);
    return { granted: true, token, persisted, reason: persisted ? undefined : 'Token acquired but backend persistence failed.' };
}

/** Load the existing push-token setting row for a user, or `null` if none. */
async function loadTokenSetting(user: UserInfo): Promise<MJUserSettingEntity | null> {
    const rv = new RunView();
    const result = await rv.RunView<MJUserSettingEntity>(
        {
            EntityName: 'MJ: User Settings',
            ExtraFilter: `UserID='${user.ID}' AND Setting='${PUSH_TOKEN_SETTING_KEY}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        },
        user,
    );
    if (result.Success && result.Results && result.Results.length > 0) return result.Results[0];
    return null;
}

/** Load the user's push-token setting row, or create a fresh (unsaved) one. */
async function findOrCreateTokenSetting(md: Metadata, user: UserInfo): Promise<MJUserSettingEntity> {
    const existing = await loadTokenSetting(user);
    if (existing) return existing;
    const created = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', user);
    created.NewRecord();
    created.UserID = user.ID;
    created.Setting = PUSH_TOKEN_SETTING_KEY;
    return created;
}

/** Normalize an unknown thrown value into a message string. */
function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
