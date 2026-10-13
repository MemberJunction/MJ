import { describe, it, expect } from 'vitest';
import {
    PlanReplayActions,
    SubstituteVariables,
    EvaluatePrecondition,
    EvaluatePostcondition,
    TargetSelector,
    ReresolveTarget,
    ShouldAcceptHeal,
    IsSelectorHealable,
    PRECONDITION_TARGET_MISSING,
    DEFAULT_HEAL_CONFIDENCE_THRESHOLD,
} from '../engine/replay.js';
import { TraceStep, TraceAction, TraceTarget, StepPrecondition, StepPostcondition } from '../types/trace.js';
import { InteractiveElement, BoundingBox } from '../types/browser.js';

// ─── from replay-step ───

function step(action: Partial<TraceAction>): TraceStep {
    const s = new TraceStep();
    Object.assign(s.Action, action);
    return s;
}
function withTarget(action: Partial<TraceAction>, selector?: string): TraceStep {
    const s = step(action);
    const t = new TraceTarget();
    t.Selector = selector;
    s.Action.Target = t;
    return s;
}

describe('substituteVariables', () => {
    it('replaces %name% with the provided value', () => {
        expect(SubstituteVariables('Create %recordName% now', { recordName: 'Acme' })).toBe('Create Acme now');
    });
    it('leaves unknown placeholders intact', () => {
        expect(SubstituteVariables('Hello %missing%', { other: 'x' })).toBe('Hello %missing%');
    });
    it('passes undefined through', () => {
        expect(SubstituteVariables(undefined, {})).toBeUndefined();
    });
});

describe('planReplayActions', () => {
    it('rehydrates a selector click', () => {
        const [a] = PlanReplayActions(withTarget({ Method: 'click', Button: 'left', ClickCount: 2 }, '#save'));
        expect(a.Type).toBe('Click');
        expect((a as { Selector?: string }).Selector).toBe('#save');
        expect((a as { ClickCount: number }).ClickCount).toBe(2);
    });

    it('returns [] for a click with no recorded selector (heal territory)', () => {
        expect(PlanReplayActions(step({ Method: 'click' }))).toEqual([]);
    });

    it('rehydrates a type + Enter into two actions, substituting variables', () => {
        const s = withTarget({ Method: 'type', Text: 'Name-%recordName%', PressEnter: true }, '#name');
        const actions = PlanReplayActions(s, { recordName: '42' });
        expect(actions.map(a => a.Type)).toEqual(['Type', 'Keypress']);
        expect((actions[0] as { Text: string }).Text).toBe('Name-42');
        expect((actions[1] as { Key: string }).Key).toBe('Enter');
    });

    it('rehydrates navigate with variable substitution', () => {
        const [a] = PlanReplayActions(step({ Method: 'navigate', Url: 'http://x/s?q=%company%' }), { company: 'Acme' });
        expect(a.Type).toBe('Navigate');
        expect((a as { Url: string }).Url).toBe('http://x/s?q=Acme');
    });

    it('rehydrates keypress / goBack / refresh', () => {
        expect(PlanReplayActions(step({ Method: 'keypress', Key: 'Escape' }))[0].Type).toBe('Keypress');
        expect(PlanReplayActions(step({ Method: 'goBack' }))[0].Type).toBe('GoBack');
        expect(PlanReplayActions(step({ Method: 'refresh' }))[0].Type).toBe('Refresh');
    });

    it('reports the target selector for a step', () => {
        expect(TargetSelector(withTarget({ Method: 'click' }, '#x'))).toBe('#x');
        expect(TargetSelector(step({ Method: 'keypress', Key: 'Enter' }))).toBeUndefined();
    });
});

describe('evaluatePrecondition (fail-fast)', () => {
    const pre = (o: Partial<StepPrecondition>): StepPrecondition => Object.assign(new StepPrecondition(), o);

    it('fails when a URL pattern does not match', () => {
        const r = EvaluatePrecondition(pre({ UrlPattern: '/app/data', WaitForTarget: false }),
            { urlMatched: false, targetVisible: false, targetChecked: false });
        expect(r.pass).toBe(false);
    });

    it('fails when the required target never became visible', () => {
        const r = EvaluatePrecondition(pre({ WaitForTarget: true }),
            { urlMatched: true, targetVisible: false, targetChecked: true });
        expect(r.pass).toBe(false);
        expect(r.reason).toContain('never became');
    });

    it('passes when URL matches and target is visible', () => {
        const r = EvaluatePrecondition(pre({ UrlPattern: '/app/data', WaitForTarget: true }),
            { urlMatched: true, targetVisible: true, targetChecked: true });
        expect(r.pass).toBe(true);
    });
});

