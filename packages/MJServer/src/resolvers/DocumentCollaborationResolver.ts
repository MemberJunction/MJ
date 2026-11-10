import { createHash } from 'node:crypto';
import { Resolver, Query, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { IMetadataProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString } from '@memberjunction/global';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    ValidateFrozenBlockSnapshot
} from '@memberjunction/core-entities';
import { ApiRoute } from '../apiRoot.js';
import { configInfo } from '../config.js';
import {
    ARTIFACT_COLLABORATION_WS_PATH,
    ArtifactCollaborationServer
} from '../collaboration/ArtifactCollaborationServer.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';

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
        if (!user) {
            return {
                Success: false,
                CanRead: false,
                CanEdit: false,
                ErrorMessage: 'Authentication required.'
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

        const issued = ArtifactCollaborationServer.Instance.IssueTicket({
            ArtifactID: normalizedArtifactId,
            User: user,
            ApiKeyHash: context.userPayload.apiKeyHash
        });

        const wsPath = ApiRoute(ARTIFACT_COLLABORATION_WS_PATH);
        const wsUrl = ApiRoute(ARTIFACT_COLLABORATION_WS_PATH, { absolute: true }).replace(/^http/i, 'ws');

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
        if (!user) {
            return {
                ArtifactID: artifactId,
                CanRead: false,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Denied',
                Reason: 'Authentication required.'
            };
        }

        await this.CheckAPIKeyScopeAuthorization('artifact:read', artifactId, context.userPayload);

        const provider = this.resolveProvider(context);
        return await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
    }

    @Query(() => VerifyFrozenBlockSnapshotOutput)
    async VerifyFrozenBlockSnapshot(
        @Arg('specJson') specJson: string
    ): Promise<VerifyFrozenBlockSnapshotOutput> {
        try {
            const spec = JSON.parse(specJson) as DocumentBlockSpec;
            if (!spec || spec.Mode !== 'Frozen' || !spec.FrozenSnapshot) {
                return {
                    Valid: false,
                    SnapshotVerified: false,
                    ErrorMessage: 'Block is not a frozen snapshot.'
                };
            }
            const validation = ValidateFrozenBlockSnapshot(spec.FrozenSnapshot);
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
        if (!user) {
            return {
                Success: false,
                AccessDenied: true,
                ErrorMessage: 'Authentication required.',
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
        if (!user) {
            return { Success: false, ErrorMessage: 'Authentication required.' };
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
                provider
            );
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
        @Ctx() context: AppContext
    ): Promise<CommitArtifactInlineEditResultOutput> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user) {
            return { Success: false, ErrorMessage: 'Authentication required.' };
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

        const applied = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            artifactId,
            content,
            user,
            saveVersion
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
        if (!user) {
            return { Success: false, ErrorMessage: 'Authentication required.' };
        }

        const normalizedHostId = (hostArtifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:edit', normalizedHostId || '*', context.userPayload);

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

        const artifactsEntityInfo = provider.Entities.find((e) => e.Name === 'MJ: Artifacts');
        if (!artifactsEntityInfo) {
            return {
                Success: false,
                ErrorMessage: 'MJ: Artifacts entity metadata not found.'
            };
        }

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
        childArtifact.DelegateEntityID = artifactsEntityInfo.ID;
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
}
