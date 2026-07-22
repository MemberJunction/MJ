import { InstanceConfigEngine, UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Two-layer omnibar enablement:
 *
 *  1. INSTANCE master switch — the 'Shell.Omnibar.Enabled' Instance Config row.
 *     Default TRUE when absent, meaning the feature is AVAILABLE. Setting it to
 *     false kills the omnibar for everyone (legacy trio for all users) and hides
 *     the per-user toggle in My Profile.
 *  2. PER-USER opt-in — the 'mj.shell.omnibar.enabled' User Setting
 *     (UserInfoEngine → MJ: User Settings, so it follows the user across
 *     browsers/devices). Absent or anything other than 'true' = legacy trio.
 *
 * Net: availability is instance policy; actual enablement is a personal opt-in
 * from My Profile → Command Palette.
 */

/** Instance Config key — the master availability switch. */
export const OMNIBAR_INSTANCE_CONFIG_KEY = 'Shell.Omnibar.Enabled';

/** Per-user opt-in key in MJ: User Settings (values 'true' / 'false'). */
export const OMNIBAR_USER_SETTING_KEY = 'mj.shell.omnibar.enabled';

/**
 * Per-user dismissal of the "try the command palette" promo shown in the legacy
 * search surfaces. 'true' = never show again (follows the user across devices).
 */
export const OMNIBAR_PROMO_DISMISSED_KEY = 'mj.shell.omnibarPromo.dismissed';

/**
 * Pure resolution of the two layers — instance availability gates everything;
 * the user setting must be the exact string 'true' to opt in.
 */
export function ResolveOmnibarEnabled(instanceEnabled: boolean, userSetting: string | undefined): boolean {
    if (!instanceEnabled) {
        return false;
    }
    return userSetting === 'true';
}

/** Whether the instance makes the omnibar available at all (master switch). */
export function IsOmnibarAvailable(): boolean {
    return InstanceConfigEngine.Instance.GetBoolean(OMNIBAR_INSTANCE_CONFIG_KEY, true);
}

/**
 * Whether the omnibar is ON for the current user (availability × opt-in).
 * Fail-closed: this is read from the shell template on every change-detection
 * pass, so an engine that isn't loaded yet (boot) or is permission-constrained
 * must resolve to the legacy trio, never throw.
 */
export function IsOmnibarEnabledForUser(): boolean {
    try {
        return ResolveOmnibarEnabled(
            IsOmnibarAvailable(),
            UserInfoEngine.Instance.GetSetting(OMNIBAR_USER_SETTING_KEY)
        );
    } catch {
        return false;
    }
}
