/**
 * @fileoverview Pure helpers for frozen data literal allow-lists, per-binding settle
 * values, and the `Data as of YYYY-MM-DD` provenance card (Plan §10.2, §10.4; VS-DAT-3).
 *
 * Uses `MJChartKit.FormatValue` and `FormatTableCell` directly so that allowed and
 * bound literals match the strings rendered by `MJChartKit` byte-for-byte.
 *
 * @module @memberjunction/video-studio-core
 */

import type { ChartKitColumn } from './chart-kit-types.js';
import { CreateMJChartKit, FormatTableCell } from './chart-kit.js';
import type { CheckRequest } from './render-contract.js';
import { ExtractNumericLiteralTokens } from './validate-spec.js';
import type {
    VideoDataBinding,
    VideoDataFormat,
    VideoGenerationSpec,
} from './video-generation-spec.js';

const CHART_KIT = CreateMJChartKit();

/**
 * Reserved key in `window.__MJ_DATA__` holding the formatted provenance end-card text
 * (`'Data as of YYYY-MM-DD'`). User `VideoDataBinding.Key` entries may not use this key.
 */
export const AS_OF_DATA_KEY = '__asOf';

const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const PURE_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalizes a valid ISO-8601 timestamp string or `Date` instance to the provenance
 * end-card text `'Data as of YYYY-MM-DD'` (UTC calendar date).
 *
 * Throws an `Error` if `asOf` is empty, not a string or `Date`, or cannot be parsed
 * as a valid calendar date.
 */
export function FormatAsOfCardText(asOf: string | Date): string {
    if (asOf instanceof Date) {
        const ms = asOf.getTime();
        if (!Number.isFinite(ms)) {
            throw new Error('FormatAsOfCardText requires a valid Date instance (got Invalid Date).');
        }
        return `Data as of ${CHART_KIT.FormatValue(ms, { Kind: 'Date' })}`;
    }

    if (typeof asOf !== 'string') {
        throw new Error('FormatAsOfCardText requires an ISO-8601 date string or Date instance.');
    }

    const trimmed = asOf.trim();
    if (!trimmed) {
        throw new Error('FormatAsOfCardText requires a non-empty ISO-8601 date string.');
    }

    const pureDateMatch = PURE_DATE_ONLY_REGEX.exec(trimmed);
    if (pureDateMatch) {
        const year = Number(pureDateMatch[1]);
        const month = Number(pureDateMatch[2]);
        const day = Number(pureDateMatch[3]);
        const utcMs = Date.UTC(year, month - 1, day);
        const check = new Date(utcMs);
        if (
            !Number.isFinite(utcMs) ||
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() + 1 !== month ||
            check.getUTCDate() !== day
        ) {
            throw new Error(`FormatAsOfCardText received an invalid calendar date "${asOf}".`);
        }
        return `Data as of ${CHART_KIT.FormatValue(utcMs, { Kind: 'Date' })}`;
    }

    const isoPrefixMatch = ISO_DATE_PREFIX_REGEX.exec(trimmed);
    const parsedMs = Date.parse(trimmed);
    if (!Number.isFinite(parsedMs)) {
        throw new Error(`FormatAsOfCardText could not parse "${asOf}" as a valid ISO-8601 date.`);
    }

    if (isoPrefixMatch) {
        const year = Number(isoPrefixMatch[1]);
        const month = Number(isoPrefixMatch[2]);
        const day = Number(isoPrefixMatch[3]);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() + 1 !== month ||
            check.getUTCDate() !== day
        ) {
            throw new Error(`FormatAsOfCardText received an invalid calendar date in "${asOf}".`);
        }
    }

    return `Data as of ${CHART_KIT.FormatValue(parsedMs, { Kind: 'Date' })}`;
}

/**
 * Returns a frozen render data snapshot cloning `values` and injecting
 * `[AS_OF_DATA_KEY]: FormatAsOfCardText(asOf)` for `window.__MJ_DATA__`.
 *
 * Throws an `Error` if `values` already defines the reserved `__asOf` key or if `asOf` is invalid.
 */
export function BuildRenderDataSnapshot(
    values: Record<string, unknown>,
    asOf: string | Date,
): Record<string, unknown> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('BuildRenderDataSnapshot requires a plain object of resolved binding values.');
    }
    if (Object.prototype.hasOwnProperty.call(values, AS_OF_DATA_KEY)) {
        throw new Error(
            `Data binding key "${AS_OF_DATA_KEY}" is reserved for the Video Studio provenance card.`,
        );
    }
    const asOfText = FormatAsOfCardText(asOf);
    return {
        ...values,
        [AS_OF_DATA_KEY]: asOfText,
    };
}

