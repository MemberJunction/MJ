/**
 * @fileoverview The Open in Excel workbook contract.
 *
 * The server writes an `.xlsx` whose data sheets hold only headings, plus a very-hidden sheet that
 * records where each data sheet's rows come from. The add-in pane reads that record and fills the
 * sheets as whoever opened the file. This file is the one definition both sides share.
 *
 * **Dependency-free on purpose.** The pane bundle (`src/web`) imports this module, so nothing here
 * may import a MemberJunction runtime package. That is also why it validates UUIDs with its own
 * pattern instead of `@memberjunction/global`'s `IsValidUUID`.
 *
 * **The file is untrusted input.** Anyone can edit a workbook, so {@link ParseWorkbookManifest}
 * validates every field before the pane acts on it, and the server re-checks every source against
 * the caller's permissions on each refresh anyway.
 *
 * @module @memberjunction/excel-addin
 */

/** Bumped when {@link ExcelWorkbookManifest} changes incompatibly. */
export const EXCEL_WORKBOOK_CONTRACT_VERSION = 1;

/** The very-hidden worksheet holding the workbook's {@link ExcelWorkbookManifest}. */
export const EXCEL_SOURCES_SHEET_NAME = 'MJ_Sources';

/** Excel caps a cell at 32,767 characters, so the manifest JSON is split down column A in chunks this size. */
export const EXCEL_SOURCES_CHUNK_SIZE = 30000;

/** The most sources one workbook may carry. */
export const EXCEL_MAX_SOURCES_PER_WORKBOOK = 10;

/** Excel's own limit on a worksheet name's length. */
export const EXCEL_MAX_SHEET_NAME_LENGTH = 31;

/** Excel's own limit on the characters in one cell. */
export const EXCEL_MAX_CELL_LENGTH = 32767;

/** What a sheet's rows come from. */
export type ExcelSourceKind = 'View' | 'Query';

/** How the pane writes a column's values into Excel. */
export type ExcelColumnDataType = 'Text' | 'Number' | 'Boolean' | 'Date' | 'DateTime';

/** A query parameter value as it travels in a workbook. Dates travel as ISO strings. */
export type ExcelParameterValue = string | number | boolean | null | string[];

/** One column of a data sheet. */
export interface ExcelSourceColumn {
    /** The field name in the result rows. */
    Name: string;
    /** The heading written into the sheet. */
    Header: string;
    /** How values are written; `Text` when unknown. */
    DataType: ExcelColumnDataType;
}

/** One data sheet and the saved view or query that fills it. */
export interface ExcelWorkbookSource {
    /** Stable within the workbook (`s1`, `s2`, ...); names the sheet's Excel table. */
    Key: string;
    Kind: ExcelSourceKind;
    /** The saved view's or saved query's ID. */
    ID: string;
    /** The view's or query's name, for display. */
    Name: string;
    /** The worksheet the rows go into. */
    SheetName: string;
    /** Columns in display order. Empty for a query whose fields are unknown: the pane uses the result's own columns. */
    Columns: ExcelSourceColumn[];
    /** Query parameter values the user chose. Never server-set parameters; never present for a view. */
    Parameters?: Record<string, ExcelParameterValue>;
}

/** Everything a workbook records about its sources. */
export interface ExcelWorkbookManifest {
    ContractVersion: number;
    /** The MJ host's display name. */
    ServerName: string;
    /** The add-in's public base URL on the host that built the file. The pane refuses a file from another host. */
    AddinUrl: string;
    /** ISO timestamp. */
    GeneratedAt: string;
    Sources: ExcelWorkbookSource[];
}

/** The outcome of {@link ParseWorkbookManifest}. */
export interface ParseWorkbookManifestResult {
    Success: boolean;
    Manifest?: ExcelWorkbookManifest;
    ErrorMessage?: string;
}

/** A cell value Excel accepts. */
export type ExcelCellValue = string | number | boolean;

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SOURCE_KEY_PATTERN = /^s[0-9]{1,3}$/;
const INVALID_SHEET_NAME_CHARS = /[\[\]:*?/\\]/g;
const COLUMN_DATA_TYPES: readonly ExcelColumnDataType[] = ['Text', 'Number', 'Boolean', 'Date', 'DateTime'];
const MAX_NAME_LENGTH = 500;
const MAX_COLUMNS = 1000;

/**
 * Splits a manifest's JSON into chunks that each fit in one Excel cell, to be written down column A.
 */
