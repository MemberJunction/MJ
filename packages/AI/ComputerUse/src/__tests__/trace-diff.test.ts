import { describe, it, expect } from 'vitest';
import { diffTraces } from '../engine/trace-diff.js';
import { ComputerUseTrace, TraceStep, TraceTarget, TraceActionMethod } from '../types/trace.js';

function step(method: TraceActionMethod, opts: { role?: string; name?: string; selector?: string; url?: string } = {}): TraceStep {
    const s = new TraceStep();
    s.Action.Method = method;
    s.UrlBefore = opts.url ?? 'http://x/app/home';
    if (opts.role || opts.name || opts.selector) {
        s.Action.Target = Object.assign(new TraceTarget(), { Role: opts.role, Name: opts.name, Selector: opts.selector });
    }
    return s;
}
function trace(steps: TraceStep[]): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1'; t.Steps = steps;
    return t;
}

describe('diffTraces', () => {
    it('reports no drift for semantically identical traces', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#save' })]);
        const b = trace([step('click', { role: 'button', name: 'Save', selector: '#save' })]);
        const d = diffTraces(a, b);
        expect(d.identical).toBe(true);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.summary).toContain('no drift');
    });

    it('classifies a same-role+name selector change as minor selector-drift (not meaningful)', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#old' })]);
        const b = trace([step('click', { role: 'button', name: 'Save', selector: '#new' })]);
        const d = diffTraces(a, b);
        expect(d.identical).toBe(false);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.changedSteps[0].kind).toBe('selector-drift');
        expect(d.summary).toContain('healable');
    });

    it('flags a changed role/name as meaningful target drift', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#s' })]);
        const b = trace([step('click', { role: 'button', name: 'Submit', selector: '#s' })]);
        const d = diffTraces(a, b);
        expect(d.meaningfulDrift).toBe(1);
        expect(d.changedSteps[0].kind).toBe('target-changed');
    });

    it('flags a changed action method as meaningful', () => {
        const a = trace([step('click', { role: 'button', name: 'X', selector: '#s' })]);
        const b = trace([step('type', { role: 'button', name: 'X', selector: '#s' })]);
        expect(diffTraces(a, b).changedSteps[0].kind).toBe('method-changed');
    });

    it('flags a changed entry URL as meaningful', () => {
        const a = trace([step('click', { role: 'link', name: 'Go', url: 'http://x/app/home' })]);
        const b = trace([step('click', { role: 'link', name: 'Go', url: 'http://x/app/data' })]);
        expect(diffTraces(a, b).changedSteps[0].kind).toBe('url-changed');
    });

    it('counts added and removed steps as meaningful drift', () => {
        const a = trace([step('click', { role: 'button', name: 'A', selector: '#a' })]);
        const b = trace([
            step('click', { role: 'button', name: 'A', selector: '#a' }),
            step('click', { role: 'button', name: 'B', selector: '#b' }),
        ]);
        const added = diffTraces(a, b);
        expect(added.addedSteps).toBe(1);
        expect(added.meaningfulDrift).toBe(1);

        const removed = diffTraces(b, a);
        expect(removed.removedSteps).toBe(1);
        expect(removed.meaningfulDrift).toBe(1);
    });
});
