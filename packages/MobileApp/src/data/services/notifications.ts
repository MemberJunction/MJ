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
 * {@link RegisterDeviceToken}: a dedicated `Device Tokens` entity (one row per
 * device, so a user with multiple devices can be targeted individually) is the
 * proper follow-up.
 */
import { Platform } from 'react-native';
import { PrefsStorage } from '@/data/preferences';
import * as Notifications from 'expo-notifications';
import type { UserInfo } from '@memberjunction/core';
import { RemovePushToken, SavePushToken } from './push-token-store';

/** `MJ: User Settings` key under which this user's push token bundle is stored. */
// The setting key lives with the store that owns it; re-exported here for existing callers.
export { PUSH_TOKEN_SETTING_KEY } from './push-token-store';

/** Outcome of {@link RegisterForPushNotifications}. */
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

/**
 * A stable id for this app installation.
 *
 * Generated once and persisted in MMKV, so it survives app restarts and updates but not a
 * reinstall — which is the correct lifetime: a reinstalled app gets a new push token anyway, so the
 * old entry would be undeliverable regardless, and MMKV storage is cleared with the app.
 *
 * Deliberately not `expo-application`'s installation id. That would be one more native dependency
 * for a value this app is free to choose, and the lifetimes are the same either way.
 */
function DeviceInstallationId(): string {
    const existing = PrefsStorage.getString(DEVICE_ID_PREF_KEY);
    if (existing) return existing;
    const generated = `${Platform.OS}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    PrefsStorage.set(DEVICE_ID_PREF_KEY, generated);
    return generated;
}

/** MMKV key holding this installation's generated device id. */
const DEVICE_ID_PREF_KEY = 'mobile.pushDeviceId';


/**
 * Install the foreground notification handler: while the app is open, show the
 * banner + list entry but stay quiet (no sound/badge). Safe to call more than
 * once — the last handler wins.
 */
export function ConfigureNotificationHandler(): void {
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
export async function RequestNotificationPermission(): Promise<boolean> {
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
export async function GetExpoPushToken(): Promise<string | null> {
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
 * Tokens are stored as a map keyed by installation id, so a user's phone and tablet each keep
 * their own slot and registering on one never unregisters the other.
 *
 * @param token The Expo push token to store.
 * @param contextUser Optional server context user (defaults to the current user).
 * @returns `true` when the token was saved.
 */
export async function RegisterDeviceToken(token: string, contextUser?: UserInfo): Promise<boolean> {
    return SavePushToken(DeviceInstallationId(), token, Platform.OS, contextUser);
}

/**
 * Remove this device's stored push token from the backend and stop the OS from
 * delivering pushes. Used when the user turns push notifications off. All steps
 * are best-effort and never throw.
 *
 * @param contextUser Optional server context user (defaults to the current user).
 * @returns `true` when the stored token was deleted (or there was nothing to delete).
 */
export async function UnregisterDeviceToken(contextUser?: UserInfo): Promise<boolean> {
    try {
        await Notifications.unregisterForNotificationsAsync();
    } catch (e) {
        console.log('[notifications] unregisterForNotificationsAsync no-op:', errText(e));
    }
    return RemovePushToken(DeviceInstallationId(), contextUser);
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
export async function RegisterForPushNotifications(contextUser?: UserInfo): Promise<PushRegistrationResult> {
    ConfigureNotificationHandler();

    const granted = await RequestNotificationPermission();
    if (!granted) {
        return { granted: false, token: null, persisted: false, reason: 'Notification permission not granted.' };
    }

    const token = await GetExpoPushToken();
    if (!token) {
        return { granted: true, token: null, persisted: false, reason: 'No Expo push token (simulator or APNs unavailable).' };
    }

    const persisted = await RegisterDeviceToken(token, contextUser);
    return { granted: true, token, persisted, reason: persisted ? undefined : 'Token acquired but backend persistence failed.' };
}

/** Load the existing push-token setting row for a user, or `null` if none. */

/** Load the user's push-token setting row, or create a fresh (unsaved) one. */

/** Normalize an unknown thrown value into a message string. */
function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
