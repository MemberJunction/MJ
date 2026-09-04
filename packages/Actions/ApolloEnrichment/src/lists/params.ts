/**
 * Parameter parsing for the Apollo list and search actions.
 *
 * Pure functions over raw param values, with no framework imports, so every
 * action validates its inputs identically and the validation is testable without
 * constructing an action. They report problems as strings; the actions own the
 * `Success`/`ResultCode` shape.
 *
 * The permissiveness is deliberate. These actions are called from three places
 * that supply values in three different forms: an agent's input mapping passes a
 * real array, an LLM writing params passes a JSON string, and a human testing in
 * the UI types `owner, founder`. All three mean the same thing, so all three are
 * accepted — while genuinely malformed input still fails loudly rather than
 * silently becoming an empty filter, which on a people search is the difference
 * between a scoped query and an unscoped firehose.
 */
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

/** A parse result: a value, or an error explaining what the value should have been. */
export interface ParsedParam<T> {
    value: T | undefined;
    error: string | null;
}

/** Look up a param's raw value, unconverted. */
export function getParamRaw(params: RunActionParams, name: string): unknown {
    const lowered = name.trim().toLowerCase();
    const found = params.Params?.find((p: ActionParam) => p.Name?.trim().toLowerCase() === lowered);
    return found?.Value;
}

/**
 * Look up a param as a trimmed non-empty string, or null.
 *
 * Returns null for whitespace as well as for absent, so a required-field check
 * treats `'   '` the way the caller meant it rather than passing a blank list
 * name into a label lookup.
 */
export function getParam(params: RunActionParams, name: string): string | null {
    const raw = getParamRaw(params, name);
    if (typeof raw !== 'string') {
        return raw === null || raw === undefined ? null : String(raw).trim() || null;
    }
    return raw.trim() || null;
}

/**
 * Normalize an optional array-of-strings param. Accepts a real array, a JSON
 * array string, or a bare comma-separated string. Absent or empty yields
 * `undefined` with no error — "not supplied" is a valid state for every filter
 * that uses this.
 */
export function parseStringArrayParam(raw: unknown, name: string): ParsedParam<string[]> {
    if (raw === null || raw === undefined || raw === '') {
        return { value: undefined, error: null };
    }
    let value: unknown = raw;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('[')) {
            try {
                value = JSON.parse(trimmed);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                return { value: undefined, error: `${name} must be a JSON array of strings — got an unparseable string (${msg})` };
            }
        } else {
            // The comma-separated convenience form, e.g. "owner, founder".
            value = trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        }
    }
    if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
        return { value: undefined, error: `${name} must be a JSON array of strings (e.g. ["VP of Marketing"])` };
    }
    const cleaned = (value as string[]).map((s) => s.trim()).filter((s) => s.length > 0);
    return { value: cleaned.length > 0 ? cleaned : undefined, error: null };
}

/**
 * Normalize an optional integer param. Accepts a number or a numeric string.
 * Rejects non-integers rather than rounding: a page of 1.5 is a caller mistake,
 * and silently reading page 1 would return plausible wrong data.
 */
export function parseOptionalIntegerParam(
    raw: unknown,
    name: string,
    options?: { min?: number; max?: number },
): ParsedParam<number> {
    if (raw === null || raw === undefined || raw === '') {
        return { value: undefined, error: null };
    }
    let value: number;
    if (typeof raw === 'number') {
        value = raw;
    } else if (typeof raw === 'string') {
        value = Number(raw.trim());
    } else {
        return { value: undefined, error: `${name} must be a number (got ${typeof raw})` };
    }
    if (!Number.isInteger(value)) {
        return { value: undefined, error: `${name} must be an integer (got '${String(raw)}')` };
    }
    const min = options?.min;
    if (min !== undefined && value < min) {
        return { value: undefined, error: `${name} must be >= ${min} (got ${value})` };
    }
    const max = options?.max;
    if (max !== undefined && value > max) {
        return { value: undefined, error: `${name} must be <= ${max} (got ${value})` };
    }
    return { value, error: null };
}

/**
 * Normalize an optional boolean param. Accepts a real boolean or the strings
 * 'true'/'false', case-insensitive. Anything else is an error rather than a
 * truthiness coercion — `'false'` is truthy in JavaScript, and treating it as
 * `true` on a verify flag would be a silent, expensive surprise.
 */
export function parseOptionalBooleanParam(raw: unknown, name: string): ParsedParam<boolean> {
    if (raw === null || raw === undefined || raw === '') {
        return { value: undefined, error: null };
    }
    if (typeof raw === 'boolean') {
        return { value: raw, error: null };
    }
    if (typeof raw === 'string') {
        const lowered = raw.trim().toLowerCase();
        if (lowered === 'true') return { value: true, error: null };
        if (lowered === 'false') return { value: false, error: null };
    }
    return { value: undefined, error: `${name} must be a boolean (true or false) — got '${String(raw)}'` };
}

/**
 * The remediation tail appended whenever a list name does not resolve. Kept in
 * one place so every action points the caller at the same next step.
 */
export const LIST_NOT_FOUND_HINT =
    'Run the Apollo Get Lists action to see the exact label names this Apollo account has.';
