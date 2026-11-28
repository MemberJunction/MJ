import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJAIAgentActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { HasRelationalGrantGuardProvider, ValidateDerivedAgentRelationalGrantLive } from './agentRelationalGrantGuard';

/**
 * Server-side `MJ: AI Agent Actions` entity enforcing that derived agents (`BaseAgentID != null`)
 * without `Configuration.allowWidenFromBase === true` cannot attach net-new `'Active'` actions
 * or loosen inherited per-action execution/expiration bounds (vetoes with `Status !== 'Active'`
 * are always permitted).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Actions')
export class MJAIAgentActionEntityServer extends MJAIAgentActionEntity {
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
                Kind: 'Action',
                EntityName: 'MJ: AI Agent Actions',
                FieldName: 'ActionID',
                AgentID: this.AgentID,
                GrantTargetID: this.ActionID,
                IsActiveGrant: this.Status === 'Active',
                TargetBounds: {
                    MaxExecutionsPerRun: this.MaxExecutionsPerRun,
                    MinExecutionsPerRun: this.MinExecutionsPerRun,
                    ResultExpirationTurns: this.ResultExpirationTurns,
                },
            });
            if (guardErrors.length > 0) {
                result.Errors.push(...guardErrors);
                result.Success = result.Success && guardErrors.every((e) => e.Type !== ValidationErrorType.Failure);
            }
        }

        return result;
    }
}
