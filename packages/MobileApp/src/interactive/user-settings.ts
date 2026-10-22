/**
 * @fileoverview Per-user, per-component settings for interactive components.
 *
 * ## The contract
 *
 * A component receives `savedUserSettings` and calls `onSaveUserSettings(partial)` when the user
 * changes something it wants remembered — a sort order, a selected tab, a collapsed panel. The host
 * is responsible for durably storing that, scoped to the user and the component.
 *
 * Mobile passed neither, so every one of those choices reset on each open, and the same component
 * remembered them on the web. That is the kind of difference a user reads as "the app is broken",
 * not "the app is different".
 *
 * ## Same storage as the web, deliberately
 *
 * `MJReactComponent` scopes with `resolveUserStateScope`, keys with `userStateStorageKey`, merges
 * with `mergeUserSettings` / `applyUserSettingsUpdate`, and persists through `UserInfoEngine`
 * (`MJ: User Settings`) rather than browser storage. All five helpers are already framework-neutral
 * — four in `@memberjunction/react-runtime`, one in core-entities — so this uses them rather than
 * inventing a mobile key format.
 *
 * That matters beyond tidiness: the key and the scope ARE the compatibility surface. A component
 * whose settings were saved on a desktop opens on a phone with those settings, because both hosts
 * compute the same key for the same component. A mobile-only key format would have quietly created
 * two profiles per user.
 *
 * `SetSettingDebounced` is what the web uses and is right here too — a component that saves on every
 * drag would otherwise write on every frame.
 */

import { UserInfoEngine } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import {
    applyUserSettingsUpdate,
    mergeUserSettings,
    parseStoredUserSettings,
    resolveUserStateScope,
    userStateStorageKey,
} from '@memberjunction/react-runtime';
import type { ComponentSpec } from '@memberjunction/react-runtime';

/** A component's persisted settings: a flat key/value object. */
export type UserSettings = Record<string, unknown>;

/**
 * The storage key for a spec's settings, or `null` when no stable scope can be derived.
 *
 * A component with neither a namespace nor a name has nothing to scope by, and a key invented for
 * it would collide with the next such component.
 *
 * @param spec The spec being rendered.
 */
export function SettingsKeyForSpec(spec: ComponentSpec | null | undefined): string | null {
    const scope = resolveUserStateScope(undefined, spec?.namespace, spec?.name);
    return userStateStorageKey(scope);
}

/**
 * Reads this user's saved settings for a component.
 *
 * Best effort by design: a settings read that fails must cost the user their sort order, never the
 * component. Returns `{}` on any failure.
 *
 * @param spec The spec being rendered.
 * @param user The acting user; without one there is nothing to scope to.
 */
export async function LoadUserSettings(
    spec: ComponentSpec | null | undefined,
    user: UserInfo | null | undefined,
): Promise<UserSettings> {
    const key = SettingsKeyForSpec(spec);
    if (!key || !user) return {};
    try {
        // Idempotent — a no-op when the engine is already loaded for this user.
        await UserInfoEngine.Instance.Config(false, user);
        return mergeUserSettings({}, parseStoredUserSettings(UserInfoEngine.Instance.GetSetting(key)));
    } catch (error) {
        console.warn('Interactive component: failed to read saved settings', error);
        return {};
    }
}

/**
 * Builds the `onSaveUserSettings` callback for a component.
 *
 * Merges rather than replaces, for the same two reasons the web does: a component may send only the
 * keys it changed, and the `savedUserSettings` prop it holds is frozen at mount (neither host
 * re-renders on save, because the component already has the value — it is the one that reported the
 * change). Removing a key therefore takes explicit intent: send `null` for it.
 *
 * @param spec The spec being rendered.
 * @param user The acting user.
 * @param initial The settings the component mounted with.
 */
export function BuildSaveUserSettings(
    spec: ComponentSpec | null | undefined,
    user: UserInfo | null | undefined,
    initial: UserSettings,
): (settings: UserSettings) => void {
    const key = SettingsKeyForSpec(spec);
    let current = initial;

    return (incoming: UserSettings): void => {
        current = applyUserSettingsUpdate(current, incoming);
        if (!key || !user) return;
        try {
            UserInfoEngine.Instance.SetSettingDebounced(key, JSON.stringify(current), user);
        } catch (error) {
            console.warn('Interactive component: failed to persist settings', error);
        }
    };
}
