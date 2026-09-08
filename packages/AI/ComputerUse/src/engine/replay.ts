/**
 * The pure half of replay: rehydrating a recorded step into concrete browser
 * actions, evaluating its fail-fast guards, and re-resolving a drifted target
 * under a confidence gate. The engine's Replay() loop owns the async work.
 *
 * App-agnostic: operates only on the generic trace + browser types.
 */

import { TraceStep, StepPrecondition, StepPostcondition, TraceTarget } from '../types/trace.js';
import {
    BrowserAction,
    ClickAction,
    TypeAction,
    KeypressAction,
    NavigateAction,
    ScrollAction,
    WaitAction,
    GoBackAction,
    GoForwardAction,
    RefreshAction,
    InteractiveElement,
} from '../types/browser.js';

// ─── Action Rehydration & Guards ───────────────────────

/** Substitute `%name%` placeholders with fresh values (Stagehand replay discipline). */
export function substituteVariables(text: string | undefined, values: Record<string, string>): string | undefined {
    if (text === undefined) {
        return undefined;
    }
    return text.replace(/%([A-Za-z0-9_]+)%/g, (whole, name: string) => (name in values ? values[name] : whole));
}

/**
 * Rehydrate a recorded step's action into concrete browser action(s). Returns:
 * - one action for click/keypress/navigate/scroll/wait/goBack/goForward/refresh,
 * - two for a `type` with PressEnter (`[TypeAction, Keypress Enter]`),
 * - an empty array when the step is NOT deterministically replayable (a click /
 *   type with no recorded selector — heal territory), which the engine
 *   treats as a divergence.
 */
export function planReplayActions(step: TraceStep, values: Record<string, string> = {}): BrowserAction[] {
    const a = step.Action;
    switch (a.Method) {
        case 'click': {
            const sel = a.Target?.Selector;
            if (!sel) {
                return [];
            }
            const click = new ClickAction();
            click.Selector = sel;
            click.Button = a.Button ?? 'left';
            click.ClickCount = a.ClickCount ?? 1;
            return [click];
        }
        case 'type': {
            const sel = a.Target?.Selector;
            if (!sel) {
                return [];
            }
            const type = new TypeAction();
            type.Selector = sel;
            type.Text = substituteVariables(a.Text, values) ?? '';
            const out: BrowserAction[] = [type];
            if (a.PressEnter) {
                const key = new KeypressAction();
                key.Key = 'Enter';
                out.push(key);
            }
            return out;
        }
        case 'keypress': {
            const key = new KeypressAction();
            key.Key = a.Key ?? '';
            return key.Key ? [key] : [];
        }
        case 'navigate': {
            const url = substituteVariables(a.Url, values);
            if (!url) {
                return [];
            }
            const nav = new NavigateAction();
            nav.Url = url;
            return [nav];
        }
        case 'scroll': {
            const scroll = new ScrollAction();
            if (a.Target?.Selector) {
                scroll.Selector = a.Target.Selector;
            }
            return [scroll];
        }
        case 'wait': {
            const wait = new WaitAction();
            if (a.Target?.Selector) {
                wait.Selector = a.Target.Selector;
            }
            if (a.DurationMs) {
                wait.DurationMs = a.DurationMs;
            }
            return [wait];
        }
        case 'goBack':
            return [new GoBackAction()];
        case 'goForward':
            return [new GoForwardAction()];
        case 'refresh':
            return [new RefreshAction()];
        default: {
            const _exhaustive: never = a.Method;
            return _exhaustive;
        }
    }
}

/** The selector a step's precondition should wait on, or undefined when it has no DOM target. */
export function targetSelector(step: TraceStep): string | undefined {
    return step.Action.Target?.Selector;
}

export interface GuardResult {
    pass: boolean;
    reason: string;
}

/**
 * Pure precondition decision from observed facts. Fail-fast: a declared URL
 * pattern that doesn't match, or a required target that never became visible
 * within the bound, FAILS the step (the engine then heals or diverges).
 */
