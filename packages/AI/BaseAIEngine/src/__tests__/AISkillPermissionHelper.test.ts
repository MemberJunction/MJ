/**
 * Unit tests for AISkillPermissionHelper.
 *
 * Focuses on the PURE static `ComputeEffectivePermissions` core — owner short-circuit,
 * open-by-default (no rows), no-match denial, the Delete → Edit → Run → View hierarchy,
 * OR-aggregation across matching rows, and skill-ID isolation. Mirrors the sibling
 * `AIAgentPermissionHelper.test.ts` mocking style (no engine/Config needed for the pure core).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {
        ID: string = '';
        UserRoles: Array<{ RoleID: string }> = [];
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAISkillEntity: class {},
    MJAISkillPermissionEntity: class {},
}));

// AISkillPermissionHelper imports AIEngineBase from './BaseAIEngine'; the pure static core never
// touches it, but the module-level import must resolve, so provide a light stub.
vi.mock('../BaseAIEngine', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Skills() { return []; },
            get SkillPermissions() { return []; },
        }
    }
}));

import { AISkillPermissionHelper } from '../AISkillPermissionHelper';
import type { MJAISkillEntity, MJAISkillPermissionEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

// UUIDs (mixed case to keep the UUIDsEqual case-insensitive path honest).
const SKILL_1 = 'AAAAAAAA-0000-0000-0000-000000000001';
const SKILL_2 = 'BBBBBBBB-0000-0000-0000-000000000002';
const OWNER_ID = 'CCCCCCCC-0000-0000-0000-00000000OWNR';
const USER_2 = 'DDDDDDDD-0000-0000-0000-000000000002';
const OTHER_USER = 'EEEEEEEE-0000-0000-0000-0000000OTHER';
const ROLE_ADMIN = 'FFFFFFFF-0000-0000-0000-00000000ADMN';

function createSkill(id: string, createdByUserId: string | null): MJAISkillEntity {
    return { ID: id, CreatedByUserID: createdByUserId } as unknown as MJAISkillEntity;
}

function createPermission(row: {
    SkillID: string;
    UserID?: string | null;
    RoleID?: string | null;
    CanView?: boolean;
    CanRun?: boolean;
    CanEdit?: boolean;
    CanDelete?: boolean;
}): MJAISkillPermissionEntity {
    return {
        SkillID: row.SkillID,
        UserID: row.UserID ?? null,
        RoleID: row.RoleID ?? null,
        CanView: row.CanView ?? false,
        CanRun: row.CanRun ?? false,
        CanEdit: row.CanEdit ?? false,
        CanDelete: row.CanDelete ?? false,
    } as unknown as MJAISkillPermissionEntity;
}

function createUser(id: string, roleIds: string[] = []): UserInfo {
    return {
        ID: id,
        UserRoles: roleIds.map(rid => ({ RoleID: rid })),
    } as unknown as UserInfo;
}

describe('AISkillPermissionHelper', () => {
    describe('ComputeEffectivePermissions', () => {
        it('grants all permissions to the owner (CreatedByUserID === user.ID)', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const user = createUser(OWNER_ID);

            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [], user);
            expect(perms).toEqual({
                canView: true,
                canRun: true,
                canEdit: true,
                canDelete: true,
                isOwner: true,
            });
        });

        it('is open by default: no permission rows → View + Run for everyone, Edit/Delete false', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const user = createUser(USER_2);

            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [], user);
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
            expect(perms.isOwner).toBe(false);
        });

        it('denies all when rows exist for the skill but none match the user (by user or role)', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [createPermission({ SkillID: SKILL_1, UserID: OTHER_USER, CanView: true, CanRun: true, CanEdit: true, CanDelete: true })],
                createUser(USER_2, ['some-unrelated-role'])
            );
            expect(perms.canView).toBe(false);
            expect(perms.canRun).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
            expect(perms.isOwner).toBe(false);
        });

        it('direct user grant with only CanRun → canRun + canView (hierarchy), canEdit/canDelete false', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [createPermission({ SkillID: SKILL_1, UserID: USER_2, CanRun: true })],
                createUser(USER_2)
            );
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('role grant (row.RoleID in user.UserRoles) with CanEdit → canEdit + canRun + canView, canDelete false', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [createPermission({ SkillID: SKILL_1, RoleID: ROLE_ADMIN, CanEdit: true })],
                createUser(USER_2, [ROLE_ADMIN])
            );
            expect(perms.canEdit).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
            expect(perms.canDelete).toBe(false);
        });

        it('CanDelete → all four true (top of the hierarchy)', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [createPermission({ SkillID: SKILL_1, UserID: USER_2, CanDelete: true })],
                createUser(USER_2)
            );
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
        });

        it('OR-aggregates across multiple matching rows (one CanView, another CanEdit)', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [
                    createPermission({ SkillID: SKILL_1, UserID: USER_2, CanView: true }),
                    createPermission({ SkillID: SKILL_1, RoleID: ROLE_ADMIN, CanEdit: true }),
                ],
                createUser(USER_2, [ROLE_ADMIN])
            );
            // CanEdit (role) implies Run + View; the separate CanView row is redundant.
            expect(perms.canEdit).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
            expect(perms.canDelete).toBe(false);
        });

        it('ignores rows for a DIFFERENT skill ID (falls through to open-by-default)', () => {
            const skill = createSkill(SKILL_1, OWNER_ID);
            const perms = AISkillPermissionHelper.ComputeEffectivePermissions(
                skill,
                [createPermission({ SkillID: SKILL_2, UserID: USER_2, CanView: true, CanRun: true, CanEdit: true, CanDelete: true })],
                createUser(USER_2)
            );
            // No rows for SKILL_1 → open by default.
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
            expect(perms.isOwner).toBe(false);
        });
    });
});
