/**
 * Tests for the Admin agent client-tool input validation helpers
 * (`shared/agent-tool-validation.ts`).
 *
 * These pure helpers back the SAFE, read-only client tools wired into the Admin
 * dashboards (System Diagnostics, API Keys, Query Browser). They must be
 * tolerant: reject bad input with a typed failure, never throw, and narrow good
 * input to the allowed literal type.
 */
import { describe, it, expect } from 'vitest';
import {
    validateEnumParam,
    validateStringParam,
    validateNonNegativeNumberParam,
    boundNameList,
    AGENT_CONTEXT_NAME_LIST_CAP,
} from '../shared/agent-tool-validation';

describe('agent-tool-validation', () => {
    describe('validateEnumParam', () => {
        const allowed = ['engines', 'redundant', 'performance', 'cache'] as const;

        it('accepts an allowed value and narrows it', () => {
            const r = validateEnumParam('performance', allowed, 'section');
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toBe('performance');
        });

        it('rejects a value not in the allowed set with a descriptive message', () => {
            const r = validateEnumParam('hacker', allowed, 'section');
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.result.Success).toBe(false);
                expect(r.result.ErrorMessage).toContain('hacker');
                expect(r.result.ErrorMessage).toContain('engines');
            }
        });

        it('rejects undefined without throwing', () => {
            const r = validateEnumParam(undefined, allowed, 'section');
            expect(r.ok).toBe(false);
        });

        it('rejects a non-string (number) without throwing', () => {
            const r = validateEnumParam(42, allowed, 'section');
            expect(r.ok).toBe(false);
        });

        it('rejects an empty string', () => {
            const r = validateEnumParam('', allowed, 'section');
            expect(r.ok).toBe(false);
        });
    });

    describe('validateStringParam', () => {
        it('accepts a string (including empty)', () => {
            expect(validateStringParam('hello', 'searchText')).toEqual({ ok: true, value: 'hello' });
            expect(validateStringParam('', 'searchText')).toEqual({ ok: true, value: '' });
        });

        it('rejects a non-string with a typed failure', () => {
            const r = validateStringParam(123, 'searchText');
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.result.Success).toBe(false);
                expect(r.result.ErrorMessage).toContain('searchText');
            }
        });

        it('rejects null/undefined without throwing', () => {
            expect(validateStringParam(null, 'searchText').ok).toBe(false);
            expect(validateStringParam(undefined, 'searchText').ok).toBe(false);
        });
    });

    describe('validateNonNegativeNumberParam', () => {
        it('accepts a non-negative number', () => {
            expect(validateNonNegativeNumberParam(500, 'thresholdMs')).toEqual({ ok: true, value: 500 });
            expect(validateNonNegativeNumberParam(0, 'thresholdMs')).toEqual({ ok: true, value: 0 });
        });

        it('coerces a numeric string', () => {
            const r = validateNonNegativeNumberParam('250', 'thresholdMs');
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toBe(250);
        });

        it('rejects a negative number', () => {
            const r = validateNonNegativeNumberParam(-5, 'thresholdMs');
            expect(r.ok).toBe(false);
        });

        it('rejects a non-numeric string without throwing', () => {
            const r = validateNonNegativeNumberParam('abc', 'thresholdMs');
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.result.ErrorMessage).toContain('thresholdMs');
        });

        it('rejects NaN / Infinity', () => {
            expect(validateNonNegativeNumberParam(NaN, 'thresholdMs').ok).toBe(false);
            expect(validateNonNegativeNumberParam(Infinity, 'thresholdMs').ok).toBe(false);
        });
    });

    describe('boundNameList', () => {
        it('returns the full list when under the cap', () => {
            const names = ['A', 'B', 'C'];
            expect(boundNameList(names)).toEqual(['A', 'B', 'C']);
        });

        it('truncates to the default cap when over it', () => {
            const names = Array.from({ length: 100 }, (_, i) => `Q${i}`);
            const result = boundNameList(names);
            expect(result).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(result[0]).toBe('Q0');
            expect(result[AGENT_CONTEXT_NAME_LIST_CAP - 1]).toBe(`Q${AGENT_CONTEXT_NAME_LIST_CAP - 1}`);
        });

        it('honors an explicit cap', () => {
            expect(boundNameList(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
        });

        it('returns a new array — never mutates the input', () => {
            const names = ['x', 'y'];
            const result = boundNameList(names);
            expect(result).not.toBe(names);
            expect(names).toEqual(['x', 'y']);
        });

        it('handles an empty list', () => {
            expect(boundNameList([])).toEqual([]);
        });

        it('falls back to the default cap for a negative or non-finite cap', () => {
            const names = Array.from({ length: 30 }, (_, i) => `N${i}`);
            expect(boundNameList(names, -5)).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(boundNameList(names, NaN)).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
        });

        it('treats cap 0 as an empty result', () => {
            expect(boundNameList(['a', 'b'], 0)).toEqual([]);
        });
    });
});
