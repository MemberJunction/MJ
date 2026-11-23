import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    IMetadataProvider,
    LogError,
    RunView,
    WellKnownUserSource,
} from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import {
    MJConversationBranchEntityExtended,
    MJConversationEntity,
} from '@memberjunction/core-entities';

/**
 * Server-side subclass for `MJ: Conversation Branches`.
 *
 * Extends {@link MJConversationBranchEntityExtended} so all fork creation (`Conversations: Fork`),
 * conversation write-access checks, and non-empty-fork delete guards remain active, while cleaning
 * up any child `MJ: Conversations` side-question threads anchored to `ParentBranchID` before
 * `spDeleteConversationBranch` runs (preventing `FK_Conversation_ParentBranchID` violations and
 * orphaned NULL-branch side conversations).
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Branches')
export class MJConversationBranchEntityServer extends MJConversationBranchEntityExtended {
    protected override async beforeBranchDelete(options?: EntityDeleteOptions): Promise<boolean> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        if (!this.ID || !provider || provider.ProviderType !== 'Database' || !('RunView' in provider) || typeof provider.RunView !== 'function') {
            return true;
        }

        const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
        const actor = systemUser ?? this.ContextCurrentUser;
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJConversationEntity>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `ParentBranchID='${EscapeSQLString(this.ID)}'`,
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'entity_object',
            },
            actor
        );
        if (!result.Success) {
            LogError(
                `MJConversationBranchEntityServer: failed to inspect side-question threads for branch ${this.ID}: ${result.ErrorMessage}`
            );
            this.recordBranchDeleteFailure('Unable to verify side-question threads attached to this fork before deleting it.');
            return false;
        }
        for (const child of result.Results ?? []) {
            if (!(await child.Delete(options))) {
                const reason =
                    child.LatestResult?.CompleteMessage?.trim() ||
                    'Failed to delete a side-question conversation attached to this fork.';
                this.recordBranchDeleteFailure(reason);
                return false;
            }
        }
        return true;
    }

    private recordBranchDeleteFailure(message: string): void {
        const result = new BaseEntityResult();
        result.StartedAt = new Date();
        result.Success = false;
        result.Type = 'delete';
        result.Message = message;
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

export function LoadMJConversationBranchEntityServer(): void {}
