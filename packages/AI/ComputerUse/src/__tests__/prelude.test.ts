import { describe, it, expect } from 'vitest';
import { evaluatePreludeLanding } from '../engine/prelude.js';

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
