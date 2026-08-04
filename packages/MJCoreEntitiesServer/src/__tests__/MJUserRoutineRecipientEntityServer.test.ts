/**
 * Unit tests for `MJUserRoutineRecipientEntityServer.Validate()` — the recipient-exclusivity
 * invariant: **exactly one** of `UserID` / `Email` must be set (never both, never neither).
 *
 * Mirrors the `MJAISkillPermissionEntityServer` grantee-exclusivity test: the heavy generated
 * base (`MJUserRoutineRecipientEntity`) is mocked to a minimal, settable stub whose
 * `Validate()` returns a passing `ValidationResult`, so the test exercises ONLY the
 * exclusivity gate the subclass adds. `@RegisterClass` is neutralized.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationErrorType, ValidationResult } from '@memberjunction/global';

// Neutralize the class-factory registration decorator.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

// `@memberjunction/core` re-exports ValidationResult/ValidationErrorInfo/ValidationErrorType
// (from global) plus BaseEntity — keep them real so the subclass under test builds real errors.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual };
});

// Minimal settable base standing in for the generated `MJUserRoutineRecipientEntity`. Its
// Validate() returns a passing result so the subclass's added exclusivity check is under test.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJUserRoutineRecipientEntity {
        public UserID: string | null = null;
        public Email: string | null = null;
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
    }
    return { MJUserRoutineRecipientEntity: MockMJUserRoutineRecipientEntity };
});

import { MJUserRoutineRecipientEntityServer } from '../custom/MJUserRoutineRecipientEntityServer.server';

function makeEntity(fields: { UserID?: string | null; Email?: string | null }): MJUserRoutineRecipientEntityServer {
    const entity = new MJUserRoutineRecipientEntityServer();
    entity.UserID = fields.UserID ?? null;
    entity.Email = fields.Email ?? null;
    return entity;
}

describe('MJUserRoutineRecipientEntityServer.Validate — recipient exclusivity', () => {
    it('FAILS when BOTH UserID and Email are set', () => {
        const result = makeEntity({ UserID: 'USER-1', Email: 'someone@example.com' }).Validate();
        expect(result.Success).toBe(false);
        const err = result.Errors.find((e) => e.Source === 'UserID/Email');
        expect(err).toBeDefined();
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });

    it('FAILS when NEITHER UserID nor Email is set', () => {
        const result = makeEntity({ UserID: null, Email: null }).Validate();
        expect(result.Success).toBe(false);
        const err = result.Errors.find((e) => e.Source === 'UserID/Email');
        expect(err).toBeDefined();
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });

    it('FAILS when Email is only whitespace and UserID is unset (still "neither")', () => {
        const result = makeEntity({ UserID: null, Email: '   ' }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'UserID/Email')).toBe(true);
    });

    it('PASSES with only UserID set (no exclusivity error)', () => {
        const result = makeEntity({ UserID: 'USER-1' }).Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors.some((e) => e.Source === 'UserID/Email')).toBe(false);
    });

    it('PASSES with only Email set (no exclusivity error)', () => {
        const result = makeEntity({ Email: 'someone@example.com' }).Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors.some((e) => e.Source === 'UserID/Email')).toBe(false);
    });
});
