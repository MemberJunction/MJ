import { LogError, UserInfo } from "@memberjunction/core";
import { NormalizeUUID, UUIDsEqual, UUIDSet } from "@memberjunction/global";
import type { MJAIAgentEntity, MJAIAgentPermissionEntity } from "@memberjunction/core-entities";
import { AIEngineBase } from "./BaseAIEngine";

const MAX_INHERITANCE_DEPTH = 5;

/**
 * Effective permissions for a user on a specific AI agent
 */
export interface EffectiveAgentPermissions {
    canView: boolean;
    canRun: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isOwner: boolean;
}

/**
 * Minimal structural subset of `MJAIAgentEntity` needed to evaluate 2x2 RBAC and
 * ancestor `CanRun` invariants synchronously.
 */
export type AgentPermissionSubject = Pick<MJAIAgentEntity, 'ID' | 'OwnerUserID'> &
    Partial<Pick<MJAIAgentEntity, 'BaseAgentID'>>;

/**
 * Helper class for managing AI Agent permissions.
 *
 * Implements the 2x2 RBAC matrix over `MJ: AI Agent Permissions`:
 * - **Root catalog agent (`BaseAgentID == null`) + 0 ACL rows**: Public (`canView + canRun`; `OwnerUserID` has `canEdit + canDelete`).
 * - **Root catalog agent (`BaseAgentID == null`) + >=1 ACL rows**: RBAC-scoped (`OwnerUserID` + matching `UserID`/`RoleID` rows).
 * - **Derived agent (`BaseAgentID != null`) + 0 ACL rows**: Private personal instance (`OwnerUserID` only).
 * - **Derived agent (`BaseAgentID != null`) + >=1 ACL rows**: Shared department/team derived agent (`OwnerUserID` + matching `UserID`/`RoleID` rows).
 *
 * **Ancestor `CanRun` Invariant**: Effective `canRun` on any derived agent requires `canRun`
 * on EVERY ancestor in its `BaseAgentID` chain (up to `MAX_AGENT_INHERITANCE_DEPTH = 5`).
 */
export class AIAgentPermissionHelper {
    /**
     * Pure synchronous computation of effective permissions for a single agent row WITHOUT
     * walking `BaseAgentID` ancestors. Applies the 2x2 zero-ACL rule and hierarchical
     * permission implication (`Delete -> Edit -> Run -> View`).
     */
    private static computeDirectPermissions(
        agent: AgentPermissionSubject,
        allPermissions: readonly MJAIAgentPermissionEntity[],
        user: UserInfo,
        userRoleIds: UUIDSet
    ): EffectiveAgentPermissions {
        const isOwner = UUIDsEqual(agent.OwnerUserID, user.ID);
        if (isOwner) {
            return {
                canView: true,
                canRun: true,
                canEdit: true,
                canDelete: true,
                isOwner: true,
            };
        }

        const agentPermissions = allPermissions.filter(p => UUIDsEqual(p.AgentID, agent.ID));

        if (agentPermissions.length === 0) {
            // 2x2 matrix: derived agents with 0 ACL rows are private to OwnerUserID;
            // root catalog agents with 0 ACL rows remain open (View + Run) by default.
            const isDerived = agent.BaseAgentID != null && String(agent.BaseAgentID).trim().length > 0;
            if (isDerived) {
                return {
                    canView: false,
                    canRun: false,
                    canEdit: false,
                    canDelete: false,
                    isOwner: false,
                };
            }
            return {
                canView: true,
                canRun: true,
                canEdit: false,
                canDelete: false,
                isOwner: false,
            };
        }

        const matchingPermissions = agentPermissions.filter(
            p => UUIDsEqual(p.UserID, user.ID) || (p.RoleID != null && userRoleIds.Has(p.RoleID))
        );

        const hasDelete = matchingPermissions.some(p => p.CanDelete === true);
        const hasEdit = matchingPermissions.some(p => p.CanEdit === true);
        const hasRun = matchingPermissions.some(p => p.CanRun === true);
        const hasView = matchingPermissions.some(p => p.CanView === true);

        const canDelete = hasDelete;
        const canEdit = hasDelete || hasEdit;
        const canRun = hasDelete || hasEdit || hasRun;
        const canView = hasDelete || hasEdit || hasRun || hasView;

        return {
            canView,
            canRun,
            canEdit,
            canDelete,
            isOwner: false,
        };
    }

