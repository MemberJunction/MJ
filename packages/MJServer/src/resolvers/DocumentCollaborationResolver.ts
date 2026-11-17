import { createHash } from 'node:crypto';
import { Resolver, Query, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import type { ChatMessage } from '@memberjunction/ai';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    BuildArtifactVersionConfigurationWithPreview,
    BuildBlockIdentityBinding,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    IsValidThumbnailDataUrl,
    MJArtifactEntity,
    MJArtifactTypeEntity,
    MJArtifactVersionEntity,
    MJConversationDetailEntity,
    ParseArtifactVersionConfiguration,
    ResolveArtifactTypeThumbnailPolicy,
    ValidateArtifactContentMutationAgainstLocks,
    ValidateFrozenBlockSnapshot
} from '@memberjunction/core-entities';
import { MarkTrustedServerRestoreSave } from '@memberjunction/core-entities-server';

const MAX_FROZEN_SPEC_JSON_CHARS = 512 * 1024;
const MAX_RESTORE_VERSION_CONFLICT_RETRIES = 3;
import { ApiRoute } from '../apiRoot.js';
import { configInfo } from '../config.js';
import {
    ARTIFACT_COLLABORATION_WS_PATH,
    ArtifactCollaborationServer,
    COLLAB_SECRET_UNCONFIGURED_CODE,
    CollaborationSecretUnconfiguredError
} from '../collaboration/ArtifactCollaborationServer.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { WriteArtifactComplianceAudit } from '../operations/ArtifactComplianceAuditHelper.js';

@ObjectType()
export class CollaborationTicketResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    Ticket?: string;

    @Field({ nullable: true })
    WsPath?: string;

    @Field({ nullable: true })
    WsUrl?: string;

    @Field({ nullable: true })
    ExpiresAt?: string;

    @Field()
    CanRead: boolean;

    @Field()
    CanEdit: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    ErrorCode?: string;
}

@ObjectType()
export class VerifyFrozenBlockSnapshotOutput {
    @Field()
    Valid: boolean;

    @Field()
    SnapshotVerified: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@ObjectType()
export class DocumentLiveBlockResultOutput {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    AccessDenied?: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field(() => String)
    ResultJSON: string;
}

@ObjectType()
export class FreezeDocumentBlockResultOutput {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    UpdatedSpecJSON?: string;
}

@ObjectType()
export class CommitArtifactInlineEditResultOutput {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    VersionID?: string;

    @Field(() => Int, { nullable: true })
    VersionNumber?: number;
}

@ObjectType()
export class CreateInlineDelegatedArtifactResultOutput {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    ArtifactID?: string;

    @Field({ nullable: true })
    VersionID?: string;
}

@ObjectType()
export class ArtifactPermissionsOutput {
    @Field()
    ArtifactID: string;

    @Field()
    CanRead: boolean;

    @Field()
    CanEdit: boolean;

    @Field()
    CanDelete: boolean;

    @Field()
    CanShare: boolean;

    @Field()
    Source: string;

    @Field()
    Reason: string;
}

/**
 * GraphQL resolver supporting single-use collaboration WebSocket ticket minting (`A3`),
 * viewer-scoped live MJ blocks, freeze/unfreeze snapshots, inline OLE child artifact creation
 * (such as `/whiteboard` inside a Document), and inline edit commits.
 */
@Resolver()
export class DocumentCollaborationResolver extends ResolverBase {
    private resolveProvider(context: AppContext): IMetadataProvider {
        const readWrite = context.providers?.find((p) => p.type === 'Read-Write')?.provider;
        const anyProv = context.providers?.[0]?.provider;
        return (readWrite ?? anyProv ?? Metadata.Provider) as IMetadataProvider;
    }

