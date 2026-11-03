/**
 * @fileoverview The Excel add-in's settings, as a host writes them in `mj.config.cjs`
 * (`serverExtensions[].Settings`), and their validation.
 *
 * @module @memberjunction/excel-addin-server
 */
import { IsValidUUID, TrimTrailingSlashes } from '@memberjunction/global';

/**
 * The add-in's identity in Office. Every MJ host serves the same add-in, so the default is one fixed
 * GUID; a host that deploys a second, differently configured copy to the same Microsoft 365 tenant
 * sets its own `AddinId`.
 */
export const DEFAULT_EXCEL_ADDIN_ID = 'AAEB4761-75CC-4DB1-99BD-7790FAD307C6';

/** The add-in version written into the manifest and every workbook (Office's four-part form). */
export const DEFAULT_EXCEL_ADDIN_VERSION = '1.0.0.0';

/** How long a connection key lasts by default, in days. */
export const DEFAULT_EXCEL_KEY_LIFETIME_DAYS = 90;

/** The most rows the pane writes for one source by default. */
export const DEFAULT_EXCEL_MAX_ROWS = 100000;

/**
 * Where the workbook says the add-in is deployed. `EXCatalog` is Microsoft 365 centralized
 * deployment (the admin center), which this package documents.
 */
export const DEFAULT_EXCEL_STORE_TYPE = 'EXCatalog';

const MIN_KEY_LIFETIME_DAYS = 1;
const MAX_KEY_LIFETIME_DAYS = 365;
/** Excel holds 1,048,576 rows; one is the heading. */
const MAX_ROWS_LIMIT = 1048575;
const MAX_TEXT_LENGTH = 200;
const VERSION_PATTERN = /^\d{1,5}(\.\d{1,5}){0,3}$/;

/** The add-in's settings, after validation and defaults. */
export interface ExcelAddinSettings {
    /** Where MJ Explorer runs; the add-in's sign-in window opens its `/office/connect` page. */
    ExplorerUrl: string;
    /** The host's name, shown in Excel and on the connect page. */
    ServerName: string;
    /** The add-in's GUID in the manifest and in every workbook. */
    AddinId: string;
    /** The add-in's version in the manifest and in every workbook. */
    Version: string;
    /** How long a connection key lasts. */
    KeyLifetimeDays: number;
    /** The `store` a workbook names for the add-in. */
    Store: string;
    /** The `storeType` a workbook names for the add-in. */
    StoreType: string;
    /** The most rows the pane writes for one source. */
    MaxRows: number;
}

/** The outcome of {@link ParseExcelAddinSettings}. */
export interface ParseExcelAddinSettingsResult {
    Success: boolean;
    Settings?: ExcelAddinSettings;
    ErrorMessage?: string;
}

/**
 * Validates a host's settings and fills in defaults. Never throws: a problem returns
 * `Success: false` with a message naming the setting.
 */
export function ParseExcelAddinSettings(raw: Record<string, unknown> | null | undefined): ParseExcelAddinSettingsResult {
    const settings = raw ?? {};
    const explorerUrl = parseExplorerUrl(settings.ExplorerUrl);
    if (!explorerUrl) {
        return fail('Settings.ExplorerUrl is required: the http(s) address where MJ Explorer runs.');
    }
    const addinId = settings.AddinId ?? DEFAULT_EXCEL_ADDIN_ID;
    if (typeof addinId !== 'string' || !IsValidUUID(addinId)) {
        return fail('Settings.AddinId must be a GUID.');
    }
    const version = settings.Version ?? DEFAULT_EXCEL_ADDIN_VERSION;
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
        return fail('Settings.Version must look like 1.0.0.0.');
    }
    const lifetime = parseInteger(settings.KeyLifetimeDays, DEFAULT_EXCEL_KEY_LIFETIME_DAYS, MIN_KEY_LIFETIME_DAYS, MAX_KEY_LIFETIME_DAYS);
    if (lifetime === null) {
        return fail(`Settings.KeyLifetimeDays must be a whole number from ${MIN_KEY_LIFETIME_DAYS} to ${MAX_KEY_LIFETIME_DAYS}.`);
    }
    const maxRows = parseInteger(settings.MaxRows, DEFAULT_EXCEL_MAX_ROWS, 1, MAX_ROWS_LIMIT);
    if (maxRows === null) {
        return fail(`Settings.MaxRows must be a whole number from 1 to ${MAX_ROWS_LIMIT}.`);
    }
    const texts = parseTexts(settings);
    if (typeof texts === 'string') {
        return fail(texts);
    }
    return {
        Success: true,
        Settings: { ExplorerUrl: explorerUrl, AddinId: addinId.toUpperCase(), Version: version, KeyLifetimeDays: lifetime, MaxRows: maxRows, ...texts },
    };
}

function parseTexts(settings: Record<string, unknown>): Pick<ExcelAddinSettings, 'ServerName' | 'Store' | 'StoreType'> | string {
    const serverName = parseText(settings.ServerName, 'MemberJunction');
    const storeType = parseText(settings.StoreType, DEFAULT_EXCEL_STORE_TYPE);
    const store = parseText(settings.Store, typeof storeType === 'string' ? storeType : DEFAULT_EXCEL_STORE_TYPE);
    if (serverName === null) {
        return `Settings.ServerName must be text of 1 to ${MAX_TEXT_LENGTH} characters.`;
    }
    if (storeType === null || store === null) {
        return `Settings.Store and Settings.StoreType must be text of 1 to ${MAX_TEXT_LENGTH} characters.`;
    }
    return { ServerName: serverName, Store: store, StoreType: storeType };
}

function parseExplorerUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
        }
        return TrimTrailingSlashes(url.toString());
    } catch {
        return null;
    }
}

function parseInteger(value: unknown, fallback: number, min: number, max: number): number | null {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        return null;
    }
    return value;
}

function parseText(value: unknown, fallback: string): string | null {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_TEXT_LENGTH ? trimmed : null;
}

function fail(message: string): ParseExcelAddinSettingsResult {
    return { Success: false, ErrorMessage: message };
}
