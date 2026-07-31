/**
 * Pure replay-step logic (CU-C2) — action rehydration + guard evaluation.
 *
 * The engine's Replay() loop owns the async work (settle, DOM queries, action
 * execution); this module owns the pure decisions so they're unit-testable
 * without a browser:
 *   - planReplayActions: rehydrate a recorded TraceStep into concrete
 *     BrowserAction(s), substituting fresh variable values into %placeholders%.
 *   - evaluatePrecondition / evaluatePostcondition: fail-fast guard decisions
 *     from observed facts (URL match, target visibility). Fail-fast is the
 *     contract — a missed precondition FAILS the step (no proceed-anyway).
 *
 * App-agnostic: operates only on the generic trace + browser-action types.
 */

import { TraceStep, StepPrecondition, StepPostcondition } from '../types/trace.js';
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
} from '../types/browser.js';

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
 *   type with no recorded selector — heal territory, CU-C3), which the engine
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