function addFormattedNumber(
    target: Set<string>,
    n: number,
    format: VideoDataFormat | undefined,
    includePlusVariant: boolean,
): void {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
        return;
    }
    const formatted = CHART_KIT.FormatValue(n, format);
    if (!formatted || formatted === 'n/a') {
        return;
    }
    target.add(formatted);
    if (
        includePlusVariant &&
        n > 0 &&
        /[1-9]/.test(formatted) &&
        !formatted.startsWith('+') &&
        !formatted.startsWith('-')
    ) {
        target.add(`+${formatted}`);
    }
}

function addTokensFromString(target: Set<string>, text: string): void {
    for (const token of ExtractNumericLiteralTokens(text)) {
        target.add(token);
    }
}

function isDeltaLikeObject(value: unknown): value is {
    Current?: unknown;
    Previous?: unknown;
    Change?: unknown;
    ChangePercent?: unknown;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const rec = value as Record<string, unknown>;
    return (
        typeof rec['Current'] === 'number' ||
        typeof rec['Previous'] === 'number' ||
        typeof rec['Change'] === 'number' ||
        typeof rec['ChangePercent'] === 'number'
    );
}

function collectDeltaLiterals(
    target: Set<string>,
    rawValue: unknown,
    format: VideoDataFormat | undefined,
): void {
    if (!isDeltaLikeObject(rawValue)) {
        collectGeneralLiterals(target, rawValue, format);
        return;
    }
    const fields: Array<'Current' | 'Previous' | 'Change'> = ['Current', 'Previous', 'Change'];
    for (const field of fields) {
        const v = rawValue[field];
        if (typeof v === 'number' && Number.isFinite(v)) {
            addFormattedNumber(target, v, format, true);
        } else if (typeof v === 'string') {
            addTokensFromString(target, v);
        }
    }

    const cp = rawValue.ChangePercent;
    if (typeof cp === 'number' && Number.isFinite(cp)) {
        const pctFormat: VideoDataFormat = {
            Kind: 'Percent',
            ...(format?.Decimals !== undefined ? { Decimals: format.Decimals } : {}),
        };
        addFormattedNumber(target, cp, pctFormat, true);
    } else if (typeof cp === 'string') {
        addTokensFromString(target, cp);
    }
}

function resolveColumnForField(
    columns: readonly ChartKitColumn[] | undefined,
    fieldKey: string,
    colIndex: number,
): ChartKitColumn | undefined {
    if (!columns || columns.length === 0) {
        return undefined;
    }
    const exact = columns.find((col) => col?.Header === fieldKey);
    if (exact) {
        return exact;
    }
    const lowerKey = fieldKey.toLowerCase();
    const caseInsensitive = columns.find((col) => col?.Header?.toLowerCase() === lowerKey);
    if (caseInsensitive) {
        return caseInsensitive;
    }
    return columns[colIndex];
}

function collectTableCellLiteral(
    target: Set<string>,
    cell: unknown,
    column: ChartKitColumn | undefined,
    fallbackFormat: VideoDataFormat | undefined,
): void {
    if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) {
            return;
        }
        const formatted = FormatTableCell(column, cell, fallbackFormat);
        if (formatted && formatted !== 'n/a') {
            target.add(formatted);
        }
        return;
    }
    if (typeof cell === 'string') {
        const formatted = FormatTableCell(column, cell, fallbackFormat);
        addTokensFromString(target, formatted);
    }
}

function collectTableLiterals(
    target: Set<string>,
    rawValue: unknown,
    binding: VideoDataBinding,
): void {
    let columns: readonly ChartKitColumn[] | undefined = binding.Columns;
    let rowsSource: unknown = rawValue;

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        const obj = rawValue as { Columns?: ChartKitColumn[]; Rows?: unknown };
        if (Array.isArray(obj.Columns) && (!columns || columns.length === 0)) {
            columns = obj.Columns;
        }
        if (Array.isArray(obj.Rows)) {
            rowsSource = obj.Rows;
        }
    }

    if (!Array.isArray(rowsSource)) {
        collectGeneralLiterals(target, rawValue, binding.Format);
        return;
    }

    for (const row of rowsSource) {
        if (Array.isArray(row)) {
            for (let c = 0; c < row.length; c++) {
                collectTableCellLiteral(target, row[c], columns?.[c], binding.Format);
            }
        } else if (row && typeof row === 'object') {
            const entries = Object.entries(row as Record<string, unknown>);
            for (let c = 0; c < entries.length; c++) {
                const [fieldKey, cellVal] = entries[c]!;
                const col = resolveColumnForField(columns, fieldKey, c);
                collectTableCellLiteral(target, cellVal, col, binding.Format);
            }
        } else {
            collectTableCellLiteral(target, row, columns?.[0], binding.Format);
        }
    }
}

