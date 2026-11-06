import { SafeJSONParse } from '@memberjunction/global';

/**
 * Where a user's hidden panels are stored.
 *
 * A user can hide a panel someone else put on their form and bring it back later. The list is an
 * `MJ: User Settings` value per entity: a JSON array of panel keys. Lives here so the browser,
 * which applies the hides, and the server, which reports the form a user sees, read one key.
 */

/** `MJ: User Settings` key prefix for the per-entity list of hidden panels. */
export const FORM_PANEL_HIDE_SETTING_PREFIX = 'mj.formPanels.hidden.';

/** The settings key for one entity. Trimmed and lowercased, so case variants share one row. */
export function FormPanelHideSettingKey(entityName: string): string {
    return FORM_PANEL_HIDE_SETTING_PREFIX + (entityName ?? '').trim().toLowerCase();
}

/** The hidden keys in a stored setting, trimmed and without repeats. A missing or malformed value hides nothing. */
export function ParseHiddenFormPanelKeys(raw: string | null | undefined): string[] {
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
