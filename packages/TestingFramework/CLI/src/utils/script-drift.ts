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
export type ScriptStepDriftKind =
    | 'selector-drift'
    | 'target-changed'
    | 'method-changed'
    | 'url-changed'
    | 'input-changed'
    | 'guard-changed';

export interface ScriptStepDrift {
    /** 0-based index into the promoted script's steps. */
    index: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    kind: ScriptStepDriftKind;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    detail: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface ScriptDrift {
    AddedSteps: number;
    RemovedSteps: number;
    Changes: ScriptStepDrift[];
    /** Changes excluding routine selector churn — the "the UI moved" count. */
    MeaningfulDrift: number;
    /** One line for the review listing. */
    Summary: string;
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
export function SummarizeScriptDrift(
    promoted: MJTestEntity_IReplayScript | undefined,
    pending: MJTestEntity_IReplayScript
): ScriptDrift {
    if (!promoted) {
        return {
            AddedSteps: pending.Steps?.length ?? 0,
            RemovedSteps: 0,
            Changes: [],
            MeaningfulDrift: 0,
            Summary: `new script — ${pending.Steps?.length ?? 0} step(s), no promoted script to compare against`,
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

    return { AddedSteps: addedSteps, RemovedSteps: removedSteps, Changes: changes, MeaningfulDrift: meaningfulDrift, Summary: buildSummary(changes, addedSteps, removedSteps, meaningfulDrift) };
}

/** @deprecated Use {@link SummarizeScriptDrift}. */
export function summarizeScriptDrift(
    promoted: MJTestEntity_IReplayScript | undefined,
    pending: MJTestEntity_IReplayScript
): ScriptDrift {
    return SummarizeScriptDrift(promoted, pending);
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
    // The engine's diffTraces labels a changed entry URL `url-changed` too. Using
    // the same word for only Action.Url meant a step that starts somewhere else
    // entirely was reported as identical.
    if (normalizeUrl(before.UrlBefore) !== normalizeUrl(after.UrlBefore)) {
        return { index, kind: 'url-changed', detail: `entry ${before.UrlBefore ?? '(none)'} → ${after.UrlBefore ?? '(none)'}` };
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
    // Scope is part of the target's identity — it is what tells same-named twins
    // apart — so a changed region is the UI moving, not selector churn.
    if ((b?.Scope ?? '') !== (a?.Scope ?? '')) {
        return { index, kind: 'target-changed', detail: `scope ${b?.Scope ?? '(none)'} → ${a?.Scope ?? '(none)'}` };
    }

    // What the step actually enters. A recording that types a different value, or
    // stops pressing Enter, is a behavioural change however stable its selector.
    const inputDrift = compareInput(before, after);
    if (inputDrift) {
        return { index, ...inputDrift };
    }

    // What the step asserts. A dropped or rewritten guard is how a script quietly
    // stops checking the thing it was recorded to check.
    const guardDrift = compareGuards(before, after);
    if (guardDrift) {
        return { index, ...guardDrift };
    }

    if ((b?.Selector ?? '') !== (a?.Selector ?? '')) {
        return { index, kind: 'selector-drift', detail: `${b?.Selector ?? '(none)'} → ${a?.Selector ?? '(none)'}` };
    }
    return null;
}

/** Text / Key / PressEnter — the payload the step delivers. */
function compareInput(
    before: MJTestEntity_IReplayScriptStep,
    after: MJTestEntity_IReplayScriptStep
): { kind: ScriptStepDriftKind; detail: string } | null {
    const fields: Array<'Text' | 'Key'> = ['Text', 'Key'];
    for (const field of fields) {
        const b = before.Action?.[field] ?? '';
        const a = after.Action?.[field] ?? '';
        if (b !== a) {
            return { kind: 'input-changed', detail: `${field} "${b}" → "${a}"` };
        }
    }
    if ((before.Action?.PressEnter ?? false) !== (after.Action?.PressEnter ?? false)) {
        return { kind: 'input-changed', detail: `PressEnter ${before.Action?.PressEnter ?? false} → ${after.Action?.PressEnter ?? false}` };
    }
    return null;
}

/** Precondition / Postcondition — what the step waits for and what it proves. */
function compareGuards(
    before: MJTestEntity_IReplayScriptStep,
    after: MJTestEntity_IReplayScriptStep
): { kind: ScriptStepDriftKind; detail: string } | null {
    const pre = describeGuard(before.Precondition);
    const preAfter = describeGuard(after.Precondition);
    if (pre !== preAfter) {
        return { kind: 'guard-changed', detail: `precondition ${pre} → ${preAfter}` };
    }
    const post = describeGuard(before.Postcondition);
    const postAfter = describeGuard(after.Postcondition);
    if (post !== postAfter) {
        return { kind: 'guard-changed', detail: `postcondition ${post} → ${postAfter}` };
    }
    return null;
}

/** Stable text for a guard, with URL patterns normalized so token churn is not drift. */
function describeGuard(guard: unknown): string {
    if (!guard) {
        return '(none)';
    }
    const g = guard as Record<string, unknown>;
    const parts = Object.keys(g)
        .sort()
        .filter(k => g[k] !== undefined)
        .map(k => `${k}=${k.endsWith('UrlPattern') ? normalizeUrl(String(g[k])) : String(g[k])}`);
    return parts.length > 0 ? parts.join(',') : '(none)';
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
