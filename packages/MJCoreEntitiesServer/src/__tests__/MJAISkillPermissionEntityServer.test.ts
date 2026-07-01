/**
 * Unit tests for `MJAISkillPermissionEntityServer.Validate()` — the grantee-exclusivity
 * invariant: **exactly one** of `UserID` / `RoleID` must be set (never both, never neither).
 *
 * The override's logic is inline (no exported pure helper), so we instantiate the subclass
 * directly. The heavy generated base (`MJAISkillPermissionEntity`) and its dependencies are
 * mocked to a minimal, settable stub whose `Validate()` returns a passing `ValidationResult`,
 * so the test exercises ONLY the exclusivity gate the subclass adds. `@RegisterClass` is
 * neutralized. `ValidationResult`/`ValidationErrorInfo`/`ValidationErrorType` are the real
 * classes (from `@memberjunction/global`).
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

// Minimal settable base standing in for the generated `MJAISkillPermissionEntity`. Its Validate()
// returns a passing result so the subclass's added exclusivity check is what's under test.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJAISkillPermissionEntity {
        public RoleID: string | null = null;
        public UserID: string | null = null;
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
    }
    return { MJAISkillPermissionEntity: MockMJAISkillPermissionEntity };
});

import { MJAISkillPermissionEntityServer } from '../custom/MJAISkillPermissionEntityServer.server';

function makeEntity(fields: { RoleID?: string | null; UserID?: string | null }): MJAISkillPermissionEntityServer {
    const entity = new MJAISkillPermissionEntityServer();
    entity.RoleID = fields.RoleID ?? null;
    entity.UserID = fields.UserID ?? null;
    return entity;
}

describe('MJAISkillPermissionEntityServer.Validate — grantee exclusivity', () => {
    it('FAILS when BOTH RoleID and UserID are set', () => {
        const result = makeEntity({ RoleID: 'ROLE-1', UserID: 'USER-1' }).Validate();
        expect(result.Success).toBe(false);
        const err = result.Errors.find((e) => e.Source === 'RoleID/UserID');
        expect(err).toBeDefined();
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });

    it('FAILS when NEITHER RoleID nor UserID is set', () => {
        const result = makeEntity({ RoleID: null, UserID: null }).Validate();
        expect(result.Success).toBe(false);
        const err = result.Errors.find((e) => e.Source === 'RoleID/UserID');
        expect(err).toBeDefined();
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });

    it('PASSES with only UserID set (no grantee error)', () => {
        const result = makeEntity({ UserID: 'USER-1' }).Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors.some((e) => e.Source === 'RoleID/UserID')).toBe(false);
    });

    it('PASSES with only RoleID set (no grantee error)', () => {
        const result = makeEntity({ RoleID: 'ROLE-1' }).Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors.some((e) => e.Source === 'RoleID/UserID')).toBe(false);
    });
});