    @Mutation(() => CollaborationTicketResult)
    async MintArtifactCollaborationTicket(
        @Arg('artifactId') artifactId: string,
        @Ctx() context: AppContext
    ): Promise<CollaborationTicketResult> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                CanRead: false,
                CanEdit: false,
                ErrorMessage: user ? 'Magic Link sessions cannot access collaboration rooms.' : 'Authentication required.'
            };
        }

        const normalizedArtifactId = (artifactId ?? '').trim();
        if (!normalizedArtifactId) {
            return {
                Success: false,
                CanRead: false,
                CanEdit: false,
                ErrorMessage: 'artifactId is required.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization('artifact:read', normalizedArtifactId, context.userPayload);

        const provider = this.resolveProvider(context);
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            normalizedArtifactId,
            user
        );
        if (!perms.CanRead) {
            return {
                Success: false,
                CanRead: false,
                CanEdit: false,
                ErrorMessage: 'Access denied'
            };
        }

        let effectiveCanEdit = perms.CanEdit;
        if (context.userPayload.apiKeyHash && effectiveCanEdit) {
            const hasEditScope = await ArtifactCollaborationServer.Instance.CheckApiKeyScope(
                context.userPayload.apiKeyHash,
                'artifact:edit',
                normalizedArtifactId,
                user,
                true
            );
            if (!hasEditScope) {
                effectiveCanEdit = false;
            }
        }

        let issued: { Ticket: string; ExpiresAt: string };
        try {
            issued = ArtifactCollaborationServer.Instance.IssueTicket({
                ArtifactID: normalizedArtifactId,
                User: user,
                ApiKeyHash: context.userPayload.apiKeyHash,
                TokenExpiresAtMs: context.userPayload.tokenExpiresAtMs,
                Provider: provider
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Live collaboration is unavailable on this server.';
            const errorCode =
                err instanceof CollaborationSecretUnconfiguredError
                    ? COLLAB_SECRET_UNCONFIGURED_CODE
                    : undefined;
            LogError(
                `DocumentCollaborationResolver.MintArtifactCollaborationTicket failed to issue ticket for artifact '${normalizedArtifactId}': ${message}`
            );
            return {
                Success: false,
                CanRead: true,
                CanEdit: effectiveCanEdit,
                ErrorMessage: message,
                ...(errorCode ? { ErrorCode: errorCode } : {})
            };
        }

        const wsPath = ApiRoute(ARTIFACT_COLLABORATION_WS_PATH);
        const configuredPublicUrl = (configInfo.publicUrl || process.env['MJAPI_PUBLIC_URL'] || '').trim();
        const wsUrl = configuredPublicUrl
            ? (configInfo.publicUrl
                  ? ApiRoute(ARTIFACT_COLLABORATION_WS_PATH, { absolute: true })
                  : `${configuredPublicUrl.replace(/\/+$/, '')}${ARTIFACT_COLLABORATION_WS_PATH}`
              ).replace(/^http/i, 'ws')
            : undefined;

        return {
            Success: true,
            Ticket: issued.Ticket,
            WsPath: wsPath,
            WsUrl: wsUrl,
            ExpiresAt: issued.ExpiresAt,
            CanRead: true,
            CanEdit: effectiveCanEdit
        };
    }

    @Query(() => ArtifactPermissionsOutput)
    async ResolveArtifactPermissions(
        @Arg('artifactId') artifactId: string,
        @Ctx() context: AppContext
    ): Promise<ArtifactPermissionsOutput> {
        return await this.ResolveArtifactUserPermissions(artifactId, context);
    }

    @Query(() => ArtifactPermissionsOutput)
    async ResolveArtifactUserPermissions(
        @Arg('artifactId') artifactId: string,
        @Ctx() context: AppContext
    ): Promise<ArtifactPermissionsOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                ArtifactID: artifactId,
                CanRead: false,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Denied',
                Reason: user ? 'Magic Link sessions cannot access artifact permissions.' : 'Authentication required.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization('artifact:read', artifactId, context.userPayload);

        const provider = this.resolveProvider(context);
        return await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
    }

    @Query(() => VerifyFrozenBlockSnapshotOutput)
    async VerifyFrozenBlockSnapshot(
        @Arg('specJson') specJson: string,
        @Arg('hostArtifactId') hostArtifactId: string,
        @Ctx() context?: AppContext
    ): Promise<VerifyFrozenBlockSnapshotOutput> {
        const user = this.GetUserFromPayload(context?.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Valid: false,
                SnapshotVerified: false,
                ErrorMessage: user ? 'Magic Link sessions cannot verify snapshots directly.' : 'Authentication required.'
            };
        }
        const normalizedHostId = (hostArtifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:read', normalizedHostId || '*', context?.userPayload);
        if (!normalizedHostId || !IsValidUUID(normalizedHostId)) {
            return {
                Valid: false,
                SnapshotVerified: false,
                ErrorMessage: 'A valid hostArtifactId UUID is required to verify a frozen snapshot.'
            };
        }
        if (typeof specJson !== 'string' || specJson.length > MAX_FROZEN_SPEC_JSON_CHARS) {
            return {
                Valid: false,
                SnapshotVerified: false,
                ErrorMessage: 'Frozen block specification exceeds maximum allowed size.'
            };
        }
        try {
            if (context) {
                const provider = this.resolveProvider(context);
                const hostPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    normalizedHostId,
                    user
                );
                if (!hostPerms.CanRead) {
                    return {
                        Valid: false,
                        SnapshotVerified: false,
                        ErrorMessage: hostPerms.Reason || 'Permission denied on host artifact.'
                    };
                }
            }
            const spec = JSON.parse(specJson) as DocumentBlockSpec;
            if (!spec || spec.Mode !== 'Frozen' || !spec.FrozenSnapshot) {
                return {
                    Valid: false,
                    SnapshotVerified: false,
                    ErrorMessage: 'Block is not a frozen snapshot.'
                };
            }
            const expectedBinding = BuildBlockIdentityBinding(spec, normalizedHostId);
            const validation = ValidateFrozenBlockSnapshot(
                spec.FrozenSnapshot,
                undefined,
                expectedBinding
            );
            return {
                Valid: validation.Valid,
                SnapshotVerified: validation.SnapshotVerified,
                ErrorMessage: validation.ErrorMessage
            };
        } catch (err) {
            return {
                Valid: false,
                SnapshotVerified: false,
                ErrorMessage: err instanceof Error ? err.message : String(err)
            };
        }
    }

    @Query(() => DocumentLiveBlockResultOutput)
    async ExecuteDocumentLiveBlock(
        @Arg('specJson') specJson: string,
        @Ctx() context: AppContext,
        @Arg('hostArtifactId', () => String, { nullable: true }) hostArtifactId?: string
    ): Promise<DocumentLiveBlockResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                AccessDenied: true,
                ErrorMessage: user ? 'Magic Link sessions cannot execute live document blocks.' : 'Authentication required.',
                ResultJSON: '{}'
            };
        }

        const normalizedHostId = (hostArtifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:read', normalizedHostId || '*', context.userPayload);

        if (!normalizedHostId) {
            return {
                Success: false,
                AccessDenied: true,
                ErrorMessage: 'hostArtifactId is required to execute a live document block.',
                ResultJSON: '{}'
            };
        }

        try {
            const provider = this.resolveProvider(context);
            const hostPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                normalizedHostId,
                user
            );
            if (!hostPerms.CanRead) {
                return {
                    Success: false,
                    AccessDenied: true,
                    ErrorMessage: hostPerms.Reason || 'You do not have permission to read the host artifact.',
                    ResultJSON: '{}'
                };
            }

            const spec = JSON.parse(specJson) as DocumentBlockSpec;
            const execResult = await DocumentLiveBlockEngine.Instance.ExecuteBlock(spec, user, provider);
            return {
                Success: execResult.Success,
                AccessDenied: execResult.AccessDenied,
                ErrorMessage: execResult.ErrorMessage,
                ResultJSON: JSON.stringify(execResult)
            };
        } catch (err) {
            return {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
                ResultJSON: '{}'
            };
        }
    }

    @Mutation(() => FreezeDocumentBlockResultOutput)
    async FreezeDocumentLiveBlock(
        @Arg('specJson') specJson: string,
        @Arg('acknowledgeSecurityWarning') acknowledgeSecurityWarning: boolean,
        @Ctx() context: AppContext,
        @Arg('hostArtifactId', () => String, { nullable: true }) hostArtifactId?: string
    ): Promise<FreezeDocumentBlockResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                ErrorMessage: user ? 'Magic Link sessions cannot mutate artifacts.' : 'Authentication required.'
            };
        }

        const normalizedHostId = (hostArtifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:edit', normalizedHostId || '*', context.userPayload);

        if (!normalizedHostId) {
            return {
                Success: false,
                ErrorMessage: 'hostArtifactId is required to freeze a live document block.'
            };
        }

        try {
            const provider = this.resolveProvider(context);
            const hostPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                normalizedHostId,
                user
            );
            if (!hostPerms.CanEdit) {
                return {
                    Success: false,
                    ErrorMessage:
                        hostPerms.Reason || 'You must have Edit permission on the host artifact to freeze a block.'
                };
            }

            const spec = JSON.parse(specJson) as DocumentBlockSpec;
            const res = await DocumentLiveBlockEngine.Instance.FreezeBlock(
                spec,
                user,
                acknowledgeSecurityWarning,
                provider,
                undefined,
                normalizedHostId
            );
            if (res.Success) {
                void WriteArtifactComplianceAudit(provider, user, {
                    AuditLogTypeName: 'Artifact Block Frozen',
                    ArtifactID: normalizedHostId,
                    Summary: `Froze live block '${spec.BlockID}' (${spec.Kind}) into immutable snapshot.`,
                    Details: {
                        blockId: spec.BlockID,
                        blockKind: spec.Kind,
                        sourceArtifactId: spec.ArtifactID ?? null,
                    },
                });
            }
            return {
                Success: res.Success,
                ErrorMessage: res.ErrorMessage,
                UpdatedSpecJSON: res.UpdatedSpec ? JSON.stringify(res.UpdatedSpec) : undefined
            };
        } catch (err) {
            return {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err)
            };
        }
    }

    @Mutation(() => CommitArtifactInlineEditResultOutput)
    async CommitArtifactInlineEdit(
        @Arg('artifactId') artifactId: string,
        @Arg('content') content: string,
        @Arg('saveVersion', { nullable: true }) saveVersion: boolean = true,
        @Ctx() context: AppContext,
        @Arg('thumbnailDataUrl', { nullable: true }) thumbnailDataUrl?: string
    ): Promise<CommitArtifactInlineEditResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                ErrorMessage: user ? 'Magic Link sessions cannot mutate artifacts.' : 'Authentication required.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization('artifact:edit', artifactId, context.userPayload);

        const provider = this.resolveProvider(context);
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        if (!perms.CanEdit) {
            return {
                Success: false,
                ErrorMessage: perms.Reason || 'You do not have permission to edit this artifact.'
            };
        }

        const validCapturedThumbnail = IsValidThumbnailDataUrl(thumbnailDataUrl) ? thumbnailDataUrl : null;
        const applied = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            artifactId,
            content,
            user,
            saveVersion,
            undefined,
            { capturedThumbnailDataUrl: validCapturedThumbnail, provider }
        );
        return {
            Success: applied.Success,
            VersionID: applied.VersionID,
            VersionNumber: applied.VersionNumber,
            ErrorMessage: applied.Success ? undefined : 'Failed to commit inline artifact edit.'
        };
    }

    @Mutation(() => CreateInlineDelegatedArtifactResultOutput)
    async CreateInlineDelegatedArtifact(
        @Arg('hostArtifactId') hostArtifactId: string,
        @Arg('name') name: string,
        @Arg('artifactTypeName') artifactTypeName: string,
        @Arg('initialContent') initialContent: string,
        @Ctx() context: AppContext
    ): Promise<CreateInlineDelegatedArtifactResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                ErrorMessage: user ? 'Magic Link sessions cannot mutate artifacts.' : 'Authentication required.'
            };
        }

        const normalizedHostId = (hostArtifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:edit', normalizedHostId || '*', context.userPayload);
        await this.CheckAPIKeyScopeAuthorization('artifact:create', '*', context.userPayload);

        if (!normalizedHostId) {
            return { Success: false, ErrorMessage: 'hostArtifactId is required.' };
        }

        const provider = this.resolveProvider(context);
        const hostPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            normalizedHostId,
            user
        );
        if (!hostPerms.CanEdit) {
            return {
                Success: false,
                ErrorMessage: 'You must have Edit permission on the host artifact to embed a new inline artifact.'
            };
        }

        await ArtifactMetadataEngine.Instance.Config(false, user, provider);
        const artType = ArtifactMetadataEngine.Instance.FindArtifactType(artifactTypeName);
        if (!artType) {
            return {
                Success: false,
                ErrorMessage: `Artifact type '${artifactTypeName}' was not found.`
            };
        }

        const artifactsEntityInfo =
            typeof provider.EntityByName === 'function' ? provider.EntityByName('MJ: Artifacts') : undefined;

        const rv = RunView.FromMetadataProvider(provider);
        const lookupUser = UserCache.Instance.GetSystemUser() ?? user;
        const hostRes = await rv.RunView<{ ID: string; EnvironmentID?: string }>(
            {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${EscapeSQLString(normalizedHostId)}'`,
                Fields: ['ID', 'EnvironmentID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            },
            lookupUser
        );
        if (!hostRes.Success || !hostRes.Results || hostRes.Results.length === 0) {
            return {
                Success: false,
                ErrorMessage: hostRes.ErrorMessage || `Host artifact '${normalizedHostId}' was not found.`
            };
        }
        const hostEnvironmentId = hostRes.Results[0].EnvironmentID;
        if (!hostEnvironmentId) {
            return {
                Success: false,
                ErrorMessage: `Host artifact '${normalizedHostId}' is missing EnvironmentID.`
            };
        }

        const childArtifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
        childArtifact.NewRecord();
        childArtifact.Name = name.trim() || `Embedded ${artifactTypeName}`;
        childArtifact.TypeID = artType.ID;
        childArtifact.UserID = user.ID;
        childArtifact.EnvironmentID = hostEnvironmentId;
        if (artifactsEntityInfo) {
            childArtifact.DelegateEntityID = artifactsEntityInfo.ID;
        }
        childArtifact.DelegateRecordID = normalizedHostId;

        const savedArtifact = await childArtifact.Save();
        if (!savedArtifact) {
            return {
                Success: false,
                ErrorMessage:
                    childArtifact.LatestResult?.CompleteMessage || 'Failed to create delegated child artifact.'
            };
        }

        try {
            const version = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
            version.NewRecord();
            version.ArtifactID = childArtifact.ID;
            version.VersionNumber = 1;
            version.UserID = user.ID;
            version.Content = initialContent;
            version.ContentHash = createHash('sha256').update(initialContent, 'utf8').digest('hex');
            const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
                null,
                initialContent,
                artType.DriverClass ?? null,
                childArtifact.Name ?? null,
                {
                    ArtifactType: artType,
                    AllArtifactTypes: ArtifactMetadataEngine.Instance.ArtifactTypes ?? []
                }
            );
            if (enrichedConfig) {
                version.Configuration = enrichedConfig;
            }

            const savedVersion = await version.Save();
            if (!savedVersion) {
                const rolledBack = await childArtifact.Delete();
                if (!rolledBack) {
                    LogError(
                        `DocumentCollaborationResolver.CreateInlineDelegatedArtifact failed to roll back orphaned child artifact '${childArtifact.ID}': ${
                            childArtifact.LatestResult?.CompleteMessage ?? 'unknown error'
                        }`
                    );
                }
                return {
                    Success: false,
                    ErrorMessage:
                        version.LatestResult?.CompleteMessage || 'Failed to create initial artifact version.'
                };
            }

            return {
                Success: true,
                ArtifactID: childArtifact.ID,
                VersionID: version.ID
            };
        } catch (err) {
            try {
                const rolledBack = await childArtifact.Delete();
                if (!rolledBack) {
                    LogError(
                        `DocumentCollaborationResolver.CreateInlineDelegatedArtifact failed to roll back orphaned child artifact '${childArtifact.ID}' after error.`
                    );
                }
            } catch (rollbackErr) {
                LogError(
                    `DocumentCollaborationResolver.CreateInlineDelegatedArtifact rollback threw for '${childArtifact.ID}': ${
                        rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
                    }`
                );
            }
            return {
                Success: false,
                ErrorMessage: err instanceof Error ? err.message : String(err)
            };
        }
    }

    /**
     * Dispatches an `@mention` inside an anchored document comment (`comment`, `suggest`, or `edit` mode)
     * on the server after verifying API key scopes and permissions via {@link ArtifactPermissionEngine}.
     * - `agentMode === 'edit'` requires `artifact:edit` scope and `CanEdit === true` on `artifactId`.
     * - `agentMode === 'comment' | 'suggest'` requires `artifact:comment` scope and `CanRead === true` on `artifactId`.
     */
    @Mutation(() => ExecuteAnchoredCommentAgentMentionPayload)
    public async ExecuteAnchoredCommentAgentMention(
        @Arg('artifactId', () => String) artifactId: string,
        @Arg('agentHandle', () => String) agentHandle: string,
        @Arg('agentMode', () => String, { defaultValue: 'comment' }) agentMode: string,
        @Arg('commentBody', () => String) commentBody: string,
        @Arg('anchorQuote', () => String, { nullable: true }) anchorQuote: string | undefined,
        @Ctx() context: AppContext,
        @Arg('conversationId', () => String, { nullable: true }) conversationId?: string
    ): Promise<ExecuteAnchoredCommentAgentMentionPayload> {
        const user = this.GetUserFromPayload(context.userPayload) ?? context.userPayload?.userRecord;
        const provider = this.resolveProvider(context);
        const normalizedArtifactId = (artifactId ?? '').trim();
        const normalizedHandle = (agentHandle ?? '').trim().replace(/^@+/, '').trim();
        const normalizedConversationId = (conversationId ?? '').trim();
        const normalizedMode =
            agentMode === 'edit' ? 'edit' : agentMode === 'suggest' ? 'suggest' : 'comment';

        if (!user || !provider || !normalizedArtifactId || !normalizedHandle) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: 'Authenticated user, artifactId, and agentHandle are required.'
            };
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: 'Magic Link sessions cannot invoke anchored comment agent mentions.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization(
            normalizedMode === 'edit' ? 'artifact:edit' : 'artifact:comment',
            normalizedArtifactId,
            context.userPayload
        );

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            normalizedArtifactId,
            user
        );
        if (normalizedMode === 'edit' && !perms.CanEdit) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: `Permission denied: User lacks CanEdit permission on artifact '${normalizedArtifactId}' for '@${normalizedHandle}' in edit mode.`
            };
        }
        if (!perms.CanRead) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: `Permission denied: User lacks CanRead permission on artifact '${normalizedArtifactId}'.`
            };
        }

        const trimmedQuote = (anchorQuote ?? '').trim();
        const escapedHandle = normalizedHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const trimmedInstruction = (commentBody ?? '')
            .replace(new RegExp(`@${escapedHandle}(?![A-Za-z0-9_-])`, 'gi'), '')
            .trim();

        const currentContent = await ArtifactCollaborationServer.Instance.GetRoomContent(
            normalizedArtifactId,
            user,
            provider
        );

        if (normalizedMode === 'edit') {
            if (!trimmedQuote) {
                return {
                    Success: false,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ErrorMessage: 'Edit mode requires a non-empty anchored quote to replace.'
                };
            }
            if (!currentContent.includes(trimmedQuote)) {
                return {
                    Success: false,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ErrorMessage: 'Anchored quote was not found in the current document content.'
                };
            }
        }

        const artifactsEntityInfo =
            typeof provider.EntityByName === 'function' ? provider.EntityByName('MJ: Artifacts') : undefined;
        const linkedEntityFilter = artifactsEntityInfo
            ? ` AND LinkedEntityID='${EscapeSQLString(artifactsEntityInfo.ID)}'`
            : '';

        let matchedAnchorMetadataRaw: string | null | undefined;
        if (normalizedConversationId.length > 0) {
            const rv = RunView.FromMetadataProvider(provider);
            const threadCheck = await rv.RunView<{ ID: string; AnchorMetadata?: string | null }>(
                {
                    EntityName: 'MJ: Conversations',
                    ExtraFilter: `ID='${EscapeSQLString(normalizedConversationId)}' AND LinkedRecordID='${EscapeSQLString(normalizedArtifactId)}'${linkedEntityFilter} AND AnchorType IS NOT NULL`,
                    Fields: ['ID', 'AnchorMetadata'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            const matchedThread = (threadCheck.Results ?? []).find((r) =>
                UUIDsEqual(r.ID, normalizedConversationId)
            );
            if (!threadCheck.Success || !matchedThread) {
                return {
                    Success: false,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ErrorMessage: 'Anchored comment thread not found.'
                };
            }
            matchedAnchorMetadataRaw = matchedThread.AnchorMetadata;
        }

        const resolvedAgent = await this.resolveAgentByHandle(normalizedHandle, user, provider);
        if (!resolvedAgent.Agent) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage:
                    resolvedAgent.ErrorMessage || `No active AI agent matching '@${normalizedHandle}' was found.`
            };
        }
        const agent = resolvedAgent.Agent;

        await this.CheckAPIKeyScopeAuthorization('agent:execute', agent.ID, context.userPayload);

        type MentionExecutionPayload =
            | {
                  replacement?: string;
                  updatedContent?: string;
                  updatedQuote?: string;
                  reply?: string;
                  message?: string;
              }
            | string;
        let agentResult: ExecuteAgentResult<MentionExecutionPayload>;
        try {
            const agentRunner = new AgentRunner(provider);
            const conversationMessages = this.buildAnchoredMentionMessages(
                normalizedMode,
                currentContent,
                trimmedQuote,
                trimmedInstruction || (commentBody ?? '').trim()
            );
            agentResult = await agentRunner.RunAgent<MentionExecutionPayload>({
                agent,
                conversationMessages,
                contextUser: user
            });
        } catch (runErr) {
            const msg = runErr instanceof Error ? runErr.message : String(runErr);
            LogError(`DocumentCollaborationResolver.ExecuteAnchoredCommentAgentMention error: ${msg}`);
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: `Failed to execute AI agent '@${agent.Name}': ${msg}`
            };
        }

        if (!agentResult?.success) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage:
                    agentResult?.errorMessage ||
                    agentResult?.agentRun?.ErrorMessage ||
                    `AI agent '@${agent.Name}' execution failed.`
            };
        }

        const extracted = this.extractMentionAgentOutput(agentResult, normalizedMode);

        if (normalizedMode === 'edit') {
            const proposedFullContent = extracted.UpdatedDocumentContent;
            const proposedReplacement = extracted.Replacement;
            let nextContent: string | null = null;
            let editTargetToken: string | undefined;

            if (typeof proposedFullContent === 'string' && proposedFullContent.trim().length > 0 && !proposedReplacement) {
                if (proposedFullContent === currentContent) {
                    const noopReply = extracted.Reply || 'No changes were needed for the document.';
                    await this.persistAnchoredAgentReplyIfThreadExists(
                        provider,
                        user,
                        normalizedArtifactId,
                        trimmedQuote,
                        agent.ID,
                        noopReply,
                        normalizedConversationId || undefined
                    );
                    return {
                        Success: true,
                        AgentHandle: normalizedHandle,
                        AgentMode: normalizedMode,
                        ReplyBody: noopReply,
                        UpdatedContent: currentContent
                    };
                }
                nextContent = proposedFullContent;
            } else {
                if (
                    typeof proposedReplacement !== 'string' ||
                    proposedReplacement.trim().length === 0 ||
                    proposedReplacement === trimmedQuote
                ) {
                    const plainTextReply = (extracted.Reply ?? '').trim();
                    if (plainTextReply.length > 0) {
                        await this.persistAnchoredAgentReplyIfThreadExists(
                            provider,
                            user,
                            normalizedArtifactId,
                            trimmedQuote,
                            agent.ID,
                            plainTextReply,
                            normalizedConversationId || undefined
                        );
                        return {
                            Success: true,
                            AgentHandle: normalizedHandle,
                            AgentMode: normalizedMode,
                            ReplyBody: plainTextReply
                        };
                    }
                    return {
                        Success: false,
                        AgentHandle: normalizedHandle,
                        AgentMode: normalizedMode,
                        ErrorMessage: `AI agent '@${agent.Name}' did not produce a valid replacement for the anchored quote.`
                    };
                }

                const quoteIdx = this.findDisambiguatedQuoteIndex(
                    currentContent,
                    trimmedQuote,
                    matchedAnchorMetadataRaw
                );
                if (quoteIdx < 0) {
                    return {
                        Success: false,
                        AgentHandle: normalizedHandle,
                        AgentMode: normalizedMode,
                        ErrorMessage: 'Anchored quote is no longer present in the current document content.'
                    };
                }
                nextContent =
                    currentContent.slice(0, quoteIdx) +
                    proposedReplacement +
                    currentContent.slice(quoteIdx + trimmedQuote.length);
                editTargetToken = proposedReplacement;
            }

            if (nextContent === currentContent) {
                const noopReply = extracted.Reply || 'No changes were needed for the document.';
                await this.persistAnchoredAgentReplyIfThreadExists(
                    provider,
                    user,
                    normalizedArtifactId,
                    trimmedQuote,
                    agent.ID,
                    noopReply,
                    normalizedConversationId || undefined
                );
                return {
                    Success: true,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ReplyBody: noopReply,
                    UpdatedContent: currentContent
                };
            }

            const mutated = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
                normalizedArtifactId,
                nextContent,
                user,
                true,
                currentContent,
                { provider }
            );
            if (!mutated.Success) {
                return {
                    Success: false,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ErrorMessage: 'Failed to apply agent edit to collaboration room.'
                };
            }
            const resolvedMergedContent = mutated.MergedContent ?? nextContent;
            const rejectedCount = mutated.RejectedAgentHunks?.length ?? 0;
            let editReply: string;
            if (rejectedCount > 0) {
                const rejectedLinesPreview: string[] = [];
                if (Array.isArray(mutated.RejectedAgentHunks)) {
                    for (const hunk of mutated.RejectedAgentHunks) {
                        if (Array.isArray(hunk.RejectedAgentLines)) {
                            for (const line of hunk.RejectedAgentLines) {
                                const trimmed = line.trim();
                                if (trimmed.length > 0 && rejectedLinesPreview.length < 3) {
                                    rejectedLinesPreview.push(trimmed);
                                }
                            }
                        }
                        if (rejectedLinesPreview.length >= 3) {
                            break;
                        }
                    }
                }
                const previewSnippet =
                    rejectedLinesPreview.length > 0
                        ? ` (rejected: ${rejectedLinesPreview.map((l) => `"${l}"`).join(', ')})`
                        : '';
                const conflictSummary = `${rejectedCount} edit${
                    rejectedCount === 1 ? '' : 's'
                } not applied because of concurrent edits.${previewSnippet}`;
                const allAgentEditsRejected =
                    resolvedMergedContent === currentContent ||
                    (editTargetToken !== undefined && !resolvedMergedContent.includes(editTargetToken));
                if (allAgentEditsRejected) {
                    editReply = extracted.Reply
                        ? `${extracted.Reply} (${conflictSummary})`
                        : conflictSummary;
                } else {
                    const partialBase =
                        extracted.Reply ||
                        `Partially applied edit to anchored selection (saved as Version ${
                            mutated.VersionNumber ?? ''
                        }).`.trim();
                    editReply = `${partialBase} (${conflictSummary})`;
                }
            } else {
                editReply =
                    extracted.Reply ||
                    `Applied edit to anchored selection (saved as Version ${mutated.VersionNumber ?? ''}).`.trim();
            }
            await this.persistAnchoredAgentReplyIfThreadExists(
                provider,
                user,
                normalizedArtifactId,
                trimmedQuote,
                agent.ID,
                editReply,
                normalizedConversationId || undefined
            );
            return {
                Success: true,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ReplyBody: editReply,
                UpdatedContent: resolvedMergedContent,
                VersionID: mutated.VersionID,
                VersionNumber: mutated.VersionNumber
            };
        }

        if (normalizedMode === 'suggest') {
            const replyBody = extracted.Reply;
            const proposedReplacement = extracted.Replacement;
            if (!replyBody && !proposedReplacement) {
                return {
                    Success: false,
                    AgentHandle: normalizedHandle,
                    AgentMode: normalizedMode,
                    ErrorMessage: `AI agent '@${agent.Name}' returned no suggestion output.`
                };
            }
            const finalReply = replyBody || `Suggested revision for "${trimmedQuote || 'anchored block'}".`;
            await this.persistAnchoredAgentReplyIfThreadExists(
                provider,
                user,
                normalizedArtifactId,
                trimmedQuote,
                agent.ID,
                finalReply,
                normalizedConversationId || undefined
            );
            return {
                Success: true,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                UpdatedContent: proposedReplacement || undefined,
                ReplyBody: finalReply
            };
        }

        const commentReply = extracted.Reply;
        if (!commentReply) {
            return {
                Success: false,
                AgentHandle: normalizedHandle,
                AgentMode: normalizedMode,
                ErrorMessage: `AI agent '@${agent.Name}' returned an empty response.`
            };
        }
        await this.persistAnchoredAgentReplyIfThreadExists(
            provider,
            user,
            normalizedArtifactId,
            trimmedQuote,
            agent.ID,
            commentReply,
            normalizedConversationId || undefined
        );
        return {
            Success: true,
            AgentHandle: normalizedHandle,
            AgentMode: normalizedMode,
            ReplyBody: commentReply
        };
    }

    private async resolveAgentByHandle(
        handle: string,
        user: UserInfo,
        provider?: IMetadataProvider | null
    ): Promise<{ Agent: MJAIAgentEntityExtended | null; ErrorMessage?: string }> {
        const stripped = handle.trim().replace(/^@+/, '').trim();
        if (!stripped) {
            return { Agent: null, ErrorMessage: 'Agent handle is required.' };
        }
        const effectiveProvider = provider ?? Metadata.Provider;
        const aiEngine = effectiveProvider
            ? (AIEngineBase.GetProviderInstance<AIEngineBase>(effectiveProvider, AIEngineBase) as AIEngineBase)
            : AIEngineBase.Instance;
        try {
            await aiEngine.Config(false, user, effectiveProvider ?? undefined);
        } catch (cfgErr) {
            const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
            LogError(`DocumentCollaborationResolver.resolveAgentByHandle failed to configure AIEngine for '@${stripped}': ${msg}`);
            return {
                Agent: null,
                ErrorMessage: `Unable to load AI agent catalog for '@${stripped}': ${msg}`
            };
        }

        const agents = aiEngine.Agents ?? [];
        const lower = stripped.toLowerCase();
        const collapsed = lower.replace(/[\s_-]+/g, '');

        const exactMatches = agents.filter((a) => (a.Name ?? '').trim().toLowerCase() === lower);
        const normalizedMatches =
            exactMatches.length > 0
                ? exactMatches
                : agents.filter(
                      (a) => (a.Name ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '') === collapsed
                  );

        if (normalizedMatches.length === 0) {
            return {
                Agent: null,
                ErrorMessage: `No AI agent matching '@${stripped}' was found.`
            };
        }

        const activeAgent = normalizedMatches.find((a) => a.Status === 'Active');
        if (!activeAgent) {
            return {
                Agent: null,
                ErrorMessage: `AI agent '${normalizedMatches[0].Name}' is not active (Status: ${normalizedMatches[0].Status}).`
            };
        }

        if (typeof aiEngine.CanUserRunAgent === 'function') {
            let canRun = false;
            try {
                canRun = await aiEngine.CanUserRunAgent(activeAgent.ID, user);
            } catch (permErr) {
                const msg = permErr instanceof Error ? permErr.message : String(permErr);
                LogError(
                    `DocumentCollaborationResolver.resolveAgentByHandle failed CanUserRunAgent for '${activeAgent.Name}': ${msg}`
                );
                return {
                    Agent: null,
                    ErrorMessage: `Unable to verify run permission for AI agent '${activeAgent.Name}'.`
                };
            }
            if (!canRun) {
                return {
                    Agent: null,
                    ErrorMessage: `User does not have permission to run AI agent '${activeAgent.Name}'.`
                };
            }
        }

        return { Agent: activeAgent };
    }

    private buildAnchoredMentionMessages(
        mode: 'comment' | 'suggest' | 'edit',
        documentContent: string,
        anchoredQuote: string,
        instruction: string
    ): ChatMessage[] {
        const modeGuidance =
            mode === 'edit'
                ? 'Respond with a JSON object {"reply": "<short explanation>", "replacement": "<exact replacement markdown for the anchored quote>"}. Only include the replacement text for the anchored quote itself in "replacement".'
                : mode === 'suggest'
                  ? 'Respond with a JSON object {"reply": "<rationale for suggestion>", "replacement": "<suggested replacement markdown for the anchored quote>"}.'
                  : 'Respond directly and concisely to the user instruction regarding the anchored passage.';

        const userPromptParts: string[] = [
            `Mode: ${mode}`,
            modeGuidance,
            anchoredQuote ? `Anchored Quote:\n"""\n${anchoredQuote}\n"""` : '',
            `User Instruction:\n${instruction}`,
            documentContent ? `Document Context:\n"""\n${documentContent}\n"""` : ''
        ].filter((part) => part.length > 0);

        return [
            {
                role: 'user',
                content: userPromptParts.join('\n\n')
            }
        ];
    }

    private findDisambiguatedQuoteIndex(
        content: string,
        quote: string,
        rawAnchorMetadata?: string | null
    ): number {
        const firstIdx = content.indexOf(quote);
        if (firstIdx < 0) {
            return -1;
        }
        const secondIdx = content.indexOf(quote, firstIdx + 1);
        if (secondIdx < 0 || !rawAnchorMetadata) {
            return firstIdx;
        }

        const occurrences: number[] = [];
        let cursor = firstIdx;
        while (cursor >= 0) {
            occurrences.push(cursor);
            cursor = content.indexOf(quote, cursor + Math.max(1, quote.length));
        }

        try {
            const parsedJson = JSON.parse(rawAnchorMetadata) as {
                from?: number;
                startOffset?: number;
                offset?: number;
                BlockID?: string;
                blockId?: string;
                SegmentID?: string;
                segmentId?: string;
                SlideID?: string;
                slideId?: string;
            };
            const targetOffset =
                typeof parsedJson.from === 'number'
                    ? parsedJson.from
                    : typeof parsedJson.startOffset === 'number'
                      ? parsedJson.startOffset
                      : typeof parsedJson.offset === 'number'
                        ? parsedJson.offset
                        : null;
            if (targetOffset !== null && Number.isFinite(targetOffset)) {
                let bestIdx = firstIdx;
                let bestDist = Math.abs(firstIdx - targetOffset);
                for (const occ of occurrences) {
                    const dist = Math.abs(occ - targetOffset);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIdx = occ;
                    }
                }
                return bestIdx;
            }

            const structuredAnchor = DocumentLiveBlockEngine.Instance.ParseArtifactCommentAnchor(rawAnchorMetadata);
            const blockToken =
                structuredAnchor?.BlockID ??
                structuredAnchor?.SegmentID ??
                structuredAnchor?.SlideID ??
                parsedJson.BlockID ??
                parsedJson.blockId ??
                parsedJson.SegmentID ??
                parsedJson.segmentId ??
                parsedJson.SlideID ??
                parsedJson.slideId;
            if (typeof blockToken === 'string' && blockToken.trim().length > 0) {
                const tokenPos = content.indexOf(blockToken.trim());
                if (tokenPos >= 0) {
                    const afterToken = occurrences.find((occ) => occ >= tokenPos);
                    if (afterToken !== undefined) {
                        return afterToken;
                    }
                }
            }
        } catch {
            // Fall back to first occurrence when AnchorMetadata is malformed
        }

        return firstIdx;
    }

    private extractMentionAgentOutput(
        agentResult: ExecuteAgentResult<{
            replacement?: string;
            updatedContent?: string;
            updatedQuote?: string;
            reply?: string;
            message?: string;
        } | string>,
        _mode: 'comment' | 'suggest' | 'edit'
    ): { Reply?: string; Replacement?: string; UpdatedDocumentContent?: string } {
        type StructuredMentionPayload = {
            replacement?: string;
            updatedContent?: string;
            updatedQuote?: string;
            reply?: string;
            message?: string;
        };
        const parseStructuredCandidate = (
            raw: StructuredMentionPayload | string | null | undefined
        ): { Reply?: string; Replacement?: string; UpdatedDocumentContent?: string } | null => {
            if (!raw) {
                return null;
            }
            if (typeof raw === 'object' && !Array.isArray(raw)) {
                const rep =
                    typeof raw.replacement === 'string'
                        ? raw.replacement
                        : typeof raw.updatedQuote === 'string'
                          ? raw.updatedQuote
                          : undefined;
                const fullDoc = typeof raw.updatedContent === 'string' ? raw.updatedContent : undefined;
                const reply =
                    typeof raw.reply === 'string'
                        ? raw.reply.trim()
                        : typeof raw.message === 'string'
                          ? raw.message.trim()
                          : undefined;
                if (rep !== undefined || fullDoc !== undefined || reply !== undefined) {
                    return { Reply: reply, Replacement: rep, UpdatedDocumentContent: fullDoc };
                }
                return null;
            }
            if (typeof raw === 'string') {
                const trimmed = raw.trim();
                if (!trimmed) {
                    return null;
                }
                const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
                const jsonCandidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
                if (jsonCandidate.startsWith('{') && jsonCandidate.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(jsonCandidate) as StructuredMentionPayload;
                        return parseStructuredCandidate(parsed);
                    } catch {
                        // Fall through to plain text handling
                    }
                }
            }
            return null;
        };

        const fromPayload = parseStructuredCandidate(agentResult.payload);
        if (fromPayload) {
            return fromPayload;
        }
        const fromFinalPayload = parseStructuredCandidate(agentResult.agentRun?.FinalPayload);
        if (fromFinalPayload) {
            return fromFinalPayload;
        }
        const rawRunMessage = (agentResult.agentRun?.Message ?? '').trim();
        const fromMessageJson = parseStructuredCandidate(rawRunMessage);
        if (fromMessageJson) {
            return fromMessageJson;
        }

        // Plain non-JSON agent text is treated strictly as a conversational reply (`P0-15`),
        // never as a document replacement string.
        if (typeof agentResult.payload === 'string' && agentResult.payload.trim().length > 0) {
            return { Reply: agentResult.payload.trim() };
        }
        if (rawRunMessage.length > 0) {
            return { Reply: rawRunMessage };
        }
        return {};
    }

    private async persistAnchoredAgentReplyIfThreadExists(
        provider: IMetadataProvider,
        user: UserInfo,
        artifactId: string,
        anchorQuote: string,
        agentId: string,
        replyMessage: string,
        conversationId?: string
    ): Promise<void> {
        if (!replyMessage.trim()) {
            return;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const artifactsEntityInfo =
                typeof provider.EntityByName === 'function' ? provider.EntityByName('MJ: Artifacts') : undefined;
            const linkedEntityFilter = artifactsEntityInfo
                ? ` AND LinkedEntityID='${EscapeSQLString(artifactsEntityInfo.ID)}'`
                : '';
            const conversationFilterPrefix = conversationId
                ? `ID='${EscapeSQLString(conversationId)}' AND `
                : '';
            const convRes = await rv.RunView<{
                ID: string;
                AnchorMetadata?: string | null;
            }>(
                {
                    EntityName: 'MJ: Conversations',
                    ExtraFilter: `${conversationFilterPrefix}LinkedRecordID='${EscapeSQLString(artifactId)}'${linkedEntityFilter} AND AnchorType IS NOT NULL`,
                    OrderBy: '__mj_CreatedAt DESC',
                    Fields: ['ID', 'AnchorMetadata'],
                    MaxRows: 10,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            if (!convRes.Success) {
                LogError(
                    `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists failed querying anchored conversations for artifact '${artifactId}': ${
                        convRes.ErrorMessage || 'RunView returned Success=false'
                    }`
                );
                return;
            }
            if (!convRes.Results || convRes.Results.length === 0) {
                LogError(
                    `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists found no anchored conversation threads on artifact '${artifactId}' (conversationId=${
                        conversationId ?? 'none'
                    }, anchorQuote=${anchorQuote ? JSON.stringify(anchorQuote.slice(0, 80)) : 'none'}).`
                );
                return;
            }

            let targetConversationId: string | undefined;
            if (conversationId) {
                const matched = convRes.Results.find((row) => UUIDsEqual(row.ID, conversationId));
                targetConversationId = matched?.ID;
            } else if (anchorQuote) {
                for (const row of convRes.Results) {
                    if (!row.AnchorMetadata) {
                        continue;
                    }
                    try {
                        const meta = JSON.parse(row.AnchorMetadata) as {
                            quote?: string;
                            status?: string;
                        };
                        if (meta.status !== 'Resolved' && meta.quote?.trim() === anchorQuote) {
                            targetConversationId = row.ID;
                            break;
                        }
                    } catch (parseErr) {
                        LogError(
                            `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists failed parsing AnchorMetadata on conversation '${row.ID}': ${
                                parseErr instanceof Error ? parseErr.message : String(parseErr)
                            }`
                        );
                    }
                }
            }
            if (!targetConversationId) {
                LogError(
                    `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists could not match an open anchored thread on artifact '${artifactId}' (conversationId=${
                        conversationId ?? 'none'
                    }, anchorQuote=${anchorQuote ? JSON.stringify(anchorQuote.slice(0, 80)) : 'none'}).`
                );
                return;
            }

            const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                user
            );
            detail.NewRecord();
            detail.ConversationID = targetConversationId;
            detail.Role = 'AI';
            detail.AgentID = agentId;
            detail.UserID = user.ID;
            detail.Message = replyMessage;
            detail.Status = 'Complete';
            const saved = await detail.Save();
            if (!saved) {
                LogError(
                    `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists failed to save AI reply on conversation '${targetConversationId}': ${
                        detail.LatestResult?.CompleteMessage ?? 'Save() returned false'
                    }`
                );
            }
        } catch (err) {
            LogError(
                `DocumentCollaborationResolver.persistAnchoredAgentReplyIfThreadExists error: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }

    /**
     * Authoritatively restores an artifact version by cloning its content/configuration into a new sequential
     * version marked with `MarkTrustedServerRestoreSave` and applying the restore state across active collaboration
     * rooms and peer replica nodes (`R9-2`).
     */
    @Mutation(() => RestoreArtifactVersionResultOutput)
    public async RestoreArtifactVersion(
        @Arg('artifactId', () => String) artifactId: string,
        @Arg('sourceVersionId', () => String) sourceVersionId: string,
        @Ctx() context: AppContext
    ): Promise<RestoreArtifactVersionResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload) ?? context.userPayload?.userRecord;
        const provider = this.resolveProvider(context);
        const normalizedArtifactId = (artifactId ?? '').trim();
        const normalizedSourceVersionId = (sourceVersionId ?? '').trim();

        if (!user || !provider || !normalizedArtifactId || !normalizedSourceVersionId) {
            return {
                Success: false,
                ErrorMessage: 'Authenticated user, artifactId, and sourceVersionId are required.'
            };
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return {
                Success: false,
                ErrorMessage: 'Magic Link sessions cannot restore artifact versions.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization('artifact:edit', normalizedArtifactId, context.userPayload);

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            normalizedArtifactId,
            user
        );
        if (!perms.CanEdit) {
            return {
                Success: false,
                ErrorMessage: 'Permission denied: Edit permission is required to restore an artifact version.'
            };
        }

        const sourceVersion = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
        const loaded = await sourceVersion.Load(normalizedSourceVersionId);
        if (!loaded || !sourceVersion.IsSaved || !UUIDsEqual(sourceVersion.ArtifactID, normalizedArtifactId)) {
            return {
                Success: false,
                ErrorMessage: 'Source artifact version not found or does not belong to the specified artifact.'
            };
        }

        const rv = RunView.FromMetadataProvider(provider);
        let restoreTypeEntity: MJArtifactTypeEntity | null = null;
        let allRestoreTypes: ReadonlyArray<MJArtifactTypeEntity> = [];
        let isArtifactOwner = false;
        try {
            await ArtifactMetadataEngine.Instance.Config(false, user, provider);
            allRestoreTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
            const artMetaRes = await rv.RunView<{
                TypeID?: string | null;
                UserID?: string | null;
                DelegateEntityID?: string | null;
                DelegateRecordID?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(normalizedArtifactId)}'`,
                    Fields: ['TypeID', 'UserID', 'DelegateEntityID', 'DelegateRecordID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            const artMeta = artMetaRes.Success ? artMetaRes.Results?.[0] : undefined;
            const typeId = artMeta?.TypeID;
            if (typeId) {
                restoreTypeEntity = allRestoreTypes.find((t) => UUIDsEqual(t.ID, typeId)) ?? null;
            }
            isArtifactOwner = Boolean(
                artMeta?.UserID &&
                UUIDsEqual(artMeta.UserID, user.ID) &&
                !(artMeta.DelegateEntityID && artMeta.DelegateRecordID)
            );
        } catch {
            // Fall back safely when unit-test mocks omit artifact type metadata
        }

        const isFileMode = sourceVersion.ContentMode === 'File';
        let enrichedRestoredConfig: string | null | undefined;
        if (isFileMode) {
            enrichedRestoredConfig = sourceVersion.Configuration;
        } else {
            const sourceParsedConfig = ParseArtifactVersionConfiguration(sourceVersion.Configuration);
            const restorePolicy = ResolveArtifactTypeThumbnailPolicy(
                restoreTypeEntity,
                allRestoreTypes,
                restoreTypeEntity?.DriverClass ?? null
            );
            enrichedRestoredConfig = BuildArtifactVersionConfigurationWithPreview(
                sourceVersion.Configuration,
                sourceVersion.Content,
                restoreTypeEntity?.DriverClass ?? null,
                sourceVersion.Name ?? null,
                {
                    Policy: restorePolicy,
                    ArtifactType: restoreTypeEntity,
                    AllArtifactTypes: allRestoreTypes,
                    CapturedThumbnailDataUrl: sourceParsedConfig?.thumbnailDataUrl ?? null
                }
            );
        }

        const nextRestoredContent = sourceVersion.Content ?? '';
        const nextRestoredConfig = enrichedRestoredConfig ?? sourceVersion.Configuration ?? null;

        // B2 / R5 / R5-1: Verify restored content & configuration against latest persisted version,
        // persisted working state (YjsState decoded as SystemUser since UI roles have CanRead: false),
        // and any active collaboration room before saving (and on every conflict retry).
        const verifyRestoreLocks = async (): Promise<string | null> => {
            if (isArtifactOwner) {
                return null;
            }
            const systemActor = UserCache.Instance.GetSystemUser();
            if (!systemActor) {
                return 'Permission denied: unable to verify active artifact working-state locks before restore.';
            }
            const [latestForLockRes, wsForLockRes] = await Promise.all([
                rv.RunView<{
                    VersionNumber: number;
                    Content?: string | null;
                    Configuration?: string | null;
                }>(
                    {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ArtifactID='${EscapeSQLString(normalizedArtifactId)}'`,
                        Fields: ['VersionNumber', 'Content', 'Configuration'],
                        OrderBy: 'VersionNumber DESC',
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    user
                ),
                rv.RunView<{ ID?: string; YjsState?: string | Uint8Array | null }>(
                    {
                        EntityName: 'MJ: Artifact Working States',
                        ExtraFilter: `ArtifactID='${EscapeSQLString(normalizedArtifactId)}'`,
                        Fields: ['ID', 'ArtifactID', 'YjsState'],
                        IncludeBinaryFields: true,
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    systemActor
                )
            ]);
            if (!latestForLockRes.Success) {
                return (
                    latestForLockRes.ErrorMessage ||
                    'Permission denied: unable to verify latest artifact version locks before restore.'
                );
            }
            if (!wsForLockRes.Success) {
                return (
                    wsForLockRes.ErrorMessage ||
                    'Permission denied: unable to verify active artifact working-state locks before restore.'
                );
            }

            const baselines: Array<{ content: string; configuration: string | null }> = [];
            const activeRoomBaseline = ArtifactCollaborationServer.Instance.GetActiveRoomLockBaseline(
                normalizedArtifactId,
                provider,
                user
            );
            if (activeRoomBaseline) {
                baselines.push({
                    content: activeRoomBaseline.Content,
                    configuration: activeRoomBaseline.Configuration
                });
            }
            const latestForLock = latestForLockRes.Results?.[0];
            if (latestForLock) {
                baselines.push({
                    content: latestForLock.Content ?? '',
                    configuration: latestForLock.Configuration ?? null
                });
            }
            const wsRow = wsForLockRes.Results?.[0];
            if (wsRow?.YjsState) {
                const wsContent = ArtifactCollaborationServer.Instance.DeserializeWorkingStateBytesToContent(wsRow.YjsState);
                if (wsContent.length > 0) {
                    baselines.push({
                        content: wsContent,
                        configuration: latestForLock?.Configuration ?? null
                    });
                }
            }

            for (const baseline of baselines) {
                const lockCheck = ValidateArtifactContentMutationAgainstLocks(
                    baseline.content,
                    nextRestoredContent,
                    user.ID,
                    false,
                    {
                        currentConfiguration: baseline.configuration,
                        nextConfiguration: nextRestoredConfig
                    }
                );
                if (!lockCheck.Allowed) {
                    return (
                        lockCheck.Reason ||
                        'Permission denied: restoring this version would modify or remove locked content owned by another user.'
                    );
                }
            }
            return null;
        };

        let restoredVer: MJArtifactVersionEntity | null = null;
        let nextVersionNumber = 0;
        let lastErrorMessage = 'Failed to save restored artifact version.';

        for (let attempt = 0; attempt < MAX_RESTORE_VERSION_CONFLICT_RETRIES; attempt++) {
            const lockDenialReason = await verifyRestoreLocks();
            if (lockDenialReason) {
                return {
                    Success: false,
                    ErrorMessage: lockDenialReason
                };
            }

            const rvRes = await rv.RunView<{ VersionNumber: number }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(normalizedArtifactId)}'`,
                    Fields: ['VersionNumber'],
                    OrderBy: 'VersionNumber DESC',
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            const maxVersion =
                rvRes.Success && rvRes.Results && rvRes.Results.length > 0 && typeof rvRes.Results[0]?.VersionNumber === 'number'
                    ? rvRes.Results[0].VersionNumber
                    : sourceVersion.VersionNumber;
            nextVersionNumber = maxVersion + 1 + (attempt > 0 ? attempt : 0);

            const candidateVer = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
            candidateVer.NewRecord();
            candidateVer.ArtifactID = normalizedArtifactId;
            candidateVer.UserID = user.ID;
            candidateVer.VersionNumber = nextVersionNumber;
            candidateVer.Name = sourceVersion.Name;
            candidateVer.Description = `Restored from v${sourceVersion.VersionNumber}`;
            candidateVer.Comments = `Restored from v${sourceVersion.VersionNumber}`;
            candidateVer.ContentMode = sourceVersion.ContentMode;
            candidateVer.FileID = sourceVersion.FileID;
            candidateVer.MimeType = sourceVersion.MimeType;
            candidateVer.FileName = sourceVersion.FileName;
            candidateVer.ContentSizeBytes = sourceVersion.ContentSizeBytes;
            candidateVer.ContentHash = sourceVersion.ContentHash;
            candidateVer.Content = sourceVersion.Content;
            if (enrichedRestoredConfig !== null && enrichedRestoredConfig !== undefined) {
                candidateVer.Configuration = enrichedRestoredConfig;
            }

            MarkTrustedServerRestoreSave(candidateVer);
            const saved = await candidateVer.Save();
            if (saved) {
                restoredVer = candidateVer;
                break;
            }
            const errMsg = candidateVer.LatestResult?.CompleteMessage || 'Failed to save restored artifact version.';
            lastErrorMessage = errMsg;
            const looksLikeVersionConflict =
                /duplicate|unique|conflict|2601|2627|23505|versionnumber/i.test(errMsg);
            if (!looksLikeVersionConflict) {
                break;
            }
        }

        if (!restoredVer) {
            return {
                Success: false,
                ErrorMessage: lastErrorMessage
            };
        }

        if (!isFileMode) {
            await ArtifactCollaborationServer.Instance.RestoreToSavedVersion(
                normalizedArtifactId,
                {
                    ID: restoredVer.ID,
                    VersionNumber: nextVersionNumber,
                    Content: restoredVer.Content,
                    Configuration: restoredVer.Configuration,
                    UserID: user.ID
                },
                user,
                provider
            );
        }

        return {
            Success: true,
            VersionID: restoredVer.ID,
            VersionNumber: nextVersionNumber
        };
    }
}

@ObjectType()
export class RestoreArtifactVersionResultOutput {
    @Field(() => Boolean)
    public Success!: boolean;

    @Field(() => String, { nullable: true })
    public ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    public VersionID?: string;

    @Field(() => Int, { nullable: true })
    public VersionNumber?: number;
}

@ObjectType()
export class ExecuteAnchoredCommentAgentMentionPayload {
    @Field(() => Boolean)
    public Success!: boolean;

    @Field(() => String)
    public AgentHandle!: string;

    @Field(() => String)
    public AgentMode!: string;

    @Field(() => String, { nullable: true })
    public ReplyBody?: string;

    @Field(() => String, { nullable: true })
    public UpdatedContent?: string;

    @Field(() => String, { nullable: true })
    public VersionID?: string;

    @Field(() => Int, { nullable: true })
    public VersionNumber?: number;

    @Field(() => String, { nullable: true })
    public ErrorMessage?: string;
}
