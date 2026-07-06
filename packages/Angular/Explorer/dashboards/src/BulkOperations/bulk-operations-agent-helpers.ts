/**
 * @fileoverview Pure, framework-agnostic helpers for the Bulk Operations host components'
 * AI-agent client tools. Extracted so the ID/name-resolution and context-snapshot logic can be
 * unit-tested without instantiating the Angular hosts (which are thin ViewChild-bound wrappers
 * over the generic studio/history components).
 *
 * These helpers bring the surface to Data-Explorer depth: name resolution (exact ID → exact name →
 * partial-name contains), bounded name lists with companion counts, and deep per-surface context
 * (process names + entity/status/work-type for Operations; run summaries with status + DryRun flags
 * for Run History).
 *
 * 🚨 SAFETY NOTE: these helpers only READ, VALIDATE, and RESOLVE. They perform no mutation, no run,
 * and no navigation — they exist purely to resolve a row from a loaded list and to shape a context
 * object. The dry-run-only boundary lives in the host components; nothing here can apply changes.
 */

import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';

/** Minimal shape needed to resolve a row by ID — any row exposing a string `ID`. */
export interface HasID {
    ID: string;
}

/**
 * Default upper bound on how many names a Bulk Operations surface publishes in a name-list context
 * field (e.g. visible process names, run summaries). Keeping the streamed note bounded avoids
 * flooding the co-agent with hundreds of entries; surfaces publish a companion total-count field so
 * the agent still knows the true size when the list is truncated. Mirrors the cap used across the
 * other Data-Explorer-depth surfaces (Actions, Lists, Communication, Data Explorer).
 */
export const AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to at most `cap` entries. Pure + deterministic so the published context
 * shape stays unit-testable. Never throws; never mutates the input (returns a new array).
 *
 * @param names - the full list of names (the caller owns de-duplication / ordering)
 * @param cap - maximum entries to keep (defaults to {@link AGENT_CONTEXT_NAME_LIST_CAP})
 */