    /**
     * Pure synchronous computation of effective permissions including the 2x2 RBAC matrix
     * AND the Ancestor `CanRun` Invariant across the `BaseAgentID` inheritance chain.
     *
     * Used by both async {@link GetEffectivePermissions} and sync `AIEngineBase` directory/picker
     * checks so every surface enforces identical semantics with zero drift.
     */
    public static ComputeEffectivePermissionsSync(
        agent: AgentPermissionSubject,
        allAgents: readonly AgentPermissionSubject[],
        allPermissions: readonly MJAIAgentPermissionEntity[],
        user: UserInfo,
        precomputedUserRoleIds?: UUIDSet
    ): EffectiveAgentPermissions {
        const userRoleIds = precomputedUserRoleIds ?? new UUIDSet(user.UserRoles?.map(ur => ur.RoleID) ?? []);
        const direct = this.computeDirectPermissions(agent, allPermissions, user, userRoleIds);

        // Enforce Ancestor CanRun Invariant for derived agents: effective canRun requires
        // canRun on every ancestor along the BaseAgentID chain.
        if (direct.canRun && agent.BaseAgentID) {
            const visited = new UUIDSet([agent.ID]);
            let currentBaseId: string | null | undefined = agent.BaseAgentID;
            let depth = 0;

            while (currentBaseId && depth < MAX_INHERITANCE_DEPTH) {
                if (visited.Has(currentBaseId)) {
                    // Cycle guard: fail closed for canRun
                    direct.canRun = false;
                    break;
                }
                visited.Add(currentBaseId);
                const ancestor = allAgents.find(a => UUIDsEqual(a.ID, currentBaseId));
                if (!ancestor) {
                    // Missing/RLS-hidden ancestor: fail closed so user cannot run child
                    // of a template they no longer have access to.
                    direct.canRun = false;
                    break;
                }
                const ancDirect = this.computeDirectPermissions(ancestor, allPermissions, user, userRoleIds);
                if (!ancDirect.canRun) {
                    direct.canRun = false;
                    break;
                }
                currentBaseId = ancestor.BaseAgentID;
                depth++;
            }

            if (currentBaseId && depth >= MAX_INHERITANCE_DEPTH) {
                // Exceeds max inheritance depth: fail closed
                direct.canRun = false;
            }
        }

        return direct;
    }

    /**
     * Checks if a user has a specific permission for an agent.
     * @param agentId - The ID of the agent to check
     * @param user - The user to check permissions for
     * @param permission - The permission level to check ('view', 'run', 'edit', or 'delete')
     * @returns True if the user has the specified permission
     */
    public static async HasPermission(
        agentId: string,
        user: UserInfo,
        permission: 'view' | 'run' | 'edit' | 'delete'
    ): Promise<boolean> {
        const effective = await this.GetEffectivePermissions(agentId, user);

        switch (permission) {
            case 'view':
                return effective.canView;
            case 'run':
                return effective.canRun;
            case 'edit':
                return effective.canEdit;
            case 'delete':
                return effective.canDelete;
            default:
                return false;
        }
    }

    /**
     * Gets the aggregate permissions for a user on a specific agent.
     * Enforces the 2x2 RBAC matrix and the Ancestor `CanRun` Invariant across `BaseAgentID`.
     * @param agentId - The ID of the agent
     * @param user - The user to check permissions for
     * @returns Object containing all effective permissions and ownership status
     */
    public static async GetEffectivePermissions(
        agentId: string,
        user: UserInfo
    ): Promise<EffectiveAgentPermissions> {
        try {
            // Ensure AIEngineBase is loaded with cached metadata
            await AIEngineBase.Instance.Config(false, user);

            const allAgents = AIEngineBase.Instance.Agents;
            const agent = allAgents.find(a => UUIDsEqual(a.ID, agentId));
            if (!agent) {
                throw new Error(`Agent ${agentId} not found in cached metadata`);
            }

            return this.ComputeEffectivePermissionsSync(
                agent,
                allAgents,
                AIEngineBase.Instance.AgentPermissions,
                user
            );
        } catch (error) {
            // The second parameter of LogError is a log FILE NAME, not context. Passing the message
            // there wrote a file called "Error getting effective permissions for agent" into the
            // process working directory on every failure, and the message itself never reached the
            // log — so a permission check that failed closed left no trace anyone would look at.
            LogError(`Error getting effective permissions for agent: ${error instanceof Error ? error.message : String(error)}`);
            // Fail closed - deny all permissions on error
            return {
                canView: false,
                canRun: false,
                canEdit: false,
                canDelete: false,
                isOwner: false
            };
        }
    }

