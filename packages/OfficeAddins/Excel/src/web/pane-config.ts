/**
 * The host's add-in settings, read from `config.json` beside the pane (or from a custom MemberJunction
 * server URL chosen by the user in Excel's server switcher).
 *
 * Like `connection-store.ts`, `localStorage` is used only for the standalone Excel add-in host origin's
 * active server URL pointer before any MemberJunction session or `UserInfoEngine` exists.
 */
import { EXCEL_WORKBOOK_CONTRACT_VERSION } from '../contract';

const ACTIVE_SERVER_STORAGE_KEY = 'mj.excelAddin.activeServerUrl.v1';

export interface PaneConfig {
    ContractVersion: number;
    ServerName: string;
    /** This add-in's public base URL. A workbook from another host names a different one. */
    AddinUrl: string;
    /** Explorer's connect page. */
    ExplorerConnectUrl: string;
    /** The most rows fetched per sheet. */
    MaxRows: number;
}

export async function LoadPaneConfig(): Promise<PaneConfig> {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`The add-in's settings couldn't be loaded (HTTP ${response.status}).`);
    }
    const raw = (await response.json()) as Partial<PaneConfig>;
    return ValidatePaneConfig(raw);
}

/**
 * Resolves `config.json` from a user-entered MemberJunction server URL (accepts a bare MJAPI origin
 * such as `https://api.example.org`, an `/office/excel` add-in URL, or a direct `/config.json` URL).
 */
export async function ResolveCustomPaneConfig(inputUrl: string): Promise<PaneConfig> {
    const candidates = BuildCandidateConfigUrls(inputUrl);
    let lastError = 'That MemberJunction server could not be reached.';
    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate, { cache: 'no-store' });
            if (!response.ok) {
                lastError = `Server responded with HTTP ${response.status} at ${candidate}.`;
                continue;
            }
            const raw = (await response.json()) as Partial<PaneConfig>;
            return ValidatePaneConfig(raw);
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }
    throw new Error(`Could not find an active MemberJunction Excel add-in at "${inputUrl.trim()}". ${lastError}`);
}

/** Ordered `config.json` URLs to probe for a user-supplied server address. */
export function BuildCandidateConfigUrls(inputUrl: string): string[] {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
        throw new Error('Enter a MemberJunction server URL (for example, https://api.example.org).');
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
        parsed = new URL(withProtocol);
    } catch {
        throw new Error('Enter a valid https:// or http:// server URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('The server URL must start with https:// or http://.');
    }
    parsed.hash = '';
    parsed.search = '';
    const base = parsed.toString().replace(/\/+$/, '');
    const candidates: string[] = [];
    const pushUnique = (u: string): void => {
        if (!candidates.includes(u)) {
            candidates.push(u);
        }
    };
    if (base.toLowerCase().endsWith('/config.json')) {
        pushUnique(base);
    } else if (base.toLowerCase().endsWith('/office/excel')) {
        pushUnique(`${base}/config.json`);
    } else {
        pushUnique(`${base}/office/excel/config.json`);
        pushUnique(`${parsed.origin}/office/excel/config.json`);
        pushUnique(`${base}/config.json`);
    }
    return candidates;
}

export function ValidatePaneConfig(raw: Partial<PaneConfig>): PaneConfig {
    if (raw.ContractVersion !== EXCEL_WORKBOOK_CONTRACT_VERSION) {
        throw new Error('The add-in and its server are on different versions. Ask your administrator to update the add-in.');
    }
    if (!raw.ServerName || !raw.AddinUrl || !raw.ExplorerConnectUrl) {
        throw new Error('The add-in\'s settings are incomplete. Ask your administrator to check the Excel add-in configuration.');
    }
    return {
        ContractVersion: raw.ContractVersion,
        ServerName: raw.ServerName,
        AddinUrl: raw.AddinUrl,
        ExplorerConnectUrl: raw.ExplorerConnectUrl,
        MaxRows: typeof raw.MaxRows === 'number' && raw.MaxRows > 0 ? raw.MaxRows : 100000,
    };
}

/** Normalized form of an add-in base URL (trimmed, no trailing slashes, lowercase). */
export function NormalizeAddinUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** True when two add-in base URLs name the same place (ignoring a trailing slash and case). */
export function SameAddinUrl(a: string, b: string): boolean {
    return NormalizeAddinUrl(a) === NormalizeAddinUrl(b);
}

/** Reads the user's chosen custom MJ server add-in URL, or null when using the default host. */
export function LoadSavedServerUrl(): string | null {
    try {
        const value = window.localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY)?.trim();
        return value ? value : null;
    } catch {
        return null;
    }
}

/** Persists or clears the user's chosen custom MJ server add-in URL on this device. */
export function SaveServerUrl(addinUrl: string | null): void {
    try {
        if (addinUrl && addinUrl.trim().length > 0) {
            window.localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, addinUrl.trim());
        } else {
            window.localStorage.removeItem(ACTIVE_SERVER_STORAGE_KEY);
        }
    } catch {
        // Storage may be blocked in strict environments; session state still works in memory.
    }
}
