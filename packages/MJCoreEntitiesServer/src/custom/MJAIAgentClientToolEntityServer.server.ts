import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJAIAgentClientToolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { HasRelationalGrantGuardProvider, ValidateDerivedAgentRelationalGrantLive } from './agentRelationalGrantGuard';

/**
 * Server-side `MJ: AI Agent Client Tools` entity enforcing that derived agents (`BaseAgentID != null`)
 * without `Configuration.allowWidenFromBase === true` cannot attach net-new client tools not
 * inherited from their base chain.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Client Tools')
export class MJAIAgentClientToolEntityServer extends MJAIAgentClientToolEntity {
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
                Kind: 'Client Tool',
                EntityName: 'MJ: AI Agent Client Tools',
                FieldName: 'ClientToolDefinitionID',
                AgentID: this.AgentID,
                GrantTargetID: this.ClientToolDefinitionID,
                IsActiveGrant: true,
            });
            if (guardErrors.length > 0) {
                result.Errors.push(...guardErrors);
                result.Success = result.Success && guardErrors.every((e) => e.Type !== ValidationErrorType.Failure);
            }
        }

        return result;
    }
}
