import type { RunActionParams } from '@memberjunction/actions-base';
import type { ConceptMatch, GraphEndpointInput } from '@memberjunction/core-entities';
import { IsPlainObject } from '@memberjunction/global';

/**
 * Parameter helpers shared by the semantic-graph actions (`Get Graph Context`, `Find Graph Path`,
 * `Propose Canon Domains`). Agents pass values in many shapes (native arrays, JSON strings,
 * comma-separated lists, either key casing), so the parsing lives here once.
 */

/** The raw value of the parameter `name` (case-insensitive), or `undefined`. */
export function GetGraphActionParam(params: RunActionParams, name: string): unknown {
    const lower = name.trim().toLowerCase();
    return params.Params?.find((p) => p.Name.trim().toLowerCase() === lower)?.Value;
}

/** The parameter as a trimmed string, or `undefined` when absent or blank. */
export function GetGraphActionString(params: RunActionParams, name: string): string | undefined {
    const value = GetGraphActionParam(params, name);
    const text = value != null ? String(value).trim() : '';
    return text.length > 0 ? text : undefined;
}

/** The parameter as a finite number, else `defaultValue`. */
export function GetGraphActionNumber(params: RunActionParams, name: string, defaultValue: number): number {
    const value = GetGraphActionParam(params, name);
    const num = value != null && value !== '' ? Number(value) : NaN;
    return Number.isFinite(num) ? num : defaultValue;
}

/** The parameter as a boolean (`true`/`1`/`yes`, `false`/`0`/`no`), else `defaultValue`. */
export function GetGraphActionBoolean(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const value = GetGraphActionParam(params, name);
    if (typeof value === 'boolean') {
        return value;
    }
    const text = value != null ? String(value).trim().toLowerCase() : '';
    if (text === 'true' || text === '1' || text === 'yes') {
        return true;
    }
    if (text === 'false' || text === '0' || text === 'no') {
        return false;
    }
    return defaultValue;
}

/** An optional weight in `[0, 1]`, or `undefined` when absent or not a number. */
export function GetGraphActionWeight(params: RunActionParams, name: string): number | undefined {
    const value = GetGraphActionParam(params, name);
    const num = value != null && value !== '' ? Number(value) : NaN;
    return Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : undefined;
}

/**
 * A list of strings from a native array, a JSON array string, or a comma-separated string.
 * `undefined` when the value is absent or yields nothing.
 */
export function ParseGraphActionStringList(raw: unknown): string[] | undefined {
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
        items = raw;
    } else if (typeof raw === 'string' && raw.trim()) {
        const trimmed = raw.trim();
        items = trimmed.startsWith('[') ? parseJsonArray(trimmed) ?? trimmed.split(',') : trimmed.split(',');
    }
    const list = items.map((x) => String(x).trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
}

/**
 * A list of seed-like items (strings or objects) from a native array, a JSON string (array or
 * single object), a single object, or a comma-separated string.
 */
export function ParseGraphActionItemList(raw: unknown): unknown[] {
    if (raw == null) {
        return [];
    }
    if (Array.isArray(raw)) {
        return raw;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return [];
        }
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return [trimmed]; // not JSON after all: treat the whole text as one concept name
            }
        }
        return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return typeof raw === 'object' ? [raw] : [];
}

/**
 * A record reference `{ EntityName, RecordID }` (either key casing) from a plain object, or
 * `undefined` when the object does not carry both.
 */
export function ParseGraphRecordRef(item: unknown): { EntityName: string; RecordID: string; EntityID?: string } | undefined {
    if (!IsPlainObject(item)) {
        return undefined;
    }
    const entityName = readText(item, 'EntityName', 'entityName');
    const recordId = readText(item, 'RecordID', 'recordId');
    if (!entityName || !recordId) {
        return undefined;
    }
    const entityId = typeof item['EntityID'] === 'string' ? item['EntityID'] : undefined;
    return { EntityName: entityName, RecordID: recordId, EntityID: entityId };
}

/**
 * One end of a path from an action parameter: a record object, a JSON string of one, a concept
 * object (`{ Concept }`), or plain text naming a concept (its name, a synonym, or its ID).
 */
export function ParseGraphEndpoint(raw: unknown): GraphEndpointInput | undefined {
    if (typeof raw === 'string' && !raw.trim().startsWith('{')) {
        return raw.trim() ? { Concept: raw.trim() } : undefined; // plain text names one concept, commas and all
    }
    const item = ParseGraphActionItemList(raw)[0];
    if (typeof item === 'string') {
        return item.trim() ? { Concept: item.trim() } : undefined;
    }
    const record = ParseGraphRecordRef(item);
    if (record) {
        return { EntityName: record.EntityName, RecordID: record.RecordID };
    }
    if (IsPlainObject(item)) {
        const concept = readText(item, 'Concept', 'concept');
        return concept ? { Concept: concept } : undefined;
    }
    return undefined;
}

/** Ambiguous concept candidates as plain rows an agent can read and pick from. */
export function DescribeConceptCandidates(candidates: readonly ConceptMatch[]): Array<{ Name: string; RecordID: string; Description: string | null; Score: number }> {
    return candidates.map((c) => ({ Name: c.Node.Label, RecordID: c.Node.RecordID, Description: c.Node.Description, Score: c.Score }));
}

/** Set (or replace) the output parameter `name`. */
export function SetGraphActionOutput(params: RunActionParams, name: string, value: unknown): void {
    if (!params.Params) {
        return;
    }
    const lower = name.trim().toLowerCase();
    const existing = params.Params.find((p) => p.Name.trim().toLowerCase() === lower && p.Type === 'Output');
    if (existing) {
        existing.Value = value;
    } else {
        params.Params.push({ Name: name, Value: value, Type: 'Output' });
    }
}

function parseJsonArray(text: string): unknown[] | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : undefined;
    } catch {
        return undefined; // caller falls back to a comma split
    }
}

function readText(item: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
        const value = item[key];
        if (value != null && String(value).trim()) {
            return String(value).trim();
        }
    }
    return '';
}