describe('URL guard diagnostics', () => {
    // A divergence reading "post-action URL does not match expected pattern" says
    // nothing about WHICH url was seen, so every investigation needs another full
    // run with instrumentation. The two urls are the whole finding: naming them
    // distinguishes app drift from a state-dependent recording at a glance.
    it('names both the expected pattern and the url actually observed (postcondition)', () => {
        const post = Object.assign(new StepPostcondition(), { UrlPattern: '/app/actions/Overview' });
        const r = EvaluatePostcondition(post, {
            urlMatched: false, expectVisibleOk: true, expectChecked: false,
            url: 'http://localhost:4200/app/actions/Monitor',
        });
        expect(r.reason).toContain('/app/actions/Overview');
        expect(r.reason).toContain('http://localhost:4200/app/actions/Monitor');
    });

    it('names both urls on an entry-url mismatch (precondition)', () => {
        const r = EvaluatePrecondition(
            Object.assign(new StepPrecondition(), { UrlPattern: '/app/data', WaitForTarget: false }),
            { urlMatched: false, targetVisible: false, targetChecked: false, url: 'http://localhost:4200/app/home/Home' },
        );
        expect(r.reason).toContain('/app/data');
        expect(r.reason).toContain('http://localhost:4200/app/home/Home');
    });

    it('stays readable when no observed url was supplied', () => {
        const post = Object.assign(new StepPostcondition(), { UrlPattern: '/app/data' });
        const r = EvaluatePostcondition(post, { urlMatched: false, expectVisibleOk: true, expectChecked: false });
        expect(r.pass).toBe(false);
        expect(r.reason).toContain('/app/data');
    });
});

describe('evaluatePostcondition', () => {
    it('passes when no postcondition recorded', () => {
        expect(EvaluatePostcondition(undefined, { urlMatched: false, expectVisibleOk: false, expectChecked: false }).pass).toBe(true);
    });
    it('fails on URL mismatch', () => {
        const post = Object.assign(new StepPostcondition(), { UrlPattern: '/app/data' });
        expect(EvaluatePostcondition(post, { urlMatched: false, expectVisibleOk: true, expectChecked: false }).pass).toBe(false);
    });
    it('fails when an expected element is not visible', () => {
        const post = new StepPostcondition();
        post.ExpectVisible = Object.assign(new TraceTarget(), { Selector: '#heading' });
        expect(EvaluatePostcondition(post, { urlMatched: true, expectVisibleOk: false, expectChecked: true }).pass).toBe(false);
    });
});

// ─── from heal-decision ───

function el(index: number, role: string, name: string, selector: string): InteractiveElement {
    const e = new InteractiveElement();
    e.Index = index; e.Role = role; e.Name = name; e.Selector = selector;
    return e;
}
function target(role?: string, name?: string): TraceTarget {
    const t = new TraceTarget();
    t.Role = role; t.Name = name;
    return t;
}

describe('reresolveTarget', () => {
    it('confidently re-resolves a unique role+name match (element moved)', () => {
        const r = ReresolveTarget(target('button', 'Save'), [
            el(0, 'link', 'Home', '#home'),
            el(1, 'button', 'Save', '#save-new'),
        ]);
        expect(r.confidence).toBeGreaterThanOrEqual(DEFAULT_HEAL_CONFIDENCE_THRESHOLD);
        expect(r.selector).toBe('#save-new');
    });

    it('is ambiguous (below the gate) when multiple elements match role+name', () => {
        const r = ReresolveTarget(target('button', 'Save'), [
            el(0, 'button', 'Save', '#a'),
            el(1, 'button', 'Save', '#b'),
        ]);
        expect(ShouldAcceptHeal(r.confidence)).toBe(false);
        expect(r.reason).toContain('ambiguous');
    });

    it('falls back to a unique name-substring match at threshold confidence', () => {
        const r = ReresolveTarget(target(undefined, 'Save'), [
            el(0, 'button', 'Save Record', '#save'),
            el(1, 'link', 'Cancel', '#cancel'),
        ]);
        expect(r.selector).toBe('#save');
        expect(r.confidence).toBe(0.6);
    });

    it('returns zero confidence when nothing matches', () => {
        const r = ReresolveTarget(target('button', 'Delete'), [el(0, 'link', 'Home', '#home')]);
        expect(r.confidence).toBe(0);
        expect(r.selector).toBeUndefined();
    });

    it('returns zero confidence when the recorded target has no role/name', () => {
        expect(ReresolveTarget(new TraceTarget(), [el(0, 'button', 'Save', '#s')]).confidence).toBe(0);
    });
});

