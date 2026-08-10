import { describe, it, expect } from 'vitest';
import {
    planReplayActions,
    substituteVariables,
    evaluatePrecondition,
    evaluatePostcondition,
    targetSelector,
} from '../engine/replay-step.js';
import { TraceStep, TraceAction, TraceTarget, StepPrecondition, StepPostcondition } from '../types/trace.js';

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
        expect(substituteVariables('Create %recordName% now', { recordName: 'Acme' })).toBe('Create Acme now');
    });
    it('leaves unknown placeholders intact', () => {
        expect(substituteVariables('Hello %missing%', { other: 'x' })).toBe('Hello %missing%');
    });
    it('passes undefined through', () => {
        expect(substituteVariables(undefined, {})).toBeUndefined();
    });
});

describe('planReplayActions', () => {
    it('rehydrates a selector click', () => {
        const [a] = planReplayActions(withTarget({ Method: 'click', Button: 'left', ClickCount: 2 }, '#save'));
        expect(a.Type).toBe('Click');
        expect((a as { Selector?: string }).Selector).toBe('#save');
        expect((a as { ClickCount: number }).ClickCount).toBe(2);
    });

    it('returns [] for a click with no recorded selector (heal territory)', () => {
        expect(planReplayActions(step({ Method: 'click' }))).toEqual([]);
    });

    it('rehydrates a type + Enter into two actions, substituting variables', () => {
        const s = withTarget({ Method: 'type', Text: 'Name-%recordName%', PressEnter: true }, '#name');
        const actions = planReplayActions(s, { recordName: '42' });
        expect(actions.map(a => a.Type)).toEqual(['Type', 'Keypress']);
        expect((actions[0] as { Text: string }).Text).toBe('Name-42');
        expect((actions[1] as { Key: string }).Key).toBe('Enter');
    });

    it('rehydrates navigate with variable substitution', () => {
        const [a] = planReplayActions(step({ Method: 'navigate', Url: 'http://x/s?q=%company%' }), { company: 'Acme' });
        expect(a.Type).toBe('Navigate');
        expect((a as { Url: string }).Url).toBe('http://x/s?q=Acme');
    });

    it('rehydrates keypress / goBack / refresh', () => {
        expect(planReplayActions(step({ Method: 'keypress', Key: 'Escape' }))[0].Type).toBe('Keypress');
        expect(planReplayActions(step({ Method: 'goBack' }))[0].Type).toBe('GoBack');
        expect(planReplayActions(step({ Method: 'refresh' }))[0].Type).toBe('Refresh');
    });

    it('reports the target selector for a step', () => {
        expect(targetSelector(withTarget({ Method: 'click' }, '#x'))).toBe('#x');
        expect(targetSelector(step({ Method: 'keypress', Key: 'Enter' }))).toBeUndefined();
    });
});

describe('evaluatePrecondition (fail-fast)', () => {
    const pre = (o: Partial<StepPrecondition>): StepPrecondition => Object.assign(new StepPrecondition(), o);

    it('fails when a URL pattern does not match', () => {
        const r = evaluatePrecondition(pre({ UrlPattern: '/app/data', WaitForTarget: false }),
            { urlMatched: false, targetVisible: false, targetChecked: false });
        expect(r.pass).toBe(false);
    });

    it('fails when the required target never became visible', () => {
        const r = evaluatePrecondition(pre({ WaitForTarget: true }),
            { urlMatched: true, targetVisible: false, targetChecked: true });
        expect(r.pass).toBe(false);
        expect(r.reason).toContain('never became');
    });

    it('passes when URL matches and target is visible', () => {
        const r = evaluatePrecondition(pre({ UrlPattern: '/app/data', WaitForTarget: true }),
            { urlMatched: true, targetVisible: true, targetChecked: true });
        expect(r.pass).toBe(true);
    });
});

describe('evaluatePostcondition', () => {
    it('passes when no postcondition recorded', () => {
        expect(evaluatePostcondition(undefined, { urlMatched: false, expectVisibleOk: false, expectChecked: false }).pass).toBe(true);
    });
    it('fails on URL mismatch', () => {
        const post = Object.assign(new StepPostcondition(), { UrlPattern: '/app/data' });
        expect(evaluatePostcondition(post, { urlMatched: false, expectVisibleOk: true, expectChecked: false }).pass).toBe(false);
    });
    it('fails when an expected element is not visible', () => {
        const post = new StepPostcondition();
        post.ExpectVisible = Object.assign(new TraceTarget(), { Selector: '#heading' });
        expect(evaluatePostcondition(post, { urlMatched: true, expectVisibleOk: false, expectChecked: true }).pass).toBe(false);
    });
});
