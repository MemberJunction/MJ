import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJAIAgentSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { HasRelationalGrantGuardProvider, ValidateDerivedAgentRelationalGrantLive } from './agentRelationalGrantGuard';

/**
 * Server-side `MJ: AI Agent Skills` entity enforcing that derived agents (`BaseAgentID != null`)
 * without `Configuration.allowWidenFromBase === true` cannot attach net-new `'Active'` skills
 * not inherited from their base chain (vetoes with `Status !== 'Active'` are always permitted).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Skills')
export class MJAIAgentSkillEntityServer extends MJAIAgentSkillEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        if (HasRelationalGrantGuardProvider(this)) {
            const guardErrors = await ValidateDerivedAgentRelationalGrantLive(this, {
                Kind: 'Skill',
                EntityName: 'MJ: AI Agent Skills',
                FieldName: 'SkillID',
                AgentID: this.AgentID,
                GrantTargetID: this.SkillID,
                IsActiveGrant: this.Status === 'Active',
            });
            if (guardErrors.length > 0) {
                result.Errors.push(...guardErrors);
                result.Success = result.Success && guardErrors.every((e) => e.Type !== ValidationErrorType.Failure);
            }
        }

        return result;
    }
}
