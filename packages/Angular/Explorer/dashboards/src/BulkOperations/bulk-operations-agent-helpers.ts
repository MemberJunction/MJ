/**
 * @fileoverview Pure, framework-agnostic helpers for the Bulk Operations host components'
 * AI-agent client tools. Extracted so the ID-resolution and context-snapshot logic can be
 * unit-tested without instantiating the Angular hosts (which are thin ViewChild-bound wrappers
 * over the generic studio/history components).
 *
 * 🚨 SAFETY NOTE: these helpers only READ and VALIDATE. They perform no mutation, no run, and no
 * navigation — they exist purely to resolve a row from a loaded list and to shape a context object.
 */

import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';

/** Minimal shape needed to resolve a row by ID — any row exposing a string `ID`. */
export interface HasID {
    ID: string;
}

/**
 * Resolve a row from a loaded list by its (untrusted) ID parameter. Validates that the param is a
 * non-empty string, then matches case-insensitively (SQL Server returns UUIDs uppercase, PostgreSQL
 * lowercase). Returns the matched row, or a structured tolerant failure — never throws.
 *
 * @param rows - The currently loaded rows (e.g. studio.Processes or history.Runs).
 * @param rawID - The untrusted `processID` / `runID` tool parameter.
 * @param paramName - Name of the parameter, for clear error messages ('processID' | 'runID').
 * @param notFoundNoun - Human noun for the not-found message (e.g. 'bulk operation', 'bulk operation run').
 */
export function resolveRowByID<T extends HasID>(
    rows: readonly T[],
    rawID: unknown,
    paramName: string,
    notFoundNoun: string,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    const check = validateStringParam(rawID, paramName);
    if (!check.ok) {
        return check;
    }
    const id = check.value.trim();
    if (!id) {
        return { ok: false, result: { Success: false, ErrorMessage: `${paramName} must not be empty.` } };
    }
    const target = id.toLowerCase();
    const match = rows.find((r) => r.ID?.toLowerCase() === target);
    if (!match) {
        return { ok: false, result: { Success: false, ErrorMessage: `No ${notFoundNoun} found with ID "${id}".` } };
    }
    return { ok: true, value: match };
}

/** Read-only snapshot of the studio state the agent cares about. */
export interface StudioContextSnapshot {
    Mode: 'list' | 'edit';
    ProcessCount: number;
    FilteredCount: number;
    Search: string | null | undefined;
    EditingID: string | null | undefined;
    IsRunning: boolean;
}

/**
 * Shape the studio state into the agent-context object. Pure: takes a snapshot, returns the context
 * payload exactly as published via SetAgentContext.
 */
export function buildStudioAgentContext(s: StudioContextSnapshot): Record<string, unknown> {
    return {
        CurrentMode: s.Mode,
        ProcessCount: s.ProcessCount,
        FilteredProcessCount: s.FilteredCount,
        SearchQuery: s.Search ?? '',
        EditingProcessID: s.EditingID ?? null,
        IsRunning: s.IsRunning,
    };
}

/** Read-only snapshot of the run-history state the agent cares about. */
export interface HistoryContextSnapshot {
    Mode: 'list' | 'detail';
    RunCount: number;
    OpenRunID: string | null;
    OpenRunStatus: string | null;
    OpenRunIsDryRun: boolean | null;
}

/**
 * Shape the run-history state into the agent-context object. Pure: takes a snapshot, returns the
 * context payload exactly as published via SetAgentContext.
 */
export function buildHistoryAgentContext(h: HistoryContextSnapshot): Record<string, unknown> {
    return {
        IsViewingRunDetail: h.Mode === 'detail',
        RunCount: h.RunCount,
        OpenRunID: h.OpenRunID,
        OpenRunStatus: h.OpenRunStatus,
        OpenRunIsDryRun: h.OpenRunIsDryRun,
    };
}
