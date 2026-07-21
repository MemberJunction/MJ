/**
 * Goal postconditions (CU-C5) — deterministic verification without an LLM.
 *
 * When a run passes the LLM judge, distill its end-state into
 * {@link GoalPostcondition}s (CU-C1's `goalPostconditions`). The replay tier then
 * scores by EXECUTING them: deterministic, free, and more trustworthy than a
 * judge float. The LLM judge then runs only on the LLM tier or when a
 * postcondition is ambiguous/fails (as diagnostician).
 *
 * Distillation is deliberately conservative — the plan warns that over-specific
 * postconditions cause false invalidations, so we prefer role/name PRESENCE
 * over text equality: the final URL (highest signal, cheapest) plus the
 * end-state's landmark headings. This is the automated FIRST DRAFT; whether a
 * distilled postcondition GATES pass/fail vs. merely advises is a Layer-2 policy
 * (the plan's open question on postcondition trust / review bar).
 *
 * Pure and app-agnostic.
 */

import { GoalPostcondition, TraceTarget } from '../types/trace.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import { InteractiveElement } from '../types/browser.js';
import { normalizeTraceUrl, traceUrlMatches } from './trace-url.js';

/** Cap on distilled landmark postconditions — a few stable anchors, not the whole page. */
const MAX_LANDMARK_POSTCONDITIONS = 3;

export interface DistillOptions {
    /** The passing run's final step (source of the end-state element list). */
    finalStep?: StepRecord;
    /** The final URL (defaults to the final step's UrlAfter). */
    finalUrl?: string;
    /** The passing judge verdict (reserved for rubric-evidence enrichment). */
    finalVerdict?: JudgeVerdict;
    /** App-specific volatile query params to strip from the recorded URL. */
    volatileParams?: string[];
}

/**
 * Distill a passing run's end-state into deterministic goal postconditions:
 * one URL postcondition (final normalized URL) + up to {@link
 * MAX_LANDMARK_POSTCONDITIONS} `visible` postconditions for the end-state's
 * landmark headings (role/name presence). Returns [] when there's nothing to
 * distill.
 */
export function distillGoalPostconditions(options: DistillOptions): GoalPostcondition[] {
    const posts: GoalPostcondition[] = [];
    const volatile = options.volatileParams ?? [];

    const url = normalizeTraceUrl(options.finalUrl ?? options.finalStep?.UrlAfter ?? options.finalStep?.Url ?? '', volatile);
    if (url) {
        const p = new GoalPostcondition();
        p.Kind = 'url';
        p.UrlPattern = url;
        p.Description = 'final URL of the passing run';
        posts.push(p);
    }

    const elements = options.finalStep?.InteractiveElements ?? [];
    const headings = elements.filter(e => (e.Role ?? '').trim().toLowerCase() === 'heading' && (e.Name ?? '').trim());
    for (const h of headings.slice(0, MAX_LANDMARK_POSTCONDITIONS)) {
        const p = new GoalPostcondition();
        p.Kind = 'visible';
        const t = new TraceTarget();
        t.Role = h.Role;
        t.Name = h.Name;
        t.Selector = h.Selector || undefined;
        p.Target = t;
        p.Description = 'landmark heading present in the passing end-state';
        posts.push(p);
    }
    return posts;
}

export interface GoalPostconditionResult {
    post: GoalPostcondition;
    met: boolean;
    detail: string;
}

/**
 * Execute distilled goal postconditions against an observed end-state (URL +
 * interactive-element list). Pure — the engine supplies the observed facts.
 */
export function executeGoalPostconditions(
    posts: GoalPostcondition[],
    observed: { url: string; elements: InteractiveElement[]; volatileParams?: string[] }
): { passed: boolean; results: GoalPostconditionResult[] } {
    const volatile = observed.volatileParams ?? [];
    const results = posts.map(post => evaluateOne(post, observed.url, observed.elements, volatile));
    return { passed: results.every(r => r.met), results };
}

function evaluateOne(
    post: GoalPostcondition,
    url: string,
    elements: InteractiveElement[],
    volatile: string[]
): GoalPostconditionResult {
    if (post.Kind === 'url') {
        const met = post.UrlPattern ? traceUrlMatches(post.UrlPattern, url, volatile) : true;
        return { post, met, detail: met ? 'URL matched' : `URL did not match ${post.UrlPattern}` };
    }
    const present = post.Target ? elementPresent(post.Target, elements) : false;
    if (post.Kind === 'visible') {
        return { post, met: present, detail: present ? 'element present' : 'expected element not present' };
    }
    // 'absent'
    return { post, met: !present, detail: present ? 'element unexpectedly present' : 'element absent as expected' };
}

/** Presence by role (exact) + name (substring) — robust to minor label drift. */
function elementPresent(target: TraceTarget, elements: InteractiveElement[]): boolean {
    const role = target.Role?.trim().toLowerCase();
    const name = target.Name?.trim().toLowerCase();
    if (!role && !name) {
        return false;
    }
    return elements.some(e =>
        (!role || (e.Role ?? '').trim().toLowerCase() === role) &&
        (!name || (e.Name ?? '').trim().toLowerCase().includes(name))
    );
}
