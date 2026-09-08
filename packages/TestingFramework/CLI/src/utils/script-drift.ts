/**
 * @fileoverview Structural diff between a promoted replay script and a pending one
 * @module @memberjunction/testing-cli
 */

import { MJTestEntity_IReplayScript, MJTestEntity_IReplayScriptStep } from '@memberjunction/core-entities';

/**
 * How one step's fresh derivation differs from the promoted script.
 *
 * The distinction that matters is `selector-drift` versus the rest: a selector
 * that changed while role and name held is routine churn the healer absorbs,
 * whereas a changed target, verb, or URL means the UI itself moved.
 */
export type ScriptStepDriftKind = 'selector-drift' | 'target-changed' | 'method-changed' | 'url-changed';

export interface ScriptStepDrift {
    /** 0-based index into the promoted script's steps. */
    index: number;
    kind: ScriptStepDriftKind;
    detail: string;
}

export interface ScriptDrift {
    addedSteps: number;
    removedSteps: number;
    changes: ScriptStepDrift[];
    /** Changes excluding routine selector churn — the "the UI moved" count. */
    meaningfulDrift: number;
    /** One line for the review listing. */
    summary: string;
}

/**
 * Compare a pending script against the promoted one it would replace.
 *
 * Deliberately a dependency-light structural summary rather than the engine's own
 * `diffTraces`: this package would otherwise need `@memberjunction/computer-use`,
 * which carries a Playwright peer dependency the test CLI has no other use for.
 * Both read the same fields, and this one only has to be good enough for a human
 * to decide with.
 */
export function summarizeScriptDrift(
    promoted: MJTestEntity_IReplayScript | undefined,
    pending: MJTestEntity_IReplayScript
): ScriptDrift {
    if (!promoted) {
        return {
            addedSteps: pending.Steps?.length ?? 0,
            removedSteps: 0,
            changes: [],
            meaningfulDrift: 0,
            summary: `new script — ${pending.Steps?.length ?? 0} step(s), no promoted script to compare against`,
        };
    }

    const before = promoted.Steps ?? [];
    const after = pending.Steps ?? [];
    const changes: ScriptStepDrift[] = [];

    for (let i = 0; i < Math.min(before.length, after.length); i++) {
        const change = compareStep(i, before[i], after[i]);
        if (change) {
            changes.push(change);
        }
    }

    const addedSteps = Math.max(0, after.length - before.length);
    const removedSteps = Math.max(0, before.length - after.length);
    const meaningfulDrift =
        changes.filter(c => c.kind !== 'selector-drift').length + addedSteps + removedSteps;

    return { addedSteps, removedSteps, changes, meaningfulDrift, summary: buildSummary(changes, addedSteps, removedSteps, meaningfulDrift) };
}

/** The first difference that matters, or null when the two steps agree. */
function compareStep(
    index: number,
    before: MJTestEntity_IReplayScriptStep,
    after: MJTestEntity_IReplayScriptStep
): ScriptStepDrift | null {
    if (before.Action?.Method !== after.Action?.Method) {
        return { index, kind: 'method-changed', detail: `${before.Action?.Method} → ${after.Action?.Method}` };
    }
    if (normalizeUrl(before.Action?.Url) !== normalizeUrl(after.Action?.Url)) {
        return { index, kind: 'url-changed', detail: `${before.Action?.Url ?? '(none)'} → ${after.Action?.Url ?? '(none)'}` };
    }

    const b = before.Action?.Target;
    const a = after.Action?.Target;
    if ((b?.Role ?? '') !== (a?.Role ?? '') || (b?.Name ?? '') !== (a?.Name ?? '')) {
        return {
            index,
            kind: 'target-changed',
            detail: `${describeTarget(b?.Role, b?.Name)} → ${describeTarget(a?.Role, a?.Name)}`,
        };
    }
    if ((b?.Selector ?? '') !== (a?.Selector ?? '')) {
        return { index, kind: 'selector-drift', detail: `${b?.Selector ?? '(none)'} → ${a?.Selector ?? '(none)'}` };
    }
    return null;
}

function describeTarget(role: string | undefined, name: string | undefined): string {
    if (!role && !name) {
        return '(no target)';
    }
    return `${role ?? '?'} "${name ?? ''}"`;
}

/** Recording already tokenizes UUIDs, so a raw compare is enough here. */
function normalizeUrl(url: string | undefined): string {
    return (url ?? '').trim();
}

function buildSummary(changes: ScriptStepDrift[], added: number, removed: number, meaningful: number): string {
    if (changes.length === 0 && added === 0 && removed === 0) {
        return 'identical to the promoted script';
    }
    const parts: string[] = [];
    if (added > 0) {
        parts.push(`${added} step(s) added`);
    }
    if (removed > 0) {
        parts.push(`${removed} step(s) removed`);
    }
    const selectorOnly = changes.filter(c => c.kind === 'selector-drift').length;
    if (selectorOnly > 0) {
        parts.push(`${selectorOnly} selector-only change(s)`);
    }
    const structural = changes.length - selectorOnly;
    if (structural > 0) {
        parts.push(`${structural} target/verb/URL change(s)`);
    }
    return `${parts.join(', ')} — ${meaningful === 0 ? 'routine churn' : `${meaningful} meaningful`}`;
}
