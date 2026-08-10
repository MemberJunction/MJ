import { describe, it, expect } from 'vitest';
import { reresolveTarget, shouldAcceptHeal, isSelectorHealable, DEFAULT_HEAL_CONFIDENCE_THRESHOLD } from '../engine/heal-decision.js';
import { InteractiveElement } from '../types/browser.js';
import { TraceTarget } from '../types/trace.js';

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
        const r = reresolveTarget(target('button', 'Save'), [
            el(0, 'link', 'Home', '#home'),
            el(1, 'button', 'Save', '#save-new'),
        ]);
        expect(r.confidence).toBeGreaterThanOrEqual(DEFAULT_HEAL_CONFIDENCE_THRESHOLD);
        expect(r.selector).toBe('#save-new');
    });

    it('is ambiguous (below the gate) when multiple elements match role+name', () => {
        const r = reresolveTarget(target('button', 'Save'), [
            el(0, 'button', 'Save', '#a'),
            el(1, 'button', 'Save', '#b'),
        ]);
        expect(shouldAcceptHeal(r.confidence)).toBe(false);
        expect(r.reason).toContain('ambiguous');
    });

    it('falls back to a unique name-substring match at threshold confidence', () => {
        const r = reresolveTarget(target(undefined, 'Save'), [
            el(0, 'button', 'Save Record', '#save'),
            el(1, 'link', 'Cancel', '#cancel'),
        ]);
        expect(r.selector).toBe('#save');
        expect(r.confidence).toBe(0.6);
    });

    it('returns zero confidence when nothing matches', () => {
        const r = reresolveTarget(target('button', 'Delete'), [el(0, 'link', 'Home', '#home')]);
        expect(r.confidence).toBe(0);
        expect(r.selector).toBeUndefined();
    });

    it('returns zero confidence when the recorded target has no role/name', () => {
        expect(reresolveTarget(new TraceTarget(), [el(0, 'button', 'Save', '#s')]).confidence).toBe(0);
    });
});

describe('shouldAcceptHeal (mabl gate)', () => {
    it('accepts at/above threshold, rejects below', () => {
        expect(shouldAcceptHeal(0.9)).toBe(true);
        expect(shouldAcceptHeal(DEFAULT_HEAL_CONFIDENCE_THRESHOLD)).toBe(true);
        expect(shouldAcceptHeal(0.3)).toBe(false);
    });
});

describe('isSelectorHealable (flow-vs-selector drift)', () => {
    it('treats precondition/action divergence as selector-healable', () => {
        expect(isSelectorHealable('precondition — target never became visible')).toBe(true);
        expect(isSelectorHealable('action Click failed — not found')).toBe(true);
    });
    it('treats postcondition (flow) divergence as NOT selector-healable', () => {
        expect(isSelectorHealable('postcondition — URL mismatch')).toBe(false);
    });
});
