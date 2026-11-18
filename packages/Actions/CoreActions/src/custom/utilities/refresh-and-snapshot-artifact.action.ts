import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    MJConversationDetailArtifactEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { BaseGovernedArtifactAction } from '../artifacts/base-governed-artifact.action';

export interface RefreshArtifactPayloadOptions {
    artifactId: string;
    content: string;
    configuration?: string;
    artifactTypeName?: string;
    driverClass?: string;
    contextUser: UserInfo;
    provider: IMetadataProvider;
    freezeRefreshedBlocks?: boolean;
    forceRefreshFrozen?: boolean;
    versionId?: string;
}

export interface RefreshArtifactPayloadResult {
    changed: boolean;
    updatedContent: string;
    updatedConfiguration: string;
    diffSummary: string;
    signedFrozenBlocksCount: number;
    highlightLines: string[];
}

/**
 * Core action that refreshes all live embedded data blocks / live tables inside a governed
 * Document, Spreadsheet, or Slide Deck artifact, compares against the previous version, persists a new
 * ArtifactVersion if anything changed (or if `ForceSaveIfUnchanged` is true), and optionally
 * freezes the refreshed blocks into immutable snapshots (HMAC-signed) or posts a brief summary
 * into a conversation.
 *
 * Delegates canonical lock coordination, Yjs live-room reconciliation, File-mode `.xlsx` binary
 * export/upload, and atomic persistence to {@link GovernedArtifactService.RefreshAndSnapshotArtifact}.
 */
@RegisterClass(BaseAction, '__RefreshAndSnapshotArtifact')
export class RefreshAndSnapshotArtifactAction extends BaseAction {
    public static readonly AuthorizesCaller = true;

    private readonly helper = new (class extends BaseGovernedArtifactAction {
        protected async InternalRunAction(_params: RunActionParams): Promise<ActionResultSimple> {
            return { Success: true, ResultCode: 'SUCCESS', Params: [] };
        }
        public ResolveProvider(params: RunActionParams): IMetadataProvider {
            return this.resolveProvider(params);
        }
        public ExtractAgentAttribution(params: RunActionParams): { agentRunId?: string; agentName?: string } {
            return this.extractAgentAttribution(params);
        }
        public GetString(params: RunActionParams, name: string): string | undefined {
            return this.getStringParam(params, name);
        }
        public SetOutput(
            params: RunActionParams,
            name: string,
            value: string | number | boolean | null | object | undefined,
        ): void {
            this.setOutputParam(params, name, value);
        }
    })();