function collectGeneralLiterals(
    target: Set<string>,
    value: unknown,
    format: VideoDataFormat | undefined,
): void {
    if (value === null || value === undefined || typeof value === 'boolean') {
        return;
    }
    if (typeof value === 'number') {
        addFormattedNumber(target, value, format, false);
        return;
    }
    if (typeof value === 'string') {
        addTokensFromString(target, value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectGeneralLiterals(target, item, format);
        }
        return;
    }
    if (typeof value === 'object') {
        for (const propVal of Object.values(value as Record<string, unknown>)) {
            collectGeneralLiterals(target, propVal, format);
        }
    }
}

/**
 * Walks each `VideoDataBinding` and its resolved value in `values` (`Scalar`, `Series`,
 * `Table`, `Delta`) and produces the deduplicated list of formatted strings that
 * `MJChartKit.FormatValue` (and `FormatTableCell` for per-column tables) produces for
 * every numeric leaf.
 *
 * Throws an `Error` if any binding uses the reserved `__asOf` key.
 */
export function BuildBoundDataLiterals(
    bindings: readonly VideoDataBinding[],
    values: Record<string, unknown>,
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const safeValues = values && typeof values === 'object' ? values : {};

    for (const binding of bindings ?? []) {
        if (!binding || typeof binding.Key !== 'string') {
            continue;
        }
        const key = binding.Key.trim();
        if (!key) {
            continue;
        }
        if (key === AS_OF_DATA_KEY) {
            throw new Error(
                `Data binding key "${AS_OF_DATA_KEY}" is reserved for the Video Studio provenance card.`,
            );
        }

        const literals = new Set<string>();
        if (Object.prototype.hasOwnProperty.call(safeValues, key)) {
            const rawValue = safeValues[key];
            if (binding.Shape === 'Delta') {
                collectDeltaLiterals(literals, rawValue, binding.Format);
            } else if (binding.Shape === 'Table') {
                collectTableLiterals(literals, rawValue, binding);
            } else {
                collectGeneralLiterals(literals, rawValue, binding.Format);
            }
        }
        result[key] = Array.from(literals);
    }

    return result;
}

/**
 * Builds the `CheckRequest` fields required to enforce data-literal accuracy and
 * provenance end-card visibility on a rendered composition:
 * - `BoundDataLiterals`: per-key allowed strings from {@link BuildBoundDataLiterals}
 * - `AllowedDataLiterals`: deduplicated union of all `BoundDataLiterals` arrays (`[]` when no bindings)
 * - `SampleTimestampsSeconds`: beat midpoints (`(StartSeconds + EndSeconds) / 2`)
 * - `SettleTimestampsSeconds`: beat settle frames (`Math.max(0, EndSeconds - 1 / fps)`)
 * - `RequiredFinalFrameText`: `[FormatAsOfCardText(spec.DataSnapshot.AsOf)]` when `DataBindings` is non-empty, else `[]`
 */
export function BuildDataCheckInputs(
    spec: Pick<VideoGenerationSpec, 'DataBindings' | 'DataSnapshot' | 'Beats' | 'Render'>,
    values: Record<string, unknown>,
): Pick<
    CheckRequest,
    | 'AllowedDataLiterals'
    | 'BoundDataLiterals'
    | 'SampleTimestampsSeconds'
    | 'SettleTimestampsSeconds'
    | 'RequiredFinalFrameText'
> {
    const bindings = Array.isArray(spec?.DataBindings) ? spec.DataBindings : [];
    const boundDataLiterals = BuildBoundDataLiterals(bindings, values);

    const allowedSet = new Set<string>();
    for (const list of Object.values(boundDataLiterals)) {
        for (const item of list) {
            allowedSet.add(item);
        }
    }

    const fps =
        typeof spec?.Render?.Fps === 'number' && Number.isFinite(spec.Render.Fps) && spec.Render.Fps > 0
            ? spec.Render.Fps
            : 30;
    const frameStep = 1 / fps;

    const sampleTimestamps: number[] = [];
    const settleTimestamps: number[] = [];
    for (const beat of Array.isArray(spec?.Beats) ? spec.Beats : []) {
        if (
            beat &&
            typeof beat.StartSeconds === 'number' &&
            Number.isFinite(beat.StartSeconds) &&
            typeof beat.EndSeconds === 'number' &&
            Number.isFinite(beat.EndSeconds)
        ) {
            sampleTimestamps.push((beat.StartSeconds + beat.EndSeconds) / 2);
            settleTimestamps.push(Math.max(0, beat.EndSeconds - frameStep));
        }
    }

    const requiredFinalFrameText: string[] = [];
    if (bindings.length > 0 && spec?.DataSnapshot?.AsOf?.trim()) {
        requiredFinalFrameText.push(FormatAsOfCardText(spec.DataSnapshot.AsOf));
    }

    return {
        AllowedDataLiterals: Array.from(allowedSet),
        BoundDataLiterals: boundDataLiterals,
        SampleTimestampsSeconds: sampleTimestamps,
        SettleTimestampsSeconds: settleTimestamps,
        RequiredFinalFrameText: requiredFinalFrameText,
    };
}
