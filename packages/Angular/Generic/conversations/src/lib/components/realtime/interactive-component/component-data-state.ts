/**
 * @fileoverview Bounds a component's data state before it is described to the model.
 *
 * A component's `getCurrentDataState()` can hold thousands of rows. A perception note that carried them all
 * would flood the model's context and, when the component shows private data, leak far more than the model
 * needs to answer "what is the user looking at". This turns an arbitrary data state into a small JSON summary:
 * the per-table row count and columns always, and only the first `MaxRows` rows; long strings are clipped;
 * the whole thing is held under a character budget.
 *
 * The input is whatever the component returned, so it is treated as untrusted: it may be cyclic, hold functions,
 * dates or class instances. The output is always plain JSON.
 *
 * @module @memberjunction/ng-conversations
 */

import type { JSONObject, JSONValue } from '@memberjunction/ai';

/** Limits applied to a data state. */
export interface DataStateLimits {
    /** The most rows kept per table. */
    MaxRows: number;
    /** The most characters of the serialized summary; beyond it rows are dropped until it fits. */
    MaxChars: number;
}

/** The deepest nesting kept; deeper values are replaced by a marker. */
const MAX_DEPTH = 5;
/** The longest string kept before it is clipped. */
const MAX_STRING_CHARS = 200;
/** The most keys kept per object or items per non-table array. */
const MAX_BREADTH = 30;
/** The most columns listed per table. */
const MAX_COLUMNS = 40;

/** Marker for a value the summary could not or would not carry. */
const OMITTED = '[omitted]';

/** True for a non-null object that is not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts one arbitrary value into JSON, bounded in depth, breadth and string length.
 * Functions and symbols become a marker, dates their ISO string, cycles a marker.
 */
export function ToBoundedJson(value: unknown, depth: number = 0, seen: WeakSet<object> = new WeakSet()): JSONValue {
    if (value === null || value === undefined) {
        return null;
    }
    switch (typeof value) {
        case 'string':
            return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}… (${value.length} chars)` : value;
        case 'number':
            return Number.isFinite(value) ? value : null;
        case 'boolean':
            return value;
        case 'bigint':
            return value.toString();
        case 'function':
        case 'symbol':
            return OMITTED;
        default:
            break;
    }
    return objectToBoundedJson(value as object, depth, seen);
}

/** The object half of {@link ToBoundedJson}. */
function objectToBoundedJson(value: object, depth: number, seen: WeakSet<object>): JSONValue {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (seen.has(value)) {
        return '[circular]';
    }
    if (depth >= MAX_DEPTH) {
        return '[too deep]';
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const items = value.slice(0, MAX_BREADTH).map((item) => ToBoundedJson(item, depth + 1, seen));
            return value.length > MAX_BREADTH ? [...items, `… ${value.length - MAX_BREADTH} more`] : items;
        }
        const out: JSONObject = {};
        for (const key of Object.keys(value).slice(0, MAX_BREADTH)) {
            out[key] = ToBoundedJson((value as Record<string, unknown>)[key], depth + 1, seen);
        }
        return out;
    } finally {
        seen.delete(value);
    }
}

/** Summarizes one table-shaped entry (`{ name, columns, rows }`). */
function summarizeTable(table: unknown, index: number, maxRows: number): JSONObject {
    if (!isRecord(table)) {
        return { name: `table ${index + 1}`, rowCount: 0 };
    }
    const rows = Array.isArray(table['rows']) ? (table['rows'] as unknown[]) : [];
    const columns = Array.isArray(table['columns']) ? (table['columns'] as unknown[]) : [];
    const columnNames = columns
        .map((column) => (typeof column === 'string' ? column : isRecord(column) && typeof column['name'] === 'string' ? column['name'] : null))
        .filter((name): name is string => name !== null)
        .slice(0, MAX_COLUMNS);
    const summary: JSONObject = {
        name: typeof table['name'] === 'string' ? table['name'] : `table ${index + 1}`,
        rowCount: rows.length,
        columns: columnNames,
        rows: rows.slice(0, maxRows).map((row) => ToBoundedJson(row, 1)),
    };
    if (rows.length > maxRows) {
        summary['rowsOmitted'] = rows.length - maxRows;
    }
    return summary;
}

/** Builds the summary with at most `maxRows` rows per table. */
function buildSummary(state: Record<string, unknown>, maxRows: number): JSONObject {
    const summary: JSONObject = {};
    for (const key of ['title', 'activeTab', 'searchText', 'interpretation'] as const) {
        const value = state[key];
        if (typeof value === 'string' && value.length > 0) {
            summary[key] = ToBoundedJson(value);
        }
    }
    if (Array.isArray(state['drillPath']) && state['drillPath'].length > 0) {
        summary['drillPath'] = ToBoundedJson(state['drillPath']);
    }
    if (Array.isArray(state['tables'])) {
        summary['tables'] = (state['tables'] as unknown[]).slice(0, MAX_BREADTH).map((table, i) => summarizeTable(table, i, maxRows));
    }
    if (isRecord(state['custom']) && Object.keys(state['custom']).length > 0) {
        summary['custom'] = ToBoundedJson(state['custom']);
    }
    return summary;
}

/**
 * Summarizes a component's data state for the model.
 *
 * The result is plain JSON no larger than `limits.MaxChars`: when the first attempt is over budget the per-table
 * row cap is halved until it fits, down to zero rows (counts and columns only).
 *
 * @param state The value `getCurrentDataState()` returned (a `DataSnapshot` or anything else), or nothing.
 * @param limits The row and size caps.
 * @returns The summary, or `null` when the component has no data state.
 */
export function SummarizeDataState(state: object | null | undefined, limits: DataStateLimits): JSONObject | null {
    if (!isRecord(state)) {
        return null;
    }
    let rows = Math.max(0, Math.floor(limits.MaxRows));
    let summary = buildSummary(state, rows);
    while (rows > 0 && JSON.stringify(summary).length > limits.MaxChars) {
        rows = Math.floor(rows / 2);
        summary = buildSummary(state, rows);
    }
    if (JSON.stringify(summary).length > limits.MaxChars) {
        return { truncated: true, note: `The data state is larger than ${limits.MaxChars} characters; ask for specifics.` };
    }
    return summary;
}
