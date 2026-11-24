import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    RunInEntityTransaction,
    RunView,
    RunViewParams,
    WellKnownUserSource,
} from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import {
    MJConversationBranchEntityExtended,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MarkInternalConversationSecurityQuery } from './ConversationReadSecurityHook';

class BranchDeleteRollbackError extends Error {
    constructor() {
        super('Branch delete aborted; rolling back child side-question deletes.');
    }
}

function toMetadataProvider(provider: IEntityDataProvider | null | undefined): IMetadataProvider | undefined {
    return provider ? (provider as Partial<IMetadataProvider> as IMetadataProvider) : undefined;
}

/**
 * Server-side subclass for `MJ: Conversation Branches`.
 *
 * Extends {@link MJConversationBranchEntityExtended} so all fork creation (`Conversations: Fork`),
 * conversation write-access checks, and non-empty-fork delete guards remain active, while cleaning
 * up any child `MJ: Conversations` side-question threads anchored to `ParentBranchID` atomically
 * inside `RunInEntityTransaction` before `spDeleteConversationBranch` runs (preventing
 * `FK_Conversation_ParentBranchID` violations and orphaned NULL-branch side conversations).
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Branches')
export class MJConversationBranchEntityServer extends MJConversationBranchEntityExtended {
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        try {
            return await RunInEntityTransaction(
                this.ProviderToUse as Parameters<typeof RunInEntityTransaction>[0],
                async () => {
                    const deleted = await super.Delete(options);
                    if (!deleted) {
                        throw new BranchDeleteRollbackError();
                    }
                    return true;
                }
            );
        } catch (err: unknown) {
            if (err instanceof BranchDeleteRollbackError) {
                return false;
            }
            throw err;
        }
    }

    protected override async BeforeBranchDelete(options?: EntityDeleteOptions): Promise<boolean> {
        const provider = toMetadataProvider(this.ProviderToUse);
        if (!this.ID || !provider || provider.ProviderType !== 'Database' || !('RunView' in provider) || typeof provider.RunView !== 'function') {
            return true;
        }

        const systemUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
            UserCache.Instance.GetSystemUser();
        const actor = systemUser ?? this.ContextCurrentUser;
        const rv = RunView.FromMetadataProvider(provider);
        const queryParams: RunViewParams = {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ParentBranchID='${EscapeSQLString(this.ID)}'`,
            SkipTotalRowCount: true,
            BypassCache: true,
            ResultType: 'entity_object',
        };
        MarkInternalConversationSecurityQuery(queryParams);
        const result = await rv.RunView<MJConversationEntity>(queryParams, actor);
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