    /**
     * Gets all agents that a user has access to with a specific permission level.
     * Uses cached metadata from AIEngineBase instead of querying database.
     * @param user - The user to check permissions for
     * @param permission - The minimum permission level required ('view', 'run', 'edit', or 'delete')
     * @returns Array of agents the user can access with the specified permission
     */
    public static async GetAccessibleAgents(
        user: UserInfo,
        permission: 'view' | 'run' | 'edit' | 'delete'
    ): Promise<MJAIAgentEntity[]> {
        try {
            // Ensure AIEngineBase is loaded with cached metadata
            await AIEngineBase.Instance.Config(false, user);

            // Filter agents from cached metadata based on permissions
            const accessibleAgents: MJAIAgentEntity[] = [];

            for (const agent of AIEngineBase.Instance.Agents) {
                const hasAccess = await this.HasPermission(agent.ID, user, permission);
                if (hasAccess) {
                    accessibleAgents.push(agent);
                }
            }

            return accessibleAgents;
        } catch (error) {
            LogError(error, 'Error getting accessible agents');
            return [];
        }
    }

    /**
     * Narrows `agents` to the ones `user` may run: the 'run' permission, and Active only unless
     * `includeInactive`. Keeps the input order.
     *
     * This is the filter the Find Best Agent / Find Candidate Agents actions apply to their search
     * results, and the one agent decision discovery applies to the whole catalog, so both offer the
     * same agents.
     * @param agents - The agents to filter, e.g. search results or the whole catalog
     * @param user - The user who would run them
     * @param includeInactive - Keep agents whose Status is not 'Active'. Default false.
     * @returns The agents the user may run, in their original order
     */
    public static async FilterRunnableAgents<T extends Pick<MJAIAgentEntity, 'ID' | 'Status'>>(
        agents: T[],
        user: UserInfo,
        includeInactive: boolean = false
    ): Promise<T[]> {
        const accessibleAgents = await this.GetAccessibleAgents(user, 'run');
        const accessibleAgentIds = new Set(accessibleAgents.map(a => NormalizeUUID(a.ID)));
        const runnable = agents.filter(a => accessibleAgentIds.has(NormalizeUUID(a.ID)));
        return includeInactive ? runnable : runnable.filter(a => a.Status === 'Active');
    }

    /**
     * Whether an agent is meant to be found and delegated to directly. Sub-Agents, child agents
     * (`ParentID`), and instantiation-required prototype templates (`InstantiationMode === 'Required'`)
     * are not directly discoverable for ad-hoc delegation — users and orchestrators like Sage
     * delegate to the user's materialized derived instance instead.
     * @param agent - The agent to check
     * @returns True when the agent can be discovered directly
     */
    public static IsDirectlyDiscoverable(
        agent: Pick<MJAIAgentEntity, 'InvocationMode' | 'ParentID'> &
            Partial<Pick<MJAIAgentEntity, 'InstantiationMode'>>
    ): boolean {
        return (
            agent.InvocationMode !== 'Sub-Agent' &&
            !agent.ParentID &&
            agent.InstantiationMode !== 'Required'
        );
    }

    /**
     * Clears the AIEngineBase cache. Useful when permissions have been modified.
     * This forces a reload of all cached metadata including permissions.
     */
    public static ClearCache(): void {
        // Force reload by calling Config with forceRefresh=true
        AIEngineBase.Instance.Config(true).catch(error => {
            LogError(error, 'Error clearing AIEngineBase cache');
        });
    }

    /**
     * Refreshes the AIEngineBase cache to pick up permission changes.
     * @param user - The user context for server-side operations
     */
    public static async RefreshCache(user: UserInfo): Promise<void> {
        try {
            await AIEngineBase.Instance.Config(true, user);
        } catch (error) {
            LogError(error, 'Error refreshing AIEngineBase cache');
        }
    }
}
