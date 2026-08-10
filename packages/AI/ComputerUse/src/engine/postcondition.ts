/**
 * Deterministic "did we reach the expected state?" checks, used in place of an
 * LLM judge: goal postconditions distilled from a passing run and executed on the
 * replay tier, plus prelude landing verification. Pure and app-agnostic.
 *
 * Distillation prefers role/name presence over text equality — over-specific
 * postconditions cause false invalidations.
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

/** What the engine observed about where a deterministic prelude landed. */
export interface PreludeLandingObserved {
    /** Whether a landing selector was declared. */
    hasSelector: boolean;
    /** Whether that selector became visible after the prelude. */
    selectorVisible: boolean;
    /** Whether a landing URL pattern was declared. */
    hasUrl: boolean;
    /** Whether the post-prelude URL matched that pattern. */
    urlMatched: boolean;
}

/**
 * Whether a prelude reached its declared landing. Declaring nothing trivially
 * lands — the prelude was fire-and-forget setup with no assertion.
 */
export function evaluatePreludeLanding(o: PreludeLandingObserved): { landed: boolean; reason: string } {
    if (o.hasSelector && !o.selectorVisible) {
        return { landed: false, reason: 'expected landing element not visible after prelude' };
    }
    if (o.hasUrl && !o.urlMatched) {
        return { landed: false, reason: 'landed on an unexpected URL after prelude' };
    }
    return { landed: true, reason: 'prelude landed as expected' };
}
