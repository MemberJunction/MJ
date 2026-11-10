import { BaseEntity, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';

/**
 * Server-side `MJ: AI Agent User Policies` entity: a user's agent policy is private to that user.
 *
 * The UI role may create and update policies (granted in `metadata/entity-permissions`) so that
 * a regular user's Chief of Staff can persist their preferences during onboarding and the
 * cockpit's Governance tab can save edits. Row-level security for this entity is not yet
 * expressible as version-controlled metadata, so this subclass is the defense-in-depth gate,
 * mirroring `MJUserRoutineEntityServer`:
 *
 * 1. **Ownership** — a non-Owner-type context user may only save the policy whose `UserID` is
 *    their own, compared against the PRE-save owner so reassigning `UserID` cannot bypass it.
 *    Owner-type users (administrators, the scheduler's system user) are exempt.
 * 2. **Owner attribution** — first save defaults `UserID` to the context user when unset, so
 *    programmatic create paths attribute the row correctly.
 * 3. **Agent self-modification & non-widening** — whenever a save executes inside an agent turn
 *    (`ExecutingAgentID` or `AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID()`), the
 *    agent may only modify its own policy (`AgentID === activeAgentId`) and may never widen its
 *    privileges relative to the pre-save baseline (verified via `DetectAgentPolicyWidening`).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent User Policies')
export class MJAIAgentUserPolicyEntityServer extends MJAIAgentUserPolicyEntity {
    /**
     * Optional explicit executing-agent ID set by callers running on behalf of an agent.
     * When unset, falls back to `AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID()`.
     */
    public ExecutingAgentID: string | null = null;

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved && !this.UserID && this.ContextCurrentUser) {
            this.UserID = this.ContextCurrentUser.ID;
        }
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateOwnership(result);
        this.validateAgentContextNonWidening(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        this.validateOwnership(result);
        this.validateAgentContextNonWidening(result);
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
            result.Errors.push(new ValidationErrorInfo(
                'UserID',
                'An agent policy is private to its user — you can only modify your own policy.',
                this.UserID,
                ValidationErrorType.Failure
            ));
        }
    }

    private validateAgentContextNonWidening(result: ValidationResult): void {
        const activeAgentId =
            this.ExecutingAgentID ?? AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
        if (!activeAgentId) {
            return;
        }

        const preSaveAgentId =
            (this.GetFieldByName('AgentID')?.OldValue as string | null | undefined) ?? this.AgentID;
        if (
            (preSaveAgentId && !UUIDsEqual(preSaveAgentId, activeAgentId)) ||
            (this.AgentID && !UUIDsEqual(this.AgentID, activeAgentId))
        ) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'AgentID',
                    `An executing agent (${activeAgentId}) can only create or modify its own user policy, not a sibling agent's policy.`,
                    this.AgentID,
                    ValidationErrorType.Failure
                )
            );
            return;
        }

        const engine = AgentUserPolicyEngine.Instance;
        const baseline = this.IsSaved ? engine.SnapshotPolicyFromOldValues(this) : null;
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
}
