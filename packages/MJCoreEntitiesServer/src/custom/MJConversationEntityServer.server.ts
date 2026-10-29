import { BaseEntity, BaseEntityResult, EntityDeleteOptions, IMetadataProvider, LogError, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJConversationEntity, UserMayDeleteConversation } from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 * of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * Uses the synchronous `Validate()` so the rule runs on every save, like `MJAIAgentSessionEntityServer`.
 *
 * Also enforces who may delete a conversation for everyone: the owner, an Owner-level grantee, or a user
 * in the Developer or Integration role ({@link UserMayDeleteConversation}). The entity permission lets
 * any UI user delete conversations, and a row-level rule like this cannot be expressed there, so this
 * override is the boundary; the client checks only shape the UI. Refusals return `false` and record a
 * `BaseEntityResult`, as `MJListEntityServer.Delete` does.
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

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        let refusal: string | null;
        try {
            const decision = await UserMayDeleteConversation(
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ContextCurrentUser,
                { ID: this.ID, UserID: this.UserID }
            );
            refusal = decision.Allowed ? null : decision.Reason ?? 'You do not have permission to delete this conversation.';
        } catch (error) {
            LogError(`MJConversationEntityServer: delete permission check failed for conversation ${this.ID}: ${error instanceof Error ? error.message : String(error)}`);
            refusal = 'Unable to verify permission to delete this conversation.';
        }
        if (refusal) {
            const result = new BaseEntityResult();
            result.StartedAt = new Date();
            result.Success = false;
            result.Type = 'delete';
            result.Message = refusal;
            result.EndedAt = new Date();
            this.RegisterResultHistoryEntry(result);
            return false;
        }
        return super.Delete(options);
    }
}
