import { BaseEntity, BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJConversationBranchEntity } from '../generated/entity_subclasses';
import { UserMayWriteConversation } from './ConversationWriteAccess';
import { UserCanFork } from './ConversationForkAccess';

/** The refusal recorded when a person without the `Conversations: Fork` authorization creates a fork. */
const FORK_CREATE_REFUSED_MESSAGE = 'You do not have permission to fork conversations.';

/** The refusal recorded when a fork that still has messages or child forks is deleted. */
const FORK_DELETE_REFUSED_MESSAGE = 'A fork that has messages or forks under it cannot be deleted.';

/** The refusal recorded when the delete guard cannot read the fork's messages or child forks. */
const FORK_DELETE_CHECK_FAILED_MESSAGE = 'Unable to check whether the fork has messages or forks under it.';

/**
 * Branch rows (forks) follow the message write rule: owner or Edit/Owner grant. Creating one on the
 * server also needs the `Conversations: Fork` authorization; a save with no context user is trusted.
 *
 * Delete is refused while the fork still has its own `ConversationDetail` rows or child forks: the
 * generated delete procedure clears `BranchID` on those rows and `ParentBranchID` on those children,
 * which would move them into Main. Deleting a conversation does not use this class; its delete
 * procedure removes the forks and rows in SQL.
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Branches')
export class MJConversationBranchEntityExtended extends MJConversationBranchEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved && !this.contextUserMayFork()) {
            return false;
        }
        if (!(await this.currentUserMayWrite(this.IsSaved ? 'update' : 'create'))) {
            return false;
        }
        return super.Save(options);
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite('delete'))) {
            return false;
        }
        if (!(await this.hasNoRowsOrChildBranches())) {
            return false;
        }
        return super.Delete(options);
    }

    /**
     * True when this save may create a fork. On a database provider with a context user, that user must
     * hold `Conversations: Fork`; records the refusal otherwise. Other providers leave the check to the
     * server, and a save with no context user is trusted.
     */
    private contextUserMayFork(): boolean {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;
        if (provider?.ProviderType !== 'Database' || !user) {
            return true;
        }
        if (UserCanFork(user, provider)) {
            return true;
        }
        this.recordDenied(FORK_CREATE_REFUSED_MESSAGE, 'create');
        return false;
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

    /**
     * True when no `ConversationDetail` row is on this fork and no fork names it as its parent.
     * Records the refusal and returns false otherwise, and when either count cannot be read.
     */
    private async hasNoRowsOrChildBranches(): Promise<boolean> {
        const id = EscapeSQLString(this.ID);
        try {
            const [rows, children] = await new RunView(this.RunViewProviderToUse).RunViews<{ ID: string }>(
                [
                    { EntityName: 'MJ: Conversation Details', ExtraFilter: `BranchID='${id}'`, ResultType: 'count_only' },
                    { EntityName: 'MJ: Conversation Branches', ExtraFilter: `ParentBranchID='${id}'`, ResultType: 'count_only' },
                ],
                this.ContextCurrentUser
            );
            if (!rows?.Success || !children?.Success) {
                LogError(`MJConversationBranchEntityExtended: delete check failed for fork ${this.ID}: ${rows?.ErrorMessage ?? ''} ${children?.ErrorMessage ?? ''}`.trim());
                this.recordDenied(FORK_DELETE_CHECK_FAILED_MESSAGE, 'delete');
                return false;
            }
            if (rows.TotalRowCount > 0 || children.TotalRowCount > 0) {
                this.recordDenied(FORK_DELETE_REFUSED_MESSAGE, 'delete');
                return false;
            }
            return true;
        } catch (error) {
            LogError(`MJConversationBranchEntityExtended: delete check failed for fork ${this.ID}: ${error instanceof Error ? error.message : String(error)}`);
            this.recordDenied(FORK_DELETE_CHECK_FAILED_MESSAGE, 'delete');
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
