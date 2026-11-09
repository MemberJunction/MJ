/**
 * Pure helpers for reading action params. Names are matched case-insensitively, and array params
 * accept a real array, a JSON-array string, or a comma-separated string, like the Apollo actions.
 */
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

export interface ParsedParam<T> {
    value: T | undefined;
    error: string | null;
}

export function GetParamRaw(params: RunActionParams, name: string): unknown {
    const lowered = name.trim().toLowerCase();
    const found = params.Params?.find((p: ActionParam) => p.Name?.trim().toLowerCase() === lowered);
    return found?.Value;
}

export function GetParam(params: RunActionParams, name: string): string | null {
    const raw = GetParamRaw(params, name);
    if (typeof raw !== 'string') {
        return raw === null || raw === undefined ? null : String(raw).trim() || null;
    }
    return raw.trim() || null;
}

/** An object-array param: a real array, or a JSON string holding one. */
export function ParseObjectArrayParam(raw: unknown, name: string): ParsedParam<Record<string, unknown>[]> {
    if (raw === null || raw === undefined || raw === '') return { value: undefined, error: null };
    let value: unknown = raw;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { value: undefined, error: `${name} must be a JSON array of objects — got an unparseable string (${msg})` };
        }
    }
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
        return { value: undefined, error: `${name} must be a JSON array of objects` };
    }
    return { value: value as Record<string, unknown>[], error: null };
}

export function ParseOptionalIntegerParam(raw: unknown, name: string, options?: { min?: number; max?: number }): ParsedParam<number> {
    if (raw === null || raw === undefined || raw === '') return { value: undefined, error: null };
    let value: number;
    if (typeof raw === 'number') value = raw;
    else if (typeof raw === 'string') value = Number(raw.trim());
    else return { value: undefined, error: `${name} must be a number (got ${typeof raw})` };
    if (!Number.isInteger(value)) return { value: undefined, error: `${name} must be an integer (got '${String(raw)}')` };
    if (options?.min !== undefined && value < options.min) return { value: undefined, error: `${name} must be >= ${options.min} (got ${value})` };
    if (options?.max !== undefined && value > options.max) return { value: undefined, error: `${name} must be <= ${options.max} (got ${value})` };
    return { value, error: null };
}
