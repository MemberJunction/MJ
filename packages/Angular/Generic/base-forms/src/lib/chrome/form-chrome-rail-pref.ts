/** Default for a user who has never touched the rail on this entity. */
export const FORM_CHROME_RAIL_PINNED_DEFAULT = true;

/** UserInfoEngine key: `mj.formChrome.<entity>.railPinned`. */
export function FormChromeRailPinnedKey(entityName: string): string {
    const name = (entityName ?? 'entity').trim().toLowerCase();
    return `mj.formChrome.${name}.railPinned`;
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
