/**
 * @fileoverview Pure, framework-agnostic helpers shared by the Actions
 * dashboard's AI-agent client-tool handlers (Overview / Explorer / Monitor).
 *
 * 🚨 SAFETY NOTE: nothing in this file mutates data or has side effects. These
 * helpers only validate / resolve tool input so every Actions client-tool
 * Handler can be tolerant (return a typed failure rather than throw). The
 * Actions app intentionally exposes only FIND / FILTER / NAVIGATE operations to
 * the agent — never action EXECUTION (see the SAFETY BOUNDARY comment in each
 * component).
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
