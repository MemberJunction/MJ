import { LogError, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJAISkillEntity, MJAISkillPermissionEntity } from "@memberjunction/core-entities";
import { AIEngineBase } from "./BaseAIEngine";

/**
 * Effective permissions for a user on a specific AI skill.
 */
export interface EffectiveSkillPermissions {
    canView: boolean;
    canRun: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isOwner: boolean;
}

/**
 * Helper for AI Skill permissions — the runtime, cached, **open-by-default** access path.
 *
 * This is the skill sibling of {@link AIAgentPermissionHelper} and behaves identically:
 * it reads the `AIEngineBase` in-memory caches (`Skills` + `SkillPermissions`) so checks are
 * synchronous cache hits, and applies the same defaults —
 * - **no permission rows for a skill → anyone can View and Run** (open by default), only the
 *   owner (`AISkill.CreatedByUserID`) can Edit/Delete;
 * - **rows exist → only matching User/Role grants apply**, OR-aggregated, with the hierarchy
 *   Delete → Edit → Run → View.
 *
 * Contrast with `AISkillPermissionProvider` (the unified-engine wrapper in `core-entities`),
 * which is closed-by-default and reports only explicit grants — that path powers the Sharing
 * Center and audit; this path is the hot runtime gate (the `/skill` picker and the
 * server-side RequestedSkills intersection). See guides/UNIFIED_PERMISSIONS_GUIDE.md.
 */
export class AISkillPermissionHelper {
    /**
     * Checks whether a user has a specific permission on a skill.
     * @param skillId - The skill to check.
     * @param user - The user to check for.
     * @param permission - 'view' | 'run' | 'edit' | 'delete'.
     */
    public static async HasPermission(
        skillId: string,
        user: UserInfo,
        permission: 'view' | 'run' | 'edit' | 'delete'
    ): Promise<boolean> {
        const effective = await this.GetEffectivePermissions(skillId, user);
        switch (permission) {
            case 'view':   return effective.canView;
            case 'run':    return effective.canRun;
            case 'edit':   return effective.canEdit;
            case 'delete': return effective.canDelete;
            default:       return false;
        }
    }

    /**
     * Gets the aggregate effective permissions for a user on a skill (async — ensures the
     * engine cache is loaded first, then delegates to the synchronous core).
     */
    public static async GetEffectivePermissions(
        skillId: string,
        user: UserInfo
    ): Promise<EffectiveSkillPermissions> {
        try {
            await AIEngineBase.Instance.Config(false, user);
            const skill = AIEngineBase.Instance.Skills.find(s => UUIDsEqual(s.ID, skillId));
            if (!skill) {
                throw new Error(`Skill ${skillId} not found in cached metadata`);
            }
            return this.ComputeEffectivePermissions(skill, AIEngineBase.Instance.SkillPermissions, user);
        } catch (error) {
            LogError(error, null, 'Error getting effective permissions for skill');
            // Fail closed — deny all on error.
            return { canView: false, canRun: false, canEdit: false, canDelete: false, isOwner: false };
        }
    }

    /**
     * Synchronous core of the permission calculation, operating on already-loaded cache arrays.
     * Exposed so hot-path callers (e.g. `AIEngineBase.GetSkillsForAgent(agent, user)`) can filter
     * without an async round-trip once the engine is configured.
     *
     * @param skill - The skill entity (owner is `CreatedByUserID`).
     * @param allPermissions - The full `SkillPermissions` cache (filtered internally by skill).
     * @param user - The user to evaluate for.
     */
    public static ComputeEffectivePermissions(
        skill: MJAISkillEntity,
        allPermissions: MJAISkillPermissionEntity[],
        user: UserInfo
    ): EffectiveSkillPermissions {
        // Owner has everything.
        if (UUIDsEqual(skill.CreatedByUserID, user.ID)) {
            return { canView: true, canRun: true, canEdit: true, canDelete: true, isOwner: true };
        }

        const skillPermissions = allPermissions.filter(p => UUIDsEqual(p.SkillID, skill.ID));

        // Open by default: no rows → View + Run for everyone; Edit/Delete owner-only.
        if (skillPermissions.length === 0) {
            return { canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false };
        }

        const userRoleIds = user.UserRoles?.map(ur => ur.RoleID) ?? [];
        const matching = skillPermissions.filter(p =>
            (p.UserID && UUIDsEqual(p.UserID, user.ID)) ||
            (p.RoleID && userRoleIds.some(rid => UUIDsEqual(rid, p.RoleID!)))
        );

        const hasDelete = matching.some(p => p.CanDelete === true);
        const hasEdit   = matching.some(p => p.CanEdit === true);
        const hasRun    = matching.some(p => p.CanRun === true);
        const hasView   = matching.some(p => p.CanView === true);

        // Hierarchy: Delete → Edit → Run → View.
        return {
            canDelete: hasDelete,
            canEdit:   hasDelete || hasEdit,
            canRun:    hasDelete || hasEdit || hasRun,
            canView:   hasDelete || hasEdit || hasRun || hasView,
            isOwner:   false
        };
    }

    /**
     * Gets all skills a user can access with at least the given permission level, from cache.
     */
    public static async GetAccessibleSkills(
        user: UserInfo,
        permission: 'view' | 'run' | 'edit' | 'delete'
    ): Promise<MJAISkillEntity[]> {
        try {
            await AIEngineBase.Instance.Config(false, user);
            const permsCache = AIEngineBase.Instance.SkillPermissions;
            return AIEngineBase.Instance.Skills.filter(skill => {
                const eff = this.ComputeEffectivePermissions(skill, permsCache, user);
                switch (permission) {
                    case 'view':   return eff.canView;
                    case 'run':    return eff.canRun;
                    case 'edit':   return eff.canEdit;
                    case 'delete': return eff.canDelete;
                    default:       return false;
                }
            });
        } catch (error) {
            LogError(error, null, 'Error getting accessible skills');
            return [];
        }
    }

    /**
     * Refreshes the AIEngineBase cache to pick up permission changes.
     */
    public static async RefreshCache(user: UserInfo): Promise<void> {
        try {
            await AIEngineBase.Instance.Config(true, user);
        } catch (error) {
            LogError(error, null, 'Error refreshing AIEngineBase cache');
        }
    }
}
