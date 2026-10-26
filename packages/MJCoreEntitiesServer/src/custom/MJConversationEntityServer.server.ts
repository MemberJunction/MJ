import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 * of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * Uses the synchronous `Validate()` so the rule runs on every save, like `MJAIAgentSessionEntityServer`.
 */
@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violation = CheckAnonymousOwnershipKeyChange(this, 'ExternalID');
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }
}
