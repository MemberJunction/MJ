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
    ValidateEnumParam,
    ValidateStringParam,
    ValidateNonNegativeNumberParam,
    BoundNameList,
    AGENT_CONTEXT_NAME_LIST_CAP,
} from '../shared/agent-tool-validation';

describe('agent-tool-validation', () => {
    describe('validateEnumParam', () => {
        const allowed = ['engines', 'redundant', 'performance', 'cache'] as const;

        it('accepts an allowed value and narrows it', () => {
            const r = ValidateEnumParam('performance', allowed, 'section');
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toBe('performance');
        });

        it('rejects a value not in the allowed set with a descriptive message', () => {
            const r = ValidateEnumParam('hacker', allowed, 'section');
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.result.Success).toBe(false);
                expect(r.result.ErrorMessage).toContain('hacker');
                expect(r.result.ErrorMessage).toContain('engines');
            }
        });

        it('rejects undefined without throwing', () => {
            const r = ValidateEnumParam(undefined, allowed, 'section');
            expect(r.ok).toBe(false);
        });

        it('rejects a non-string (number) without throwing', () => {
            const r = ValidateEnumParam(42, allowed, 'section');
            expect(r.ok).toBe(false);
        });

        it('rejects an empty string', () => {
            const r = ValidateEnumParam('', allowed, 'section');
            expect(r.ok).toBe(false);
        });
    });

    describe('validateStringParam', () => {
        it('accepts a string (including empty)', () => {
            expect(ValidateStringParam('hello', 'searchText')).toEqual({ ok: true, value: 'hello' });
            expect(ValidateStringParam('', 'searchText')).toEqual({ ok: true, value: '' });
        });

        it('rejects a non-string with a typed failure', () => {
            const r = ValidateStringParam(123, 'searchText');
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.result.Success).toBe(false);
                expect(r.result.ErrorMessage).toContain('searchText');
            }
        });

        it('rejects null/undefined without throwing', () => {
            expect(ValidateStringParam(null, 'searchText').ok).toBe(false);
            expect(ValidateStringParam(undefined, 'searchText').ok).toBe(false);
        });
    });

    describe('validateNonNegativeNumberParam', () => {
        it('accepts a non-negative number', () => {
            expect(ValidateNonNegativeNumberParam(500, 'thresholdMs')).toEqual({ ok: true, value: 500 });
            expect(ValidateNonNegativeNumberParam(0, 'thresholdMs')).toEqual({ ok: true, value: 0 });
        });

        it('coerces a numeric string', () => {
            const r = ValidateNonNegativeNumberParam('250', 'thresholdMs');
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value).toBe(250);
        });

        it('rejects a negative number', () => {
            const r = ValidateNonNegativeNumberParam(-5, 'thresholdMs');
            expect(r.ok).toBe(false);
        });

        it('rejects a non-numeric string without throwing', () => {
            const r = ValidateNonNegativeNumberParam('abc', 'thresholdMs');
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.result.ErrorMessage).toContain('thresholdMs');
        });

        it('rejects NaN / Infinity', () => {
            expect(ValidateNonNegativeNumberParam(NaN, 'thresholdMs').ok).toBe(false);
            expect(ValidateNonNegativeNumberParam(Infinity, 'thresholdMs').ok).toBe(false);
        });
    });

    describe('boundNameList', () => {
        it('returns the full list when under the cap', () => {
            const names = ['A', 'B', 'C'];
            expect(BoundNameList(names)).toEqual(['A', 'B', 'C']);
        });

        it('truncates to the default cap when over it', () => {
            const names = Array.from({ length: 100 }, (_, i) => `Q${i}`);
            const result = BoundNameList(names);
            expect(result).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(result[0]).toBe('Q0');
            expect(result[AGENT_CONTEXT_NAME_LIST_CAP - 1]).toBe(`Q${AGENT_CONTEXT_NAME_LIST_CAP - 1}`);
        });

        it('honors an explicit cap', () => {
            expect(BoundNameList(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
        });

        it('returns a new array — never mutates the input', () => {
            const names = ['x', 'y'];
            const result = BoundNameList(names);
            expect(result).not.toBe(names);
            expect(names).toEqual(['x', 'y']);
        });

        it('handles an empty list', () => {
            expect(BoundNameList([])).toEqual([]);
        });

        it('falls back to the default cap for a negative or non-finite cap', () => {
            const names = Array.from({ length: 30 }, (_, i) => `N${i}`);
            expect(BoundNameList(names, -5)).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(BoundNameList(names, NaN)).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
        });

        it('treats cap 0 as an empty result', () => {
            expect(BoundNameList(['a', 'b'], 0)).toEqual([]);
        });
    });
});
