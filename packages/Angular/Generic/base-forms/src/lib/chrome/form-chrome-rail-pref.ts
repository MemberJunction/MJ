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