export function SplitManifestForCells(manifest: ExcelWorkbookManifest): string[] {
    const json = JSON.stringify(manifest);
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += EXCEL_SOURCES_CHUNK_SIZE) {
        chunks.push(json.slice(i, i + EXCEL_SOURCES_CHUNK_SIZE));
    }
    return chunks;
}

/**
 * Reassembles and validates a manifest read back from the sources sheet's column A.
 * Never throws: a malformed or tampered file returns `Success: false` with the reason.
 */
export function ParseWorkbookManifest(cells: readonly string[]): ParseWorkbookManifestResult {
    const json = cells.filter(c => typeof c === 'string').join('');
    if (!json) {
        return fail('This workbook has no MemberJunction sources.');
    }
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return fail('The workbook\'s source list is damaged and can\'t be read.');
    }
    return validateManifest(raw);
}

/**
 * Makes a worksheet name Excel accepts and that no other sheet in `used` already has
 * (compared case-insensitively, as Excel does). Adds the result to `used`.
 */
export function MakeUniqueSheetName(name: string, used: Set<string>): string {
    let base = (name ?? '').replace(INVALID_SHEET_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
    base = base.replace(/^'+|'+$/g, '').trim();
    if (!base || base.toLowerCase() === 'history' || base.toLowerCase() === EXCEL_SOURCES_SHEET_NAME.toLowerCase()) {
        base = 'Data';
    }
    let candidate = base.slice(0, EXCEL_MAX_SHEET_NAME_LENGTH).trim();
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
        const suffix = ` (${n})`;
        candidate = base.slice(0, EXCEL_MAX_SHEET_NAME_LENGTH - suffix.length).trim() + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

/** The Excel table name for a source, unique within the workbook. */
export function TableNameForSource(source: Pick<ExcelWorkbookSource, 'Key'>): string {
    return `MJ_${source.Key}`;
}

/**
 * The columns to write for a result: the source's own columns, or, when it declares none (a query
 * whose fields aren't recorded), the keys of the first row as text columns.
 */
export function ResolveColumns(source: ExcelWorkbookSource, rows: readonly Record<string, unknown>[]): ExcelSourceColumn[] {
    if (source.Columns.length > 0) {
        return source.Columns;
    }
    const first = rows[0];
    if (!first) {
        return [];
    }
    return Object.keys(first).map(key => ({ Name: key, Header: key, DataType: 'Text' as const }));
}

/**
 * Turns result rows into the matrix written to a sheet: the heading row, then one row per record.
 * `toLocalDate` converts a date or date-time value; the pane passes one that yields an Excel serial number.
 */
export function BuildSheetMatrix(
    columns: readonly ExcelSourceColumn[],
    rows: readonly Record<string, unknown>[],
    toLocalDate: (value: string, dateOnly: boolean) => number | null,
): ExcelCellValue[][] {
    const matrix: ExcelCellValue[][] = [columns.map(c => c.Header)];
    for (const row of rows) {
        matrix.push(columns.map(c => ToExcelCellValue(row[c.Name], c.DataType, toLocalDate)));
    }
    return matrix;
}

/** Converts one JSON value from a result row into a value Excel accepts. */
export function ToExcelCellValue(
    value: unknown,
    dataType: ExcelColumnDataType,
    toLocalDate: (value: string, dateOnly: boolean) => number | null,
): ExcelCellValue {
    if (value === null || value === undefined) {
        return '';
    }
    if ((dataType === 'Date' || dataType === 'DateTime') && typeof value === 'string') {
        const serial = toLocalDate(value, dataType === 'Date');
        return serial ?? value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > EXCEL_MAX_CELL_LENGTH ? text.slice(0, EXCEL_MAX_CELL_LENGTH) : text;
}

/**
 * Excel's serial number for a moment: days since 1899-12-30, in the local wall-clock time of
 * `offsetMinutes` (as `Date.getTimezoneOffset` reports it). A date-only value keeps its calendar day.
 * Returns null for a value that isn't a date.
 */
export function ToExcelSerialDate(value: string, dateOnly: boolean, offsetMinutes: (ms: number) => number): number | null {
    const msPerDay = 86400000;
    const excelEpochOffsetDays = 25569; // days from 1899-12-30 to 1970-01-01
    if (dateOnly) {
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        if (!match) {
            return null;
        }
        const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return utcMidnight / msPerDay + excelEpochOffsetDays;
    }
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        return null;
    }
    const local = ms - offsetMinutes(ms) * 60000;
    return local / msPerDay + excelEpochOffsetDays;
}

function fail(message: string): ParseWorkbookManifestResult {
    return { Success: false, ErrorMessage: message };
}

function validateManifest(raw: unknown): ParseWorkbookManifestResult {
    if (!isRecord(raw)) {
        return fail('The workbook\'s source list is damaged.');
    }
    if (raw.ContractVersion !== EXCEL_WORKBOOK_CONTRACT_VERSION) {
        return fail('This workbook was made by a different version of MemberJunction. Open it again from MemberJunction.');
    }
    if (!isBoundedString(raw.ServerName) || !isBoundedString(raw.AddinUrl) || !isBoundedString(raw.GeneratedAt)) {
        return fail('The workbook\'s source list is missing where it came from.');
    }
    if (!Array.isArray(raw.Sources) || raw.Sources.length === 0 || raw.Sources.length > EXCEL_MAX_SOURCES_PER_WORKBOOK) {
        return fail('The workbook\'s source list is damaged.');
    }
    const sources: ExcelWorkbookSource[] = [];
    for (const candidate of raw.Sources) {
        const source = validateSource(candidate);
        if (!source) {
            return fail('One of the workbook\'s sources is damaged.');
        }
        sources.push(source);
    }
    if (!hasUniqueValues(sources.map(s => s.Key)) || !hasUniqueValues(sources.map(s => s.SheetName.toLowerCase()))) {
        return fail('The workbook\'s sources overlap.');
    }
    return {
        Success: true,
        Manifest: {
            ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
            ServerName: raw.ServerName,
            AddinUrl: raw.AddinUrl,
            GeneratedAt: raw.GeneratedAt,
            Sources: sources,
        },
    };
}

function validateSource(raw: unknown): ExcelWorkbookSource | null {
    if (!isRecord(raw)) {
        return null;
    }
    const kindOk = raw.Kind === 'View' || raw.Kind === 'Query';
    const keyOk = typeof raw.Key === 'string' && SOURCE_KEY_PATTERN.test(raw.Key);
    const idOk = typeof raw.ID === 'string' && UUID_PATTERN.test(raw.ID);
    const sheetOk = isBoundedString(raw.SheetName, EXCEL_MAX_SHEET_NAME_LENGTH);
    if (!kindOk || !keyOk || !idOk || !sheetOk || !isBoundedString(raw.Name)) {
        return null;
    }
    const columns = validateColumns(raw.Columns);
    const parameters = validateParameters(raw.Parameters, raw.Kind === 'Query');
    if (!columns || parameters === false) {
        return null;
    }
    const source: ExcelWorkbookSource = {
        Key: raw.Key as string,
        Kind: raw.Kind as ExcelSourceKind,
        ID: raw.ID as string,
        Name: raw.Name as string,
        SheetName: raw.SheetName as string,
        Columns: columns,
    };
    if (parameters) {
        source.Parameters = parameters;
    }
    return source;
}

function validateColumns(raw: unknown): ExcelSourceColumn[] | null {
    if (!Array.isArray(raw) || raw.length > MAX_COLUMNS) {
        return null;
    }
    const columns: ExcelSourceColumn[] = [];
    for (const c of raw) {
        if (!isRecord(c) || !isBoundedString(c.Name) || typeof c.Header !== 'string' || c.Header.length > MAX_NAME_LENGTH) {
            return null;
        }
        const dataType = COLUMN_DATA_TYPES.find(t => t === c.DataType) ?? 'Text';
        columns.push({ Name: c.Name, Header: c.Header, DataType: dataType });
    }
    return columns;
}

/** `undefined` = none given, `false` = invalid, otherwise the validated values. */
function validateParameters(raw: unknown, allowed: boolean): Record<string, ExcelParameterValue> | undefined | false {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (!allowed || !isRecord(raw)) {
        return false;
    }
    const result: Record<string, ExcelParameterValue> = {};
    for (const [name, value] of Object.entries(raw)) {
        if (!isBoundedString(name) || !isParameterValue(value)) {
            return false;
        }
        result[name] = value;
    }
    return result;
}

function isParameterValue(value: unknown): value is ExcelParameterValue {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'string') {
        return value.length <= EXCEL_MAX_CELL_LENGTH;
    }
    return Array.isArray(value) && value.every(v => typeof v === 'string' && v.length <= MAX_NAME_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number = MAX_NAME_LENGTH): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function hasUniqueValues(values: string[]): boolean {
    return new Set(values).size === values.length;
}
