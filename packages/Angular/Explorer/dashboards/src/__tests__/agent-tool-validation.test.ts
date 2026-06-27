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
});
