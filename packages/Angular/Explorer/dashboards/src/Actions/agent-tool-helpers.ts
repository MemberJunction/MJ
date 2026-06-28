/**
 * @fileoverview Pure, framework-agnostic helpers shared by the Actions
 * dashboard's AI-agent client-tool handlers (Overview / Explorer / Monitor).
 *
 * 🚨 SAFETY NOTE: nothing in this file mutates data or has side effects. These
 * helpers only validate / resolve tool input so every Actions client-tool
 * Handler can be tolerant (return a typed failure rather than throw). The
 * Actions app intentionally exposes only FIND / FILTER / SORT / NAVIGATE / SELECT
 * operations to the agent — never action EXECUTION (see the SAFETY BOUNDARY
 * comment in each component).
 */

import type { AgentToolResult } from '../shared/agent-tool-validation';

/**
 * Resolve a record from a loaded collection by its `ID`, returning the matched
 * record on success or a typed failure result when the id is missing / unknown.
 * Never throws. Used by the "open record" navigation tools so the agent gets a
 * structured error instead of a silent no-op for a bad id.
 *
 * @param rawId - The untrusted id parameter (may be undefined / non-string).
 * @param collection - The loaded records to search (each must expose `ID`).
 * @param entityLabel - Human label for the error message (e.g. "action").
 */
export function findByIdOrError<T extends { ID: string }>(
    rawId: unknown,
    collection: readonly T[],
    entityLabel: string,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    if (typeof rawId !== 'string' || rawId.trim() === '') {
        return { ok: false, result: { Success: false, ErrorMessage: `A non-empty ${entityLabel} id is required.` } };
    }
    const target = rawId.trim().toLowerCase();
    const match = collection.find(r => (r.ID ?? '').toLowerCase() === target);
    if (!match) {
        return { ok: false, result: { Success: false, ErrorMessage: `No ${entityLabel} found with id "${rawId}".` } };
    }
    return { ok: true, value: match };
}

/**
 * Resolve a record from a loaded collection by its `Name`, case-insensitively:
 * an exact match wins; failing that, the first *contains* match. On a miss the
 * typed failure result lists a sample of the available names so the agent can
 * correct itself. Never throws.
 *
 * This is the "select by name" affordance the agent uses when the user refers to
 * an item by what they see on screen ("open the Send Email action") rather than
 * by id. It mirrors the Data Explorer's `resolveRecordByName` resolution order.
 *
 * @param rawName - The untrusted name parameter (may be undefined / non-string).
 * @param collection - The loaded records to search (each must expose `Name`).
 * @param entityLabel - Human label for the error message (e.g. "action").
 * @param sampleCap - How many names to surface in the not-found message (default 8).
 */
export function findByNameOrError<T extends { Name: string }>(
    rawName: unknown,
    collection: readonly T[],
    entityLabel: string,
    sampleCap = 8,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    if (typeof rawName !== 'string' || rawName.trim() === '') {
        return { ok: false, result: { Success: false, ErrorMessage: `A non-empty ${entityLabel} name is required.` } };
    }
    const needle = rawName.trim().toLowerCase();
    const exact = collection.find(r => (r.Name ?? '').toLowerCase() === needle);
    if (exact) {
        return { ok: true, value: exact };
    }
    const contains = collection.find(r => (r.Name ?? '').toLowerCase().includes(needle));
    if (contains) {
        return { ok: true, value: contains };
    }
    const sample = collection.slice(0, sampleCap).map(r => r.Name).filter(n => !!n).join(', ');
    const suffix = sample ? ` Available ${entityLabel}s include: ${sample}.` : '';
    return { ok: false, result: { Success: false, ErrorMessage: `No ${entityLabel} found matching "${rawName}".${suffix}` } };
}

/**
 * Resolve a record by EITHER an exact id OR a case-insensitive name (id wins when
 * it resolves; otherwise falls back to name resolution). Lets a single tool accept
 * whichever identifier the agent has on hand. Never throws.
 *
 * @param rawValue - The untrusted identifier (treated first as an id, then a name).
 * @param collection - The loaded records to search (each must expose `ID` and `Name`).
 * @param entityLabel - Human label for the error message (e.g. "action").
 */
export function findByIdOrNameOrError<T extends { ID: string; Name: string }>(
    rawValue: unknown,
    collection: readonly T[],
    entityLabel: string,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return { ok: false, result: { Success: false, ErrorMessage: `A non-empty ${entityLabel} id or name is required.` } };
    }
    const byId = findByIdOrError(rawValue, collection, entityLabel);
    if (byId.ok) {
        return byId;
    }
    return findByNameOrError(rawValue, collection, entityLabel);
}
