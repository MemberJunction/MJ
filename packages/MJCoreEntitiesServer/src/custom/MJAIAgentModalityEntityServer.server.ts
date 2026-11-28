import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJAIAgentModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { HasRelationalGrantGuardProvider, ValidateDerivedAgentRelationalGrantLive } from './agentRelationalGrantGuard';

/**
 * Server-side `MJ: AI Agent Modalities` entity enforcing that derived agents (`BaseAgentID != null`)
 * without `Configuration.allowWidenFromBase === true` cannot attach net-new `IsAllowed = true`
 * modality grants or widen inherited `MaxSizeBytes` / `MaxCountPerMessage` ceilings (vetoes with
 * `IsAllowed = false` are always permitted).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Modalities')
export class MJAIAgentModalityEntityServer extends MJAIAgentModalityEntity {
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
                Kind: 'Modality',
                EntityName: 'MJ: AI Agent Modalities',
                FieldName: 'ModalityID',
                AgentID: this.AgentID,
                GrantTargetID: this.ModalityID,
                IsActiveGrant: this.IsAllowed !== false,
                ModalityDirection: this.Direction,
                TargetBounds: {
                    MaxSizeBytes: this.MaxSizeBytes,
                    MaxCountPerMessage: this.MaxCountPerMessage,
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