describe('shouldAcceptHeal (mabl gate)', () => {
    it('accepts at/above threshold, rejects below', () => {
        expect(ShouldAcceptHeal(0.9)).toBe(true);
        expect(ShouldAcceptHeal(DEFAULT_HEAL_CONFIDENCE_THRESHOLD)).toBe(true);
        expect(ShouldAcceptHeal(0.3)).toBe(false);
    });
});

describe('isSelectorHealable (flow-vs-selector drift)', () => {
    // These are the reason strings the engine actually builds, not paraphrases:
    // `precondition — ${evaluatePrecondition().reason}` and `action ${Type} failed — …`.
    const targetMissing = `precondition — ${PRECONDITION_TARGET_MISSING}`;
    const wrongPage = 'precondition — entry URL does not match (recorded /app/data, live /app/home)';

    it('treats a missing target as selector-healable — the element moved', () => {
        expect(IsSelectorHealable(targetMissing)).toBe(true);
    });

    it('treats a failed action as selector-healable', () => {
        expect(IsSelectorHealable('action Click failed — not found')).toBe(true);
        expect(IsSelectorHealable('action Type failed — element detached')).toBe(true);
    });

    it('treats postcondition (flow) divergence as NOT selector-healable', () => {
        expect(IsSelectorHealable('postcondition — URL mismatch')).toBe(false);
    });

    it('treats a URL-precondition failure as flow drift, NOT selector drift', () => {
        // Being on the wrong page is not a moved selector. Healing it clicks a
        // same-named button on whatever page the run actually landed on, and the
        // run reports Completed from somewhere it was never meant to be.
        expect(IsSelectorHealable(wrongPage)).toBe(false);
    });

    it('fails closed on a reason it does not recognise', () => {
        // The predicate is an allowlist precisely so a divergence reason added later
        // is not healable by default. An exclusion list leaks every new string.
        expect(IsSelectorHealable('no replayable action (missing recorded selector)')).toBe(false);
        expect(IsSelectorHealable('some future divergence nobody has written yet')).toBe(false);
        expect(IsSelectorHealable('')).toBe(false);
    });
});

// ─── ambiguity resolved by recorded geometry ───

function box(xMin: number, yMin: number, xMax: number, yMax: number): BoundingBox {
    return Object.assign(new BoundingBox(), { XMin: xMin, YMin: yMin, XMax: xMax, YMax: yMax });
}
function elBox(index: number, role: string, name: string, selector: string, b: BoundingBox): InteractiveElement {
    const e = el(index, role, name, selector);
    e.BoundingBox = b;
    return e;
}
function targetAt(role: string, name: string, b: BoundingBox): TraceTarget {
    const t = target(role, name);
    t.BoundingBox = b;
    return t;
}