export function evaluatePrecondition(
    pre: StepPrecondition,
    observed: { urlMatched: boolean; targetVisible: boolean; targetChecked: boolean }
): GuardResult {
    if (pre.UrlPattern && !observed.urlMatched) {
        return { pass: false, reason: `entry URL does not match expected pattern` };
    }
    if (pre.WaitForTarget && observed.targetChecked && !observed.targetVisible) {
        return { pass: false, reason: 'target never became attached+visible within the bound' };
    }
    return { pass: true, reason: 'precondition satisfied' };
}

/**
 * Pure postcondition decision from observed facts. A missing postcondition
 * always passes (nothing recorded to assert).
 */
export function evaluatePostcondition(
    post: StepPostcondition | undefined,
    observed: { urlMatched: boolean; expectVisibleOk: boolean; expectChecked: boolean }
): GuardResult {
    if (!post) {
        return { pass: true, reason: 'no postcondition recorded' };
    }
    if (post.UrlPattern && !observed.urlMatched) {
        return { pass: false, reason: 'post-action URL does not match expected pattern' };
    }
    if (post.ExpectVisible && observed.expectChecked && !observed.expectVisibleOk) {
        return { pass: false, reason: 'expected element not visible after the action' };
    }
    return { pass: true, reason: 'postcondition satisfied' };
}

// ─── Self-Heal ─────────────────────────────────────────

/** Confidence at/above which a heal is accepted (mabl's gate). */
export const DEFAULT_HEAL_CONFIDENCE_THRESHOLD = 0.6;

export interface HealResolution {
    /** The re-resolved selector, when a confident match exists. */
    selector?: string;
    /** The matched element, when one was found. */
    element?: InteractiveElement;
    /** Confidence 0..1 in the re-resolution. */
    confidence: number;
    /** Human-readable explanation for the run log / drift report. */
    reason: string;
}

/**
 * Deterministically re-resolve a recorded target against a fresh element list by
 * accessible role + name. Confidence tiers:
 *  - 0.9  — a UNIQUE exact role+name match (the common "element moved" drift).
 *  - 0.6  — a UNIQUE name-substring match (label lightly reworded).
 *  - 0.3  — MULTIPLE role+name matches (ambiguous; the LLM seam must disambiguate).
 *  - 0    — nothing plausible, or the recorded target had no role/name.
 */
export function reresolveTarget(target: TraceTarget, elements: InteractiveElement[]): HealResolution {
    const role = target.Role?.trim().toLowerCase();
    const name = target.Name?.trim().toLowerCase();
    if (!role && !name) {
        return { confidence: 0, reason: 'recorded target has no role/name to re-resolve' };
    }

    const exact = elements.filter(e =>
        (!role || (e.Role ?? '').trim().toLowerCase() === role) &&
        (!name || (e.Name ?? '').trim().toLowerCase() === name)
    );
    if (exact.length === 1) {
        return { selector: exact[0].Selector, element: exact[0], confidence: 0.9, reason: 'unique role+name match' };
    }
    if (exact.length > 1) {
        return { confidence: 0.3, reason: `${exact.length} elements match role+name — ambiguous` };
    }

    // No exact match — try a unique name-substring match (label drift).
    if (name) {
        const loose = elements.filter(e => (e.Name ?? '').trim().toLowerCase().includes(name));
        if (loose.length === 1) {
            return { selector: loose[0].Selector, element: loose[0], confidence: 0.6, reason: 'unique name-substring match' };
        }
    }
    return { confidence: 0, reason: 'no element matches the recorded role+name' };
}

/** Whether a re-resolution's confidence clears the acceptance gate. */
export function shouldAcceptHeal(confidence: number, threshold: number = DEFAULT_HEAL_CONFIDENCE_THRESHOLD): boolean {
    return confidence >= threshold;
}

/** A divergence caused by flow drift (not selector drift) is out of scope for
 *  selector re-resolution and must escalate to full re-derivation (LLM tier). */
export function isSelectorHealable(divergenceReason: string): boolean {
    return !divergenceReason.startsWith('postcondition');
}
