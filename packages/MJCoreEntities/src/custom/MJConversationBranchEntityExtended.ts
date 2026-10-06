import { BaseEntity, BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, IMetadataProvider, LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJConversationBranchEntity } from '../generated/entity_subclasses';
import { UserMayWriteConversation } from './ConversationWriteAccess';

/** Branch rows follow the same write rule as messages: owner or Edit/Owner grant. */
@RegisterClass(BaseEntity, 'MJ: Conversation Branches')
export class MJConversationBranchEntityExtended extends MJConversationBranchEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite(this.IsSaved ? 'update' : 'create'))) {
            return false;
        }
        return super.Save(options);
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite('delete'))) {
            return false;
        }
        return super.Delete(options);
    }

    private async currentUserMayWrite(resultType: 'create' | 'update' | 'delete'): Promise<boolean> {
        try {
            const decision = await UserMayWriteConversation(
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ContextCurrentUser,
                this.ConversationID
            );
            if (!decision.Allowed) {
                this.recordDenied(decision.Reason ?? 'Permission denied.', resultType);
            }
            return decision.Allowed;
        } catch (error) {
            LogError(`MJConversationBranchEntityExtended: permission check failed for conversation ${this.ConversationID}: ${error instanceof Error ? error.message : String(error)}`);
            this.recordDenied('Unable to verify conversation permissions.', resultType);
            return false;
        }
    }

    private recordDenied(message: string, resultType: 'create' | 'update' | 'delete'): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = resultType;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

export function LoadMJConversationBranchEntityExtended(): void {}