export function capNames(names: readonly string[], cap: number = AGENT_CONTEXT_NAME_LIST_CAP): string[] {
    const safeCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : AGENT_CONTEXT_NAME_LIST_CAP;
    return names.slice(0, safeCap);
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

/**
 * Resolve a row from a loaded list by an (untrusted) ID-OR-NAME reference, the way a user names
 * things. Tries, in order, against the supplied rows:
 *   1. exact ID match (case-insensitive — SQL Server upper vs PostgreSQL lower)
 *   2. exact name match (case-insensitive), via the supplied `nameOf` accessor
 *   3. partial-name *contains* match (case-insensitive) — first one wins
 *
 * On a miss, returns a tolerant structured failure that lists a bounded sample of the available
 * names so the agent can correct itself. Pure + deterministic over the supplied rows; never throws.
 *
 * @param rows - the currently loaded rows
 * @param rawRef - the untrusted reference (an ID or a name the agent passed)
 * @param paramName - the parameter name, for clear validation error messages
 * @param notFoundNoun - human noun for the not-found message (e.g. 'bulk operation')
 * @param nameOf - accessor that yields the display name for a row (Process.Name / Run.ProcessName)
 */
export function resolveRowByIDOrName<T extends HasID>(
    rows: readonly T[],
    rawRef: unknown,
    paramName: string,
    notFoundNoun: string,
    nameOf: (row: T) => string,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    const check = validateStringParam(rawRef, paramName);
    if (!check.ok) {
        return check;
    }
    const ref = check.value.trim();
    if (!ref) {
        return { ok: false, result: { Success: false, ErrorMessage: `${paramName} must not be empty.` } };
    }
    const needle = ref.toLowerCase();

    // 1. exact ID
    const byID = rows.find((r) => r.ID?.toLowerCase() === needle);
    if (byID) {
        return { ok: true, value: byID };
    }
    // 2. exact name
    const byExactName = rows.find((r) => nameOf(r)?.toLowerCase() === needle);
    if (byExactName) {
        return { ok: true, value: byExactName };
    }
    // 3. partial-name contains
    const byContains = rows.find((r) => nameOf(r)?.toLowerCase().includes(needle));
    if (byContains) {
        return { ok: true, value: byContains };
    }

    const sample = capNames(rows.map((r) => nameOf(r)).filter((n) => !!n)).join(', ');
    const available = sample ? ` Available ${notFoundNoun}s include: ${sample}.` : '';
    return {
        ok: false,
        result: { Success: false, ErrorMessage: `No ${notFoundNoun} found matching "${ref}".${available}` },
    };
}

/** A read-only projection of one process row the agent context cares about. */
export interface ProcessSummaryInput {
    ID: string;
    Name: string;
    Entity?: string;
    Status?: string;
    WorkType?: string;
    ScopeType?: string;
}

/** Read-only snapshot of the studio state the agent cares about (deep, Data-Explorer depth). */
export interface StudioContextSnapshot {
    Mode: 'list' | 'edit';
    /** Total processes loaded (unfiltered). */
    ProcessCount: number;
    /** Process rows after the current search filter (the ones the user sees). */
    Filtered: readonly ProcessSummaryInput[];
    Search: string | null | undefined;
    EditingID: string | null | undefined;
    IsRunning: boolean;
}

/**
 * Shape the studio state into the agent-context object. Pure: takes a snapshot, returns the context
 * payload exactly as published via SetAgentContext.
 *
 * Deep fields: the FILTERED (visible) process count, a bounded list of visible process names (with a
 * companion total when truncated), and — when the editor is open on an existing process — the editing
 * process's resolved Name / Entity / WorkType so the agent can refer to it by name rather than GUID.
 */
export function buildStudioAgentContext(s: StudioContextSnapshot): Record<string, unknown> {
    const visibleNames = s.Filtered.map((p) => p.Name).filter((n) => !!n);
    const editing = s.EditingID
        ? s.Filtered.find((p) => p.ID?.toLowerCase() === s.EditingID?.toLowerCase())
        : undefined;

    const context: Record<string, unknown> = {
        CurrentMode: s.Mode,
        ProcessCount: s.ProcessCount,
        FilteredProcessCount: s.Filtered.length,
        SearchQuery: s.Search ?? '',
        EditingProcessID: s.EditingID ?? null,
        IsRunning: s.IsRunning,
        VisibleProcessNames: capNames(visibleNames),
    };
    if (visibleNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        context['VisibleProcessNameCount'] = visibleNames.length;
    }
    // When the editor is open on a known existing process, surface its name + targets.
    if (s.EditingID) {
        context['EditingProcessName'] = editing?.Name ?? null;
        if (editing?.Entity) {
            context['EditingProcessEntity'] = editing.Entity;
        }
        if (editing?.WorkType) {
            context['EditingProcessWorkType'] = editing.WorkType;
        }
    }
    return context;
}

/** A read-only projection of one run row the agent context cares about. */
export interface RunSummaryInput {
    ID: string;
    ProcessName?: string;
    EntityName?: string;
    Status?: string;
    DryRun?: boolean;
}

/** Read-only snapshot of the run-history state the agent cares about (deep, Data-Explorer depth). */
export interface HistoryContextSnapshot {
    Mode: 'list' | 'detail';
    /** All run rows loaded (most-recent-first, as the history component lists them). */
    Runs: readonly RunSummaryInput[];
    OpenRunID: string | null;
    OpenRunStatus: string | null;
    OpenRunIsDryRun: boolean | null;
    OpenRunProcessName: string | null;
}

/**
 * Shape the run-history state into the agent-context object. Pure: takes a snapshot, returns the
 * context payload exactly as published via SetAgentContext.
 *
 * Deep fields: a bounded list of recent run summaries (process name · status · DryRun flag) so the
 * agent can reason about what ran and whether it was a preview; the distinct status set; the count of
 * dry-run vs real runs; and — when drilled into a detail — the open run's resolved process name.
 */
export function buildHistoryAgentContext(h: HistoryContextSnapshot): Record<string, unknown> {
    const summaries = h.Runs.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map((r) => ({
        ID: r.ID,
        ProcessName: r.ProcessName ?? null,
        Status: r.Status ?? null,
        DryRun: r.DryRun ?? null,
    }));
    const distinctStatuses = Array.from(
        new Set(h.Runs.map((r) => r.Status).filter((st): st is string => !!st)),
    );
    const dryRunCount = h.Runs.filter((r) => r.DryRun === true).length;

    const context: Record<string, unknown> = {
        IsViewingRunDetail: h.Mode === 'detail',
        RunCount: h.Runs.length,
        OpenRunID: h.OpenRunID,
        OpenRunStatus: h.OpenRunStatus,
        OpenRunIsDryRun: h.OpenRunIsDryRun,
        OpenRunProcessName: h.OpenRunProcessName,
        RecentRuns: summaries,
        RunStatuses: distinctStatuses,
        DryRunCount: dryRunCount,
        RealRunCount: h.Runs.length - dryRunCount,
    };
    if (h.Runs.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        context['RecentRunCount'] = h.Runs.length;
    }
    return context;
}
