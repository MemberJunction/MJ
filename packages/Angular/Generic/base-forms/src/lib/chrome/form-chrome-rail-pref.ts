/** Default for a user who has never touched the rail on this entity. */
export const FORM_CHROME_RAIL_PINNED_DEFAULT = true;

export const FORM_CHROME_RAIL_WIDTH_DEFAULT = 200;
export const FORM_CHROME_RAIL_WIDTH_MIN = 160;
export const FORM_CHROME_RAIL_WIDTH_MAX = 360;
export const FORM_CHROME_RAIL_COLLAPSED_PX = 36;

/** UserInfoEngine key: `mj.formChrome.<entity>.railPinned`. */
export function FormChromeRailPinnedKey(entityName: string): string {
    const name = (entityName ?? 'entity').trim().toLowerCase();
    return `mj.formChrome.${name}.railPinned`;
}

/**
 * Left-nav `activeGroup` is stored per entity. Unsaved (new) records must
 * neither restore nor write it — they should open on the first first-class
 * group (Details) instead of the last related section from another record.
 */
/**
 * The rail key a contribution asked to lead on for an UNSAVED record, or null.
 *
 * Sits beside `ShouldPersistChromeActiveGroup` because it answers the other half of the same
 * question: that one says a new record must not restore a stored position, this one says where it
 * should go instead. Without it a new record opens on the lead group, which is usually a summary --
 * and a summary of a record with no data is a page of blanks to look past.
 *
 * Highest `Priority` wins when several contributions on one entity declare it, matching how every
 * other conflict between registrations is settled. Null when none does, which leaves the existing
 * behaviour exactly as it was -- this is opt-in per form, not a change to the default.
 *
 * Pure so it can be tested without standing up a container: the caller supplies the registrations
 * and the key-derivation it already uses for the rail.
 */
export function UnsavedLeadGroupKey<TMeta extends { entity?: string; leadsWhenUnsaved?: boolean }>(
    entityName: string | null | undefined,
    registrations: ReadonlyArray<{ Priority?: number; Metadata?: TMeta }>,
    railKeyOf: (meta: TMeta) => string | null,
): string | null {
    if (!entityName) return null;
    const ordered = [...registrations].sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
    for (const reg of ordered) {
        const meta = reg.Metadata;
        if (!meta || meta.entity !== entityName || meta.leadsWhenUnsaved !== true) continue;
        const key = railKeyOf(meta);
        if (key) return key;
    }
    return null;
}

export function ShouldPersistChromeActiveGroup(isSaved: boolean | null | undefined): boolean {
    return isSaved === true;
}

/** UserInfoEngine key: `mj.formChrome.<entity>.railWidth`. */
export function FormChromeRailWidthKey(entityName: string): string {
    const name = (entityName ?? 'entity').trim().toLowerCase();
    return `mj.formChrome.${name}.railWidth`;
}

/** Missing / unknown values stay pinned so existing forms do not jump. */
export function ParseRailPinnedSetting(raw: string | undefined | null): boolean {
    if (raw === '0' || raw === 'false') {
        return false;
    }
    if (raw === '1' || raw === 'true') {
        return true;
    }
    return FORM_CHROME_RAIL_PINNED_DEFAULT;
}

export function SerializeRailPinnedSetting(pinned: boolean): '1' | '0' {
    return pinned ? '1' : '0';
}

export function ClampRailWidth(px: number): number {
    if (!Number.isFinite(px)) return FORM_CHROME_RAIL_WIDTH_DEFAULT;
    return Math.min(
        FORM_CHROME_RAIL_WIDTH_MAX,
        Math.max(FORM_CHROME_RAIL_WIDTH_MIN, Math.round(px)),
    );
}

/** Missing / junk values fall back to the default expanded width. */
export function ParseRailWidthSetting(raw: string | undefined | null): number {
    if (raw == null || raw.trim() === '') return FORM_CHROME_RAIL_WIDTH_DEFAULT;
    return ClampRailWidth(Number(raw));
}

export function SerializeRailWidthSetting(px: number): string {
    return String(ClampRailWidth(px));
}
