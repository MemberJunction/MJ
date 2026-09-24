// packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/merge-panel-validation.test.ts
import { describe, it, expect } from 'vitest';
import { ValidationErrorInfo, ValidationResult } from '@memberjunction/global';
import { MergePanelValidation } from '../merge-panel-validation';

function result(success: boolean, ...messages: string[]): ValidationResult {
    const r = new ValidationResult();
    r.Success = success;
    r.Errors = messages.map((m) => new ValidationErrorInfo('panel', m, null));
    return r;
}

describe('MergePanelValidation', () => {
    it('returns the base result untouched when there are no panels', () => {
        const base = result(true);
        expect(MergePanelValidation(base, [])).toBe(base);
    });

    it('fails when any panel fails and concatenates errors in order', () => {
        const merged = MergePanelValidation(result(true), [result(true), result(false, 'Amount required')]);
        expect(merged.Success).toBe(false);
        expect(merged.Errors.map((e) => e.Message)).toEqual(['Amount required']);
    });

    it('keeps base errors first', () => {
        const merged = MergePanelValidation(result(false, 'Name required'), [result(false, 'Amount required')]);
        expect(merged.Errors.map((e) => e.Message)).toEqual(['Name required', 'Amount required']);
    });
});