describe('reresolveTarget — ambiguous role+name disambiguated by recorded box', () => {
    // The app launcher renders every app TWICE (a MRU-ordered "Recent
    // applications" grid and an alphabetical "All applications" grid), so the
    // recorded link "AI" always has an identical twin and role+name alone is
    // ambiguous. Declining the heal there is the worst option available: the
    // caller then clicks the recorded absolute XPath, which is precisely the
    // thing the MRU reorder invalidated. The recorded box says which of the
    // equally-named candidates the run actually clicked.
    it('picks the candidate whose box overlaps the recorded one', () => {
        const r = ReresolveTarget(targetAt('link', 'AI', box(300, 100, 400, 160)), [
            elBox(0, 'link', 'AI', '#recent-ai', box(0, 100, 100, 160)),
            elBox(1, 'link', 'AI', '#all-ai', box(300, 100, 400, 160)),
        ]);
        expect(r.selector).toBe('#all-ai');
        expect(ShouldAcceptHeal(r.confidence)).toBe(true);
    });

    it('ranks below a unique role+name match', () => {
        const ambiguous = ReresolveTarget(targetAt('link', 'AI', box(0, 0, 10, 10)), [
            elBox(0, 'link', 'AI', '#a', box(0, 0, 10, 10)),
            elBox(1, 'link', 'AI', '#b', box(50, 50, 60, 60)),
        ]);
        const unique = ReresolveTarget(target('link', 'AI'), [el(0, 'link', 'AI', '#a')]);
        expect(ambiguous.confidence).toBeLessThan(unique.confidence);
    });

    it('stays ambiguous when the recorded target carries no box', () => {
        const r = ReresolveTarget(target('link', 'AI'), [
            elBox(0, 'link', 'AI', '#a', box(0, 0, 10, 10)),
            elBox(1, 'link', 'AI', '#b', box(50, 50, 60, 60)),
        ]);
        expect(ShouldAcceptHeal(r.confidence)).toBe(false);
        expect(r.reason).toContain('ambiguous');
    });

    it('stays ambiguous when the recorded box overlaps no candidate', () => {
        // Geometry that matches nothing is not evidence — a full relayout must
        // escalate, not pick whichever twin happens to sit nearest the origin.
        const r = ReresolveTarget(targetAt('link', 'AI', box(900, 900, 950, 950)), [
            elBox(0, 'link', 'AI', '#a', box(0, 0, 10, 10)),
            elBox(1, 'link', 'AI', '#b', box(50, 50, 60, 60)),
        ]);
        expect(ShouldAcceptHeal(r.confidence)).toBe(false);
        expect(r.reason).toContain('ambiguous');
    });
});

// ─── ambiguity resolved by semantic region ───

function elScoped(index: number, role: string, name: string, selector: string, scope: string): InteractiveElement {
    const e = el(index, role, name, selector);
    e.Scope = scope;
    return e;
}
function targetScoped(role: string, name: string, scope: string): TraceTarget {
    const t = target(role, name);
    t.Scope = scope;
    return t;
}

describe('reresolveTarget — ambiguous role+name narrowed by recorded region', () => {
    // Position is geometry and goes stale on any relayout; the region an element
    // lives in is semantic and survives both reordering AND relayout. The launcher
    // lists each app under BOTH "Recent applications" (usage-ordered) and "All
    // applications" — same role, same name, different meaning of *where*.
    it('picks the twin that lives in the recorded region', () => {
        const r = ReresolveTarget(targetScoped('link', 'AI', 'group:All applications'), [
            elScoped(0, 'link', 'AI', '#recent-ai', 'group:Recent applications'),
            elScoped(1, 'link', 'AI', '#all-ai', 'group:All applications'),
        ]);
        expect(r.selector).toBe('#all-ai');
        expect(r.confidence).toBe(0.9);   // a region-unique match is as good as a globally unique one
    });

    it('outranks the positional tiebreak — semantics beat geometry', () => {
        // The recorded box now sits over the WRONG twin (the grid reordered).
        // Region must win, or the heal re-points to whatever moved into that spot.
        const recorded = targetScoped('link', 'AI', 'group:All applications');
        recorded.BoundingBox = box(0, 100, 100, 160);
        const inRecent = elScoped(0, 'link', 'AI', '#recent-ai', 'group:Recent applications');
        inRecent.BoundingBox = box(0, 100, 100, 160);
        const inAll = elScoped(1, 'link', 'AI', '#all-ai', 'group:All applications');
        inAll.BoundingBox = box(300, 100, 400, 160);

        expect(ReresolveTarget(recorded, [inRecent, inAll]).selector).toBe('#all-ai');
    });

    it('ignores a region that matches nothing — a renamed region is not evidence', () => {
        const r = ReresolveTarget(targetScoped('button', 'Save', 'group:Gone'), [
            el(0, 'button', 'Save', '#save'),
        ]);
        expect(r.selector).toBe('#save');
    });

    it('leaves recordings without a region exactly as they were', () => {
        const r = ReresolveTarget(target('link', 'AI'), [
            elScoped(0, 'link', 'AI', '#a', 'group:Recent applications'),
            elScoped(1, 'link', 'AI', '#b', 'group:All applications'),
        ]);
        expect(ShouldAcceptHeal(r.confidence)).toBe(false);
        expect(r.reason).toContain('ambiguous');
    });
});
