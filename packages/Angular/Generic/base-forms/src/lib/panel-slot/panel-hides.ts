import { FormPanelHideSettingKey, ParseHiddenFormPanelKeys, UserInfoEngine } from '@memberjunction/core-entities';
import { ResolveContributionKey, type FormContributionRegistration } from './form-contribution';

/**
 * Panels a user has hidden from their own form.
 *
 * Anything a user did not add themselves can be hidden — a panel published to their role or to
 * everyone, or one shipped in code — and brought back later. The list is a user setting per
 * entity ({@link FormPanelHideSettingKey}), the same way the user's choice of full custom form is
 * stored, so it follows them across devices, and the server reads the same key.
 */

/** Prefix that marks a hide key taken from a compiled panel's class registration. */
const CLASS_KEY_PREFIX = 'class:';

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

/** The raw stored value for one entity, which the collector folds into its memo key. */
export function HiddenPanelsSetting(entityName: string): string {
    try {
        return UserInfoEngine.Instance.GetSetting(FormPanelHideSettingKey(entityName)) ?? '';
    } catch {
        // No user settings in this context — nothing is hidden.
        return '';
    }
}

/** The panels this user has hidden on one entity's form. */
export function HiddenPanelKeys(entityName: string): string[] {
    return ParseHiddenFormPanelKeys(HiddenPanelsSetting(entityName));
}

/** Hide a panel for this user, or bring it back. */
export function SetPanelHidden(entityName: string, key: string, hidden: boolean): void {
    const current = HiddenPanelKeys(entityName);
    const next = hidden
        ? (current.includes(key) ? current : [...current, key])
        : current.filter((k) => k !== key);
    UserInfoEngine.Instance.SetSettingDebounced(FormPanelHideSettingKey(entityName), JSON.stringify(next));
}

/**
 * Whether the user's hides drop this registration from their form.
 *
 * A user's own panel is never dropped, even when its key is listed: they turn it off, which is a
 * separate switch in a separate place, and letting a hide reach it too would give one thing two
 * switches.
 */
export function IsPanelHiddenByUser(registration: FormContributionRegistration, hidden: ReadonlySet<string>): boolean {
    if (hidden.size === 0) return false;
    if (registration.Source === 'metadata' && registration.Scope === 'User') return false;
    const key = PanelHideKey(registration);
    return !!key && hidden.has(key);
}

/**
 * The registrations with the hidden ones removed ({@link IsPanelHiddenByUser}). Returns the same
 * array when nothing is hidden, so callers that memoize on identity keep their memo.
 */
export function WithoutHiddenPanels(
    registrations: FormContributionRegistration[],
    hidden: readonly string[],
): FormContributionRegistration[] {
    if (hidden.length === 0) return registrations;
    const hiddenSet = new Set(hidden);
    return registrations.filter((registration) => !IsPanelHiddenByUser(registration, hiddenSet));
}