    /** Backwards-compatible public entry point forwarding directly to {@link InternalRunAction}. */
    public async ExecuteRefreshAction(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT_USER',
                Message: 'ContextUser is required to refresh an artifact.',
                Params: params.Params,
            };
        }

        const artifactId = this.helper.GetString(params, 'ArtifactID');
        if (!artifactId) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETER',
                Message: 'ArtifactID parameter is required.',
                Params: params.Params,
            };
        }

        const freezeRefreshedBlocks = this.getBooleanParam(params, 'FreezeRefreshedBlocks', false);
        const forceSaveIfUnchanged = this.getBooleanParam(params, 'ForceSaveIfUnchanged', false);
        const forceRefreshFrozen = this.getBooleanParam(params, 'ForceRefreshFrozen', false);
        const versionComments = this.helper.GetString(params, 'VersionComments');
        const conversationId = this.helper.GetString(params, 'ConversationID');
        const postToConversation = this.getBooleanParam(params, 'PostToConversation', Boolean(conversationId));

        const provider = this.helper.ResolveProvider(params);

        if (postToConversation && !conversationId) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETER',
                Message: 'ConversationID parameter is required when PostToConversation is true.',
                Params: params.Params,
            };
        }

        if (conversationId) {
            const owned = await this.verifyConversationOwnership(provider, params.ContextUser, conversationId);
            if (!owned.allowed) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: owned.reason,
                    Params: params.Params,
                };
            }
        }

        const attribution = this.helper.ExtractAgentAttribution(params);

        // S-a: Always reject FreezeRefreshedBlocks on the Action surface (even without agent attribution,
        // such as MCP Server or RuntimeActionBridge callers) because Action invocation cannot prove a
        // direct interactive human gesture; human freezing goes through GraphQL FreezeDocumentLiveBlock.
        if (freezeRefreshedBlocks) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message:
                    'Freezing live artifact blocks via RefreshAndSnapshotArtifact is disabled because action invocations (including MCP and RuntimeActionBridge) cannot guarantee a direct interactive human gesture. Use FreezeDocumentLiveBlock in the UI instead.',
                Params: params.Params,
            };
        }

        try {
            const outcome = await GovernedArtifactService.Instance.RefreshAndSnapshotArtifact({
                provider,
                contextUser: params.ContextUser,
                artifactId,
                freezeRefreshedBlocks,
                forceSaveIfUnchanged,
                forceRefreshFrozen,
                versionComments,
                agentRunId: attribution.agentRunId,
                agentName: attribution.agentName,
            });

            if (!outcome.success) {
                return {
                    Success: false,
                    ResultCode: outcome.resultCode || 'FAILED',
                    Message: outcome.errorMessage || outcome.message,
                    Params: params.Params,
                };
            }

            this.helper.SetOutput(params, 'ArtifactID', outcome.artifactId);
            this.helper.SetOutput(params, 'VersionID', outcome.versionId ?? null);
            this.helper.SetOutput(params, 'VersionNumber', outcome.versionNumber ?? outcome.previousVersionNumber ?? null);
            this.helper.SetOutput(params, 'ArtifactName', outcome.artifactName ?? null);
            this.helper.SetOutput(params, 'ArtifactTypeName', outcome.artifactTypeName ?? null);
            this.helper.SetOutput(params, 'DriverClass', outcome.driverClass ?? null);
            this.helper.SetOutput(params, 'PreviousVersionID', outcome.previousVersionId ?? null);
            this.helper.SetOutput(params, 'PreviousVersionNumber', outcome.previousVersionNumber ?? null);
            this.helper.SetOutput(params, 'NewVersionID', outcome.newVersionId ?? null);
            this.helper.SetOutput(params, 'NewVersionNumber', outcome.newVersionNumber ?? null);
            this.helper.SetOutput(params, 'Changed', outcome.changed);
            this.helper.SetOutput(params, 'DiffSummary', outcome.diffSummary ?? outcome.message);

            if (outcome.resultCode === 'NO_CHANGES') {
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: outcome.message,
                    Params: params.Params,
                };
            }

            let postedDetailId: string | null = null;
            if (postToConversation && conversationId && outcome.versionId) {
                postedDetailId = await this.postSummaryToConversation(
                    provider,
                    params.ContextUser,
                    conversationId,
                    outcome.artifactName ?? 'Untitled Artifact',
                    outcome.versionNumber ?? 1,
                    outcome.versionId,
                    outcome.diffSummary ?? outcome.message,
                );
            }
            this.helper.SetOutput(params, 'PostedConversationDetailID', postedDetailId);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: outcome.message,
                Params: params.Params,
            };
        } catch (err) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `RefreshAndSnapshotArtifactAction error: ${err instanceof Error ? err.message : String(err)}`,
                Params: params.Params,
            };
        }
    }

    /**
     * Refreshes an already-loaded text payload in memory via {@link GovernedArtifactService.RefreshArtifactPayloadInMemory}.
     */
    public async RefreshArtifactPayload(options: RefreshArtifactPayloadOptions): Promise<RefreshArtifactPayloadResult> {
        return GovernedArtifactService.Instance.RefreshArtifactPayloadInMemory({
            artifactId: options.artifactId,
            content: options.content,
            configuration: options.configuration,
            artifactTypeName: options.artifactTypeName,
            driverClass: options.driverClass,
            contextUser: options.contextUser,
            provider: options.provider,
            freezeRefreshedBlocks: options.freezeRefreshedBlocks,
            forceRefreshFrozen: options.forceRefreshFrozen,
        });
    }

    private async verifyConversationOwnership(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        conversationId: string,
    ): Promise<{ allowed: boolean; reason: string }> {
        if (!IsValidUUID(conversationId)) {
            return { allowed: false, reason: 'ConversationID must be a valid UUID.' };
        }
        const rv = RunView.FromMetadataProvider(provider);
        const convRes = await rv.RunView<MJConversationEntity>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `ID = '${EscapeSQLString(conversationId.trim())}'`,
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!convRes.Success || !convRes.Results?.length) {
            return { allowed: false, reason: `Conversation '${conversationId}' was not found or is not accessible.` };
        }
        if (!UUIDsEqual(convRes.Results[0].UserID, contextUser.ID)) {
            return { allowed: false, reason: `Access denied: you do not own conversation '${conversationId}'.` };
        }
        return { allowed: true, reason: '' };
    }

    private async postSummaryToConversation(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        conversationId: string,
        artifactName: string,
        versionNumber: number,
        versionId: string,
        diffSummary: string,
    ): Promise<string | null> {
        try {
            const owned = await this.verifyConversationOwnership(provider, contextUser, conversationId);
            if (!owned.allowed) {
                LogError(`RefreshAndSnapshotArtifactAction refused conversation summary insert: ${owned.reason}`);
                return null;
            }

            const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', contextUser);
            detail.ConversationID = conversationId;
            detail.Role = 'AI';
            detail.Message = `Scheduled refresh updated **${artifactName}** to v${versionNumber}: ${diffSummary}`;
            detail.UserID = contextUser.ID;
            if (!(await detail.Save())) {
                return null;
            }

            if (versionId) {
                const junction = await provider.GetEntityObject<MJConversationDetailArtifactEntity>('MJ: Conversation Detail Artifacts', contextUser);
                junction.ConversationDetailID = detail.ID;
                junction.ArtifactVersionID = versionId;
                junction.Direction = 'Output';
                await junction.Save();
            }
            return detail.ID;
        } catch (err) {
            LogError(`RefreshAndSnapshotArtifactAction postSummaryToConversation warning: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    private getBooleanParam(params: RunActionParams, name: string, fallback: boolean): boolean {
        const param = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return fallback;
        if (typeof param.Value === 'boolean') return param.Value;
        const s = String(param.Value).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return fallback;
    }
}
