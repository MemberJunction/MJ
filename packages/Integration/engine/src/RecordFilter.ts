/**
 * Record-level filter for a pull entity map.
 *
 * A field map's `OnError: 'Skip'` drops one FIELD; nothing let an entity map drop a whole source
 * RECORD. Some source rows have no place in the target at all — Business Central's G/L accounts of
 * type Heading / Total / Begin-Total / End-Total are presentation rows, not postable accounts — and
 * without a filter every one of them reaches the write and fails a NOT NULL or CHECK constraint.
 *
 * Declared on the entity map's `Configuration` JSON, evaluated against the source record's own
 * top-level field names (before field mapping and before nested-object flattening):
 *
 * ```json
 * { "recordFilter": [ { "field": "accountType", "notIn": ["Heading", "Total", "Begin-Total", "End-Total"] } ] }
 * ```
 *
 * Every condition must hold for a record to be kept. Values compare as strings, exactly. A record the
 * filter excludes is counted as skipped, never errored, and is still seen by orphan detection, so a
 * row synced before the filter existed is left in place rather than deleted. Deletes are never
 * filtered: a deleted record often carries no fields, and dropping it would leave its MJ row behind.
 */
import type { ExternalRecord } from './types.js';

/** The entity map `Configuration` key that holds the filter. */
export const RECORD_FILTER_CONFIG_KEY = 'recordFilter';

/** One condition on a source field. Exactly one of `in` / `notIn` is set. */
export interface RecordFilterCondition {
    /** Source field name, as the connector returns it. */
    Field: string;
    /** Keep the record only when the field's value is one of these. */
    In?: ReadonlySet<string>;
    /** Keep the record only when the field's value is none of these. */
    NotIn?: ReadonlySet<string>;
}

/** A parsed filter, or the reasons it could not be parsed. */
export interface ParsedRecordFilter {
    Conditions: RecordFilterCondition[];
    Problems: string[];
}

/** Records split by the filter. */
export interface RecordFilterResult {
    Kept: ExternalRecord[];
    Excluded: number;
}

/**
 * Reads `recordFilter` from an entity map's parsed Configuration. Absent means no filter. A filter
 * that is present but malformed returns its problems, and the caller fails the map: syncing every
 * record because a filter could not be read would write exactly the rows it was meant to keep out.
 */
export function ParseRecordFilter(config: Record<string, unknown> | null | undefined): ParsedRecordFilter {
    const raw = config?.[RECORD_FILTER_CONFIG_KEY];
    if (raw === undefined || raw === null) return { Conditions: [], Problems: [] };
    if (!Array.isArray(raw)) {
        return { Conditions: [], Problems: [`${RECORD_FILTER_CONFIG_KEY} must be an array of conditions.`] };
    }
    const conditions: RecordFilterCondition[] = [];
    const problems: string[] = [];
    raw.forEach((item: unknown, i: number) => {
        const parsed = parseCondition(item, i);
        if (typeof parsed === 'string') problems.push(parsed);
        else conditions.push(parsed);
    });
    return { Conditions: conditions, Problems: problems };
}

function parseCondition(item: unknown, index: number): RecordFilterCondition | string {
    const where = `${RECORD_FILTER_CONFIG_KEY}[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `${where} must be an object.`;
    const cond = item as { field?: unknown; in?: unknown; notIn?: unknown };
    if (typeof cond.field !== 'string' || cond.field.trim() === '') return `${where}.field must be a non-empty string.`;
    const hasIn = cond.in !== undefined;
    const hasNotIn = cond.notIn !== undefined;
    if (hasIn === hasNotIn) return `${where} must set exactly one of "in" or "notIn".`;
    const list = hasIn ? cond.in : cond.notIn;
    if (!Array.isArray(list) || list.length === 0) return `${where}.${hasIn ? 'in' : 'notIn'} must be a non-empty array.`;
    const values = new Set(list.map(v => String(v)));
    return hasIn ? { Field: cond.field, In: values } : { Field: cond.field, NotIn: values };
}

/** Whether one record passes every condition. A missing or null value is never "in" a list. */
export function RecordPassesFilter(record: ExternalRecord, conditions: readonly RecordFilterCondition[]): boolean {
    if (record.IsDeleted) return true;
    for (const c of conditions) {
        const value = record.Fields[c.Field];
        const text = value === undefined || value === null ? null : String(value);
        if (c.In && (text === null || !c.In.has(text))) return false;
        if (c.NotIn && text !== null && c.NotIn.has(text)) return false;
    }
    return true;
}

/** Splits a batch by the filter. Returns the input array untouched when there are no conditions. */
export function ApplyRecordFilter(records: ExternalRecord[], conditions: readonly RecordFilterCondition[]): RecordFilterResult {
    if (conditions.length === 0) return { Kept: records, Excluded: 0 };
    const kept = records.filter(r => RecordPassesFilter(r, conditions));
    return { Kept: kept, Excluded: records.length - kept.length };
}
