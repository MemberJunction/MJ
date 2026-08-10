import { describe, it, expect } from 'vitest';
import { distillGoalPostconditions, executeGoalPostconditions, evaluatePreludeLanding } from '../engine/postcondition.js';
import { StepRecord } from '../types/judge.js';
import { InteractiveElement } from '../types/browser.js';
import { GoalPostcondition, TraceTarget } from '../types/trace.js';

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function el(role: string, name: string, selector = ''): InteractiveElement {
    const e = new InteractiveElement();
    e.Role = role; e.Name = name; e.Selector = selector;
    return e;
}

describe('distillGoalPostconditions (CU-C5)', () => {
    it('distills a normalized final-URL postcondition', () => {
        const step = new StepRecord();
        step.UrlAfter = `http://localhost:4200/app/record/${UUID}`;
        const posts = distillGoalPostconditions({ finalStep: step });
        expect(posts[0].Kind).toBe('url');
        expect(posts[0].UrlPattern).toBe('http://localhost:4200/app/record/{uuid}');
    });

    it('distills up to 3 landmark heading presence postconditions', () => {
        const step = new StepRecord();
        step.UrlAfter = 'http://x/app/data';
        step.InteractiveElements = [
            el('heading', 'Data Explorer', '#h1'),
            el('heading', 'Members', '#h2'),
            el('heading', 'Details', '#h3'),
            el('heading', 'Extra', '#h4'),   // 4th ignored (cap 3)
            el('button', 'Save', '#save'),   // non-heading ignored
        ];
        const posts = distillGoalPostconditions({ finalStep: step });
        const visible = posts.filter(p => p.Kind === 'visible');
        expect(visible).toHaveLength(3);
        expect(visible.map(p => p.Target?.Name)).toEqual(['Data Explorer', 'Members', 'Details']);
    });

    it('returns [] when there is no URL and no headings', () => {
        expect(distillGoalPostconditions({})).toEqual([]);
    });
});

describe('executeGoalPostconditions (CU-C5)', () => {
    function urlPost(pattern: string): GoalPostcondition {
        return Object.assign(new GoalPostcondition(), { Kind: 'url', UrlPattern: pattern });
    }
    function visiblePost(role: string, name: string): GoalPostcondition {
        const p = new GoalPostcondition();
        p.Kind = 'visible';
        p.Target = Object.assign(new TraceTarget(), { Role: role, Name: name });
        return p;
    }

    it('passes when the URL matches and the element is present', () => {
        const r = executeGoalPostconditions(
            [urlPost('/app/data'), visiblePost('heading', 'Data Explorer')],
            { url: 'http://x/app/data/list', elements: [el('heading', 'Data Explorer Page')] },
        );
        expect(r.passed).toBe(true);
    });

    it('fails when the URL does not match', () => {
        const r = executeGoalPostconditions([urlPost('/app/data')], { url: 'http://x/app/home', elements: [] });
        expect(r.passed).toBe(false);
        expect(r.results[0].detail).toContain('did not match');
    });

    it('fails when an expected element is absent', () => {
        const r = executeGoalPostconditions([visiblePost('heading', 'Missing')], { url: 'http://x', elements: [el('heading', 'Present')] });
        expect(r.passed).toBe(false);
    });

    it("supports 'absent' postconditions (e.g. no error toast)", () => {
        const absent = Object.assign(new GoalPostcondition(), {
            Kind: 'absent',
            Target: Object.assign(new TraceTarget(), { Role: 'alert', Name: 'Error' }),
        });
        expect(executeGoalPostconditions([absent], { url: 'http://x', elements: [el('heading', 'OK')] }).passed).toBe(true);
        expect(executeGoalPostconditions([absent], { url: 'http://x', elements: [el('alert', 'Error occurred')] }).passed).toBe(false);
    });
});


describe('evaluatePreludeLanding (CU-C6)', () => {
    it('lands trivially when nothing is declared', () => {
        expect(evaluatePreludeLanding({ hasSelector: false, selectorVisible: false, hasUrl: false, urlMatched: false }).landed).toBe(true);
    });
    it('fails when a declared selector is not visible', () => {
        const r = evaluatePreludeLanding({ hasSelector: true, selectorVisible: false, hasUrl: false, urlMatched: false });
        expect(r.landed).toBe(false);
        expect(r.reason).toContain('element not visible');
    });
    it('fails when a declared URL pattern does not match', () => {
        const r = evaluatePreludeLanding({ hasSelector: false, selectorVisible: false, hasUrl: true, urlMatched: false });
        expect(r.landed).toBe(false);
        expect(r.reason).toContain('unexpected URL');
    });
    it('lands when the declared selector is visible and URL matches', () => {
        expect(evaluatePreludeLanding({ hasSelector: true, selectorVisible: true, hasUrl: true, urlMatched: true }).landed).toBe(true);
    });
});
