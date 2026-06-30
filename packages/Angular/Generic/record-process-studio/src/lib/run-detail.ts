/**
 * @fileoverview Pure helpers for reading a Process Run Detail's persisted result payload (the per-record
 * field diff) and rendering values. Extracted from the history component so the audit-diff logic is
 * unit-testable without a TestBed.
 * @module @memberjunction/ng-record-process-studio
 */

/** One computed field change, as persisted on `MJ: Process Run Details.ResultPayload`. */
export interface RunDetailChange {
    Field: string;
    OldValue: unknown;
    NewValue: unknown;
    Applied: boolean;
    Changed: boolean;
    Error?: string;
}

/** The JSON shape persisted for a FieldRules run detail. */
interface RunDetailPayload {
    DryRun: boolean;
    Changes: RunDetailChange[];
    ChangedFields: string[];
}

/**
 * Parses a Process Run Detail's `ResultPayload` and returns only the changes that were actually applied
 * (condition passed, value differed, no error). Safe on null/empty/invalid JSON — returns `[]`.
 */
export function parseAppliedRunDetailChanges(resultPayload: string | null | undefined): RunDetailChange[] {
    if (!resultPayload) {
        return [];
    }
    let payload: RunDetailPayload | undefined;
    try {
        payload = JSON.parse(resultPayload) as RunDetailPayload;
    } catch {
        return [];
    }
    return (payload?.Changes ?? []).filter((c) => c.Applied && c.Changed && !c.Error);
}

/** Renders an arbitrary value for the audit diff table. */
export function displayRunValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
        return '(empty)';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}
