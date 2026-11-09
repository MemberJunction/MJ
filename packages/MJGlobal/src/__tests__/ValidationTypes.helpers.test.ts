import { describe, it, expect } from 'vitest';
import {
    AddValidationError,
    AddValidationWarning,
    FinalizeValidation,
    HasValidationFailures,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '../ValidationTypes';

function passing(): ValidationResult {
    const r = new ValidationResult();
    r.Success = true;
    return r;
}

describe('validation result helpers', () => {
    it('AddValidationError records a Failure against the source and fails the result', () => {
        const r = AddValidationError(passing(), 'Name', 'Name is required', null);
        expect(r.Success).toBe(false);
        expect(r.Errors).toHaveLength(1);
        expect(r.Errors[0]).toBeInstanceOf(ValidationErrorInfo);
        expect(r.Errors[0]).toMatchObject({ Source: 'Name', Message: 'Name is required', Value: null, Type: ValidationErrorType.Failure });
    });

    it('AddValidationWarning records a Warning and leaves Success alone', () => {
        const r = AddValidationWarning(passing(), 'Rank', 'Rank is unusually high', 900);
        expect(r.Success).toBe(true);
        expect(r.Errors[0].Type).toBe(ValidationErrorType.Warning);
    });

    it('HasValidationFailures ignores warnings and counts failures', () => {
        const r = AddValidationWarning(passing(), 'A', 'warn');
        expect(HasValidationFailures(r)).toBe(false);
        AddValidationError(r, 'B', 'fail');
        expect(HasValidationFailures(r)).toBe(true);
    });

    it('FinalizeValidation: warnings only -> Success true, even when Success was set false by a length check', () => {
        const r = AddValidationWarning(passing(), 'A', 'warn');
        r.Success = r.Success && r.Errors.length === 0; // the old idiom
        expect(r.Success).toBe(false);
        expect(FinalizeValidation(r).Success).toBe(true);
    });

    it('FinalizeValidation: a failure -> Success false, even when Success was true', () => {
        const r = passing();
        r.Errors.push(new ValidationErrorInfo('A', 'fail', null, ValidationErrorType.Failure));
        expect(FinalizeValidation(r).Success).toBe(false);
    });

    it('FinalizeValidation: no entries -> Success true, including a fresh result whose Success starts false', () => {
        expect(FinalizeValidation(new ValidationResult()).Success).toBe(true);
    });

    it('FinalizeValidation treats an entry with an unknown Type as blocking (fails closed)', () => {
        const r = passing();
        r.Errors.push({ Source: 'A', Message: 'odd', Value: null, Type: undefined } as unknown as ValidationErrorInfo);
        expect(FinalizeValidation(r).Success).toBe(false);
    });

    it('works on a plain object rebuilt from JSON (no class methods needed)', () => {
        const wire: ValidationResult = JSON.parse(JSON.stringify(AddValidationWarning(passing(), 'A', 'warn')));
        AddValidationError(wire, 'B', 'fail');
        expect(FinalizeValidation(wire).Success).toBe(false);
        expect(wire.Errors.map(e => e.Type)).toEqual([ValidationErrorType.Warning, ValidationErrorType.Failure]);
    });

    it('FinalizeValidation is idempotent', () => {
        const r = AddValidationWarning(passing(), 'A', 'warn');
        FinalizeValidation(r);
        expect(FinalizeValidation(r).Success).toBe(true);
    });
});
