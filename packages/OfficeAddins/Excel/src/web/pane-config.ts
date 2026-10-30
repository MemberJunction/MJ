/**
 * The host's add-in settings, read from `config.json` beside the pane. The Server Extension writes
 * it from its own configuration, so the pane never guesses a URL.
 */
import { EXCEL_WORKBOOK_CONTRACT_VERSION } from '../contract';

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

/** True when two add-in base URLs name the same place (ignoring a trailing slash and case). */
export function SameAddinUrl(a: string, b: string): boolean {
    const normalize = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
    return normalize(a) === normalize(b);
}
