import { UserInfoEngine } from '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import { ResolveContributionKey, type FormContributionRegistration } from './form-contribution';

/**
 * Panels a user has hidden from their own form.
 *
 * Anything a user did not add themselves can be hidden — a panel published to their role or to
 * everyone, or one shipped in code — and brought back later. The list is a user setting per
 * entity, the same way the user's choice of full custom form is stored, so it follows them across
 * devices.
 */

/** Prefix of the per-entity setting that lists hidden panels. */
const HIDE_SETTING_PREFIX = 'mj.formPanels.hidden.';

/** Prefix that marks a hide key taken from a compiled panel's class registration. */
const CLASS_KEY_PREFIX = 'class:';

/** The setting that lists one entity's hidden panels. Lowercased, so case variants share it. */
export function PanelHideSettingKey(entityName: string): string {
    return HIDE_SETTING_PREFIX + (entityName ?? '').trim().toLowerCase();
}

/**
 * The key a panel is hidden by, or null when it has no stable identity.
 *
 * The contribution key where there is one — it survives a published panel's new versions, where
 * a row id would lapse the moment the publisher edited it. A compiled panel that declares none is
 * known by the key it registered under, prefixed so it cannot collide with a contribution key.
 */
export function PanelHideKey(registration: FormContributionRegistration): string | null {
    const contributionKey = ResolveContributionKey(registration.Metadata);
    if (contributionKey) return contributionKey;
    const classKey = registration.Registration?.Key?.trim();
    return classKey ? CLASS_KEY_PREFIX + classKey : null;
}

/** The hidden keys in a stored setting. A missing or malformed value hides nothing. */
export function ParseHiddenPanelKeys(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const parsed = SafeJSONParse<unknown>(raw, false);
    if (!Array.isArray(parsed)) return [];
    const keys: string[] = [];
    for (const item of parsed) {
        if (typeof item !== 'string') continue;
        const key = item.trim();
        if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
}

/** The raw stored value for one entity, which the collector folds into its memo key. */
export function HiddenPanelsSetting(entityName: string): string {
    try {
        return UserInfoEngine.Instance.GetSetting(PanelHideSettingKey(entityName)) ?? '';
    } catch {
        // No user settings in this context — nothing is hidden.
        return '';
    }
}

/** The panels this user has hidden on one entity's form. */
export function HiddenPanelKeys(entityName: string): string[] {
    return ParseHiddenPanelKeys(HiddenPanelsSetting(entityName));
}

/** Hide a panel for this user, or bring it back. */
export function SetPanelHidden(entityName: string, key: string, hidden: boolean): void {
    const current = HiddenPanelKeys(entityName);
    const next = hidden
        ? (current.includes(key) ? current : [...current, key])
        : current.filter((k) => k !== key);
    UserInfoEngine.Instance.SetSettingDebounced(PanelHideSettingKey(entityName), JSON.stringify(next));
}

/**
 * The registrations with the hidden ones removed.
 *
 * A user's own panel is never dropped, even when its key is listed: they turn it off, which is a
 * separate switch in a separate place, and letting a hide reach it too would give one thing two
 * switches. Returns the same array when nothing is hidden, so callers that memoize on identity
 * keep their memo.
 */
export function WithoutHiddenPanels(
    registrations: FormContributionRegistration[],
    hidden: readonly string[],
): FormContributionRegistration[] {
    if (hidden.length === 0) return registrations;
    const hiddenSet = new Set(hidden);
    return registrations.filter((registration) => {
        if (registration.Source === 'metadata' && registration.Scope === 'User') return true;
        const key = PanelHideKey(registration);
        return !key || !hiddenSet.has(key);
    });
}
