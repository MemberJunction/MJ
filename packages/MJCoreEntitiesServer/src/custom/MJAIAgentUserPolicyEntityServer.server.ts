import { AsyncLocalStorage } from 'node:async_hooks';
import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { MJAIAgentEntity, MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import {
    AgentPolicyBaselineSnapshot,
    AgentUserPolicyEngine,
    ApplyDefaultAgentUserPolicyValues,
    MAX_AGENT_INHERITANCE_DEPTH,
} from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

AgentUserPolicyEngine.Instance.RegisterExecutingAgentContextStore(new AsyncLocalStorage<string>());

/**
 * Server-side `MJ: AI Agent User Policies` entity: a user's agent policy is private to that user.
 *
 * 1. **Ownership** — a non-Owner-type context user may only save the policy whose `UserID` is
 *    their own, compared against the PRE-save owner so reassigning `UserID` cannot bypass it.
 *    Owner-type users (administrators, the scheduler's system user) are exempt.
 * 2. **Owner attribution** — first save defaults `UserID` to the context user when unset.
 * 3. **Agent self-modification, template-to-child onboarding & non-widening**:
 *    - When a save executes inside an agent turn (`ExecutingAgentID` or
 *      `AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID()`), the executing agent may modify:
 *      (a) its own policy (`AgentID === activeAgentId`), OR
 *      (b) a newly minted / owned derived child instance's policy when `activeAgentId` is an ancestor
 *          in `this.AgentID`'s `BaseAgentID` inheritance chain AND `derivedAgent.OwnerUserID === ContextCurrentUser.ID`
 *          (enabling Grok-Bot template onboarding to initialize *Pepper*'s policy atomically!).
 *    - In both cases, `DetectAgentPolicyWidening` enforces that privileges can NEVER widen beyond
 *      either the pre-save baseline or any ancestor template policy ceiling!
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent User Policies')
export class MJAIAgentUserPolicyEntityServer extends MJAIAgentUserPolicyEntity {
    /**
     * Optional explicit executing-agent ID set by callers running on behalf of an agent.
     * When unset, falls back to `AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID()`.
     */
    public ExecutingAgentID: string | null = null;

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved) {
            if (!this.UserID && this.ContextCurrentUser) {
                this.UserID = this.ContextCurrentUser.ID;
            }
            ApplyDefaultAgentUserPolicyValues(this);
        }
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateOwnership(result);
        this.validateAgentContextNonWideningSync(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        this.validateOwnership(result);
        await this.validateAgentContextNonWideningAsync(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    private validateOwnership(result: ValidationResult): void {
        const user = this.ContextCurrentUser;
        if (!user || user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const preSaveOwnerId = (this.GetFieldByName('UserID')?.OldValue as string | null | undefined) ?? this.UserID;
        if (preSaveOwnerId && !UUIDsEqual(preSaveOwnerId, user.ID)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'UserID',
                    'An agent policy is private to its user — you can only modify your own policy.',
                    this.UserID,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    /**
     * Checks cached `AIEngineBase` metadata synchronously to see whether `activeAgentId` is a
     * `BaseAgentID` ancestor of `targetAgentId` and `targetAgentId` is owned by `ownerUserId`.
     */
    private findCachedAncestorChainForDerivedChild(
        targetAgentId: string,
        activeAgentId: string,
        ownerUserId: string | null | undefined
    ): string[] | null {
        if (!targetAgentId || !activeAgentId || !ownerUserId) {
            return null;
        }
        const agents = AIEngineBase.Instance.ReadableAgents;
        if (!agents || agents.length === 0) {
            return null;
        }
        const chain = AIEngineBase.Instance.GetAgentInheritanceChain(targetAgentId);
        if (chain.length < 2) {
            return null;
        }
        const leaf = chain[chain.length - 1];
        if (!leaf.BaseAgentID || !UUIDsEqual(leaf.OwnerUserID, ownerUserId)) {
            return null;
        }
        const ancestors = chain.slice(0, -1);
        const isAncestor = ancestors.some((a) => UUIDsEqual(a.ID, activeAgentId));
        return isAncestor ? ancestors.map((a) => a.ID) : null;
    }

    /**
     * Database fallback used in `ValidateAsync` when a brand-new derived agent was just saved in
     * the same turn before `AIEngineBase` refreshed its cache.
     */
    private async resolveAncestorChainForDerivedChildFromDB(
        targetAgentId: string,
        activeAgentId: string,
        ownerUserId: string | null | undefined
    ): Promise<string[] | null> {
        const cached = this.findCachedAncestorChainForDerivedChild(targetAgentId, activeAgentId, ownerUserId);
        if (cached) {
            return cached;
        }
        if (!targetAgentId || !activeAgentId || !ownerUserId || !this.ProviderToUse) {
            return null;
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        if (typeof md.GetEntityObject !== 'function') {
            return null;
        }

        const leaf = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', this.ContextCurrentUser);
        if (!(await leaf.Load(targetAgentId))) {
            return null;
        }
        if (!leaf.BaseAgentID || !UUIDsEqual(leaf.OwnerUserID, ownerUserId)) {
            return null;
        }

        const ancestorIdsFromParent: string[] = [];
        const visited = new UUIDSet([leaf.ID]);
        let currentBaseId: string | null = leaf.BaseAgentID;
        let hops = 0;

        while (currentBaseId && hops < MAX_AGENT_INHERITANCE_DEPTH) {
            if (visited.Has(currentBaseId)) {
                break;
            }
            visited.Add(currentBaseId);
            ancestorIdsFromParent.push(currentBaseId);
            const anc = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', this.ContextCurrentUser);
            if (!(await anc.Load(currentBaseId))) {
                break;
            }
            currentBaseId = anc.BaseAgentID;
            hops++;
        }

        const ancestorsRootToParent = ancestorIdsFromParent.reverse();
        const isAncestor = ancestorsRootToParent.some((id) => UUIDsEqual(id, activeAgentId));
        return isAncestor ? ancestorsRootToParent : null;
    }

    private validateAgentContextNonWideningSync(result: ValidationResult): void {
        const activeAgentId =
            this.ExecutingAgentID ?? AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
        if (!activeAgentId) {
            return;
        }

        const preSaveAgentId =
            (this.GetFieldByName('AgentID')?.OldValue as string | null | undefined) ?? this.AgentID;
        const isSelfMatch =
            (!preSaveAgentId || UUIDsEqual(preSaveAgentId, activeAgentId)) &&
            (!this.AgentID || UUIDsEqual(this.AgentID, activeAgentId));

        let ancestorIds: string[] | null = null;
        if (!isSelfMatch) {
            const ownerId = this.ContextCurrentUser?.ID ?? this.UserID;
            const targetId = this.AgentID ?? preSaveAgentId;
            if (targetId && (!preSaveAgentId || UUIDsEqual(preSaveAgentId, targetId))) {
                ancestorIds = this.findCachedAncestorChainForDerivedChild(targetId, activeAgentId, ownerId);
            }
            if (!ancestorIds) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'AgentID',
                        `An executing agent (${activeAgentId}) can only create or modify its own user policy (or initialize a derived instance it prototypes), not a sibling agent's policy.`,
                        this.AgentID,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }
        }

        const engine = AgentUserPolicyEngine.Instance;
        const baseline = this.resolveSyncWideningBaseline(ancestorIds);
        const violations = engine.DetectAgentPolicyWidening(baseline, this);
        for (const violation of violations) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EntityAccessRules',
                    `Agent policy self-modification cannot widen privileges without human approval: ${violation}`,
                    null,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    private async validateAgentContextNonWideningAsync(result: ValidationResult): Promise<void> {
        const activeAgentId =
            this.ExecutingAgentID ?? AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
        if (!activeAgentId) {
            return;
        }

        const preSaveAgentId =
            (this.GetFieldByName('AgentID')?.OldValue as string | null | undefined) ?? this.AgentID;
        const isSelfMatch =
            (!preSaveAgentId || UUIDsEqual(preSaveAgentId, activeAgentId)) &&
            (!this.AgentID || UUIDsEqual(this.AgentID, activeAgentId));

        let ancestorIds: string[] | null = null;
        if (!isSelfMatch) {
            const ownerId = this.ContextCurrentUser?.ID ?? this.UserID;
            const targetId = this.AgentID ?? preSaveAgentId;
            if (targetId && (!preSaveAgentId || UUIDsEqual(preSaveAgentId, targetId))) {
                ancestorIds = await this.resolveAncestorChainForDerivedChildFromDB(
                    targetId,
                    activeAgentId,
                    ownerId
                );
            }
            if (!ancestorIds) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'AgentID',
                        `An executing agent (${activeAgentId}) can only create or modify its own user policy (or initialize a derived instance it prototypes), not a sibling agent's policy.`,
                        this.AgentID,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }
        }

        const engine = AgentUserPolicyEngine.Instance;
        let baseline: AgentPolicyBaselineSnapshot | null = this.IsSaved
            ? engine.SnapshotPolicyFromOldValues(this)
            : null;

        // Also clamp against any active ancestor template policy ceiling!
        const effectiveUserId = this.UserID ?? this.ContextCurrentUser?.ID;
        const chainToCheck =
            ancestorIds ??
            (this.AgentID
                ? AIEngineBase.Instance.GetAgentInheritanceChain(this.AgentID)
                      .slice(0, -1)
                      .map((a) => a.ID)
                : []);
        if (chainToCheck.length > 0 && effectiveUserId && this.ContextCurrentUser) {
            const ancestorEffective = await engine.GetEffectivePolicyForAgentChain(
                chainToCheck,
                effectiveUserId,
                this.ContextCurrentUser,
                { provider: this.ProviderToUse as unknown as IMetadataProvider }
            );
            if (ancestorEffective) {
                const ancestorSnapshot = engine.SnapshotPolicy(ancestorEffective);
                const ancestorViolations = engine.DetectAgentPolicyWidening(ancestorSnapshot, this);
                for (const violation of ancestorViolations) {
                    result.Errors.push(
                        new ValidationErrorInfo(
                            'EntityAccessRules',
                            `Derived agent policy cannot widen beyond ancestor template policy ceiling: ${violation}`,
                            null,
                            ValidationErrorType.Failure
                        )
                    );
                }
            }
        }

        const violations = engine.DetectAgentPolicyWidening(baseline, this);
        for (const violation of violations) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EntityAccessRules',
                    `Agent policy self-modification cannot widen privileges without human approval: ${violation}`,
                    null,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    private resolveSyncWideningBaseline(
        ancestorIds: string[] | null
    ): AgentPolicyBaselineSnapshot | null {
        const engine = AgentUserPolicyEngine.Instance;
        const ownBaseline = this.IsSaved ? engine.SnapshotPolicyFromOldValues(this) : null;
        if (ownBaseline) {
            return ownBaseline;
        }
        const effectiveUserId = this.UserID ?? this.ContextCurrentUser?.ID;
        if (ancestorIds && ancestorIds.length > 0 && effectiveUserId) {
            const cachedAncestor = engine.GetCachedEffectivePolicyForAgentChain(
                ancestorIds,
                effectiveUserId
            );
            if (cachedAncestor) {
                return engine.SnapshotPolicy(cachedAncestor);
            }
        }
        return null;
    }
}
