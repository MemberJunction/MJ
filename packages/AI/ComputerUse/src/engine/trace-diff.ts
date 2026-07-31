/**
 * Trace diff for the always-explore canary set (CU-C7).
 *
 * A rotating slice of tests runs the LLM tier even when a valid trace exists;
 * the fresh derivation is recorded and compared against the stored trace. Their
 * divergences ARE the UI-drift findings — exploration value preserved at a
 * fraction of its former cost, and drift becomes a scheduled deliverable instead
 * of an accident. This module is the pure comparator ("the drift-diff report");
 * WHICH runs get the canary mix is the sibling plan's scheduler.
 *
 * Drift severity is keyed on SEMANTICS, not raw selectors: a step whose target
 * kept its role+name but changed selector is minor `selector-drift` (exactly
 * what CU-C3 heals); a changed role/name, method, or per-step URL is a
 * meaningful UI change. Pure and app-agnostic.
 */

import { ComputerUseTrace, TraceStep, TraceTarget } from '../types/trace.js';

/** Classification of how one step's fresh derivation differs from the recording. */
export type TraceStepDiffKind =
    | 'match'           // identical (semantically) — no drift
    | 'selector-drift'  // same role+name, different selector — minor, heals
    | 'target-changed'  // role or name changed — meaningful UI change
    | 'method-changed'  // the action verb changed — meaningful
    | 'url-changed';    // the step's entry URL changed — meaningful

export interface TraceStepDiff {
    index: number;
    kind: TraceStepDiffKind;
    detail: string;
}

export interface TraceDiff {
    /** True when the fresh derivation matches the recording step-for-step (no drift). */
    identical: boolean;
    /** Steps the fresh derivation ADDED beyond the recording's length. */
    addedSteps: number;
    /** Steps the recording had that the fresh derivation dropped. */
    removedSteps: number;
    /** Per-step differences (only non-`match` steps). */
    changedSteps: TraceStepDiff[];
    /** Count of MEANINGFUL drift (excludes minor selector-drift). */
    meaningfulDrift: number;
    /** Human-readable one-line summary for the drift report. */
    summary: string;
}

/**
 * Compare a stored trace against a freshly-derived one (both for the same test).
 * Steps are compared positionally; length differences surface as added/removed.
 */
export function diffTraces(recorded: ComputerUseTrace, fresh: ComputerUseTrace): TraceDiff {
    const recSteps = recorded.Steps;
    const freshSteps = fresh.Steps;
    const common = Math.min(recSteps.length, freshSteps.length);

    const changedSteps: TraceStepDiff[] = [];
    for (let i = 0; i < common; i++) {
        const diff = diffStep(i, recSteps[i], freshSteps[i]);
        if (diff.kind !== 'match') {
            changedSteps.push(diff);
        }
    }

    const addedSteps = Math.max(0, freshSteps.length - recSteps.length);
    const removedSteps = Math.max(0, recSteps.length - freshSteps.length);
    const meaningfulDrift =
        changedSteps.filter(d => d.kind !== 'selector-drift').length + addedSteps + removedSteps;
    const identical = changedSteps.length === 0 && addedSteps === 0 && removedSteps === 0;

    return {
        identical,
        addedSteps,
        removedSteps,
        changedSteps,
        meaningfulDrift,
        summary: buildSummary(identical, meaningfulDrift, changedSteps, addedSteps, removedSteps),
    };
}

// ─── Internals ─────────────────────────────────────────────

function diffStep(index: number, rec: TraceStep, fresh: TraceStep): TraceStepDiff {
    if (rec.Action.Method !== fresh.Action.Method) {
        return { index, kind: 'method-changed', detail: `method ${rec.Action.Method} → ${fresh.Action.Method}` };
    }
    if (rec.UrlBefore !== fresh.UrlBefore) {
        return { index, kind: 'url-changed', detail: `entry URL ${rec.UrlBefore || '(none)'} → ${fresh.UrlBefore || '(none)'}` };
    }
    const targetDiff = diffTarget(rec.Action.Target, fresh.Action.Target);
    if (targetDiff) {
        return { index, ...targetDiff };
    }
    return { index, kind: 'match', detail: 'match' };
}

function diffTarget(
    rec: TraceTarget | undefined,
    fresh: TraceTarget | undefined
): { kind: TraceStepDiffKind; detail: string } | null {
    const recRole = norm(rec?.Role);
    const freshRole = norm(fresh?.Role);
    const recName = norm(rec?.Name);
    const freshName = norm(fresh?.Name);

    if (recRole !== freshRole || recName !== freshName) {
        return { kind: 'target-changed', detail: `target "${recRole} ${recName}" → "${freshRole} ${freshName}"` };
    }
    // Same semantic target; a differing selector is minor, healable drift.
    if ((rec?.Selector ?? '') !== (fresh?.Selector ?? '')) {
        return { kind: 'selector-drift', detail: `selector ${rec?.Selector ?? '(none)'} → ${fresh?.Selector ?? '(none)'}` };
    }
    return null;
}

function norm(s: string | undefined): string {
    return (s ?? '').trim().toLowerCase();
}

function buildSummary(
    identical: boolean,
    meaningfulDrift: number,
    changedSteps: TraceStepDiff[],
    addedSteps: number,
    removedSteps: number
): string {
    if (identical) {
        return 'no drift — fresh derivation matches the recorded trace';
    }
    const parts: string[] = [];
    if (meaningfulDrift > 0) {
        parts.push(`${meaningfulDrift} meaningful drift`);
    }
    const selectorDrift = changedSteps.filter(d => d.kind === 'selector-drift').length;
    if (selectorDrift > 0) {
        parts.push(`${selectorDrift} selector-drift (healable)`);
    }
    if (addedSteps > 0) {
        parts.push(`${addedSteps} added step(s)`);
    }
    if (removedSteps > 0) {
        parts.push(`${removedSteps} removed step(s)`);
    }
    return parts.join(', ');
}
