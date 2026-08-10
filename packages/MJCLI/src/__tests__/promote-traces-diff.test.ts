import { describe, it, expect } from 'vitest';
import { classifyTraceDiff } from '../commands/test/regression/promote-traces.js';

const step = (o: {
    method?: string;
    url?: string;
    role?: string;
    name?: string;
    selector?: string;
    postUrl?: string;
}) => ({
    Action: {
        Method: o.method ?? 'click',
        Url: o.url,
        Target: o.role || o.name || o.selector ? { Role: o.role, Name: o.name, Selector: o.selector } : undefined,
    },
    Postcondition: o.postUrl ? { UrlPattern: o.postUrl } : undefined,
});

describe('classifyTraceDiff', () => {
    it('classifies a missing baseline as new', () => {
        const r = classifyTraceDiff(null, { Steps: [step({ name: 'Save' })] });
        expect(r.kind).toBe('new');
    });

    it('classifies an identical trace as unchanged', () => {
        const t = { Steps: [step({ role: 'button', name: 'Save', selector: '#save' })] };
        const r = classifyTraceDiff({ Steps: [step({ role: 'button', name: 'Save', selector: '#save' })] }, t);
        expect(r.kind).toBe('unchanged');
        expect(r.details).toEqual([]);
    });

    it('classifies a bare selector change (role+name intact) as selector-drift', () => {
        const prior = { Steps: [step({ role: 'button', name: 'Save', selector: '#old' })] };
        const cand = { Steps: [step({ role: 'button', name: 'Save', selector: '#new' })] };
        const r = classifyTraceDiff(prior, cand);
        expect(r.kind).toBe('selector-drift');
        expect(r.details.join()).toMatch(/selector drift/);
    });

    it('classifies a target role/name change as meaningful-drift', () => {
        const prior = { Steps: [step({ role: 'button', name: 'Save', selector: '#s' })] };
        const cand = { Steps: [step({ role: 'button', name: 'Submit', selector: '#s' })] };
        expect(classifyTraceDiff(prior, cand).kind).toBe('meaningful-drift');
    });

    it('classifies a step-count change as meaningful-drift', () => {
        const prior = { Steps: [step({ name: 'A' })] };
        const cand = { Steps: [step({ name: 'A' }), step({ name: 'B' })] };
        const r = classifyTraceDiff(prior, cand);
        expect(r.kind).toBe('meaningful-drift');
        expect(r.details.join()).toMatch(/step count 1→2/);
    });

    it('classifies a method change as meaningful-drift', () => {
        const prior = { Steps: [step({ method: 'click', name: 'X' })] };
        const cand = { Steps: [step({ method: 'type', name: 'X' })] };
        expect(classifyTraceDiff(prior, cand).kind).toBe('meaningful-drift');
    });

    it('classifies a navigate-url change as meaningful-drift', () => {
        const prior = { Steps: [step({ method: 'navigate', url: '/app/home' })] };
        const cand = { Steps: [step({ method: 'navigate', url: '/app/admin' })] };
        expect(classifyTraceDiff(prior, cand).kind).toBe('meaningful-drift');
    });

    it('classifies a postcondition-url change as meaningful-drift', () => {
        const prior = { Steps: [step({ name: 'Go', postUrl: '/app/x' })] };
        const cand = { Steps: [step({ name: 'Go', postUrl: '/app/y' })] };
        expect(classifyTraceDiff(prior, cand).kind).toBe('meaningful-drift');
    });

    it('meaningful-drift wins over a co-occurring selector drift (worst-of-steps)', () => {
        const prior = { Steps: [step({ name: 'A', selector: '#a1' }), step({ method: 'click', name: 'B' })] };
        const cand = { Steps: [step({ name: 'A', selector: '#a2' }), step({ method: 'type', name: 'B' })] };
        const r = classifyTraceDiff(prior, cand);
        expect(r.kind).toBe('meaningful-drift');
    });

    it('treats empty/absent Steps as unchanged against each other', () => {
        expect(classifyTraceDiff({ Steps: [] }, {}).kind).toBe('unchanged');
    });
});
