import { createHash } from 'node:crypto';
import { BaseLLM, ChatMessageRole, ChatParams, GetAIAPIKey } from '@memberjunction/ai';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper, AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    BaseRemotableOperation,
    IMetadataProvider,
    LogError,
    RemoteOperationError,
    RemoteOpServerContext,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    ArtifactSynthesisEngine,
    ArtifactSynthesisSourceInput,
    BuildArtifactVersionConfigurationWithPreview,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJCollectionArtifactEntity,
    MJEnvironmentEntityExtended,
    SynthesizeArtifactFromSourcesInput,
    SynthesizeArtifactFromSourcesOperation,
    SynthesizeArtifactFromSourcesOutput,
} from '@memberjunction/core-entities';
import { EscapeSQLString, GetGlobalObjectStore, IsValidUUID, MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';

const GLOBAL_KEY_SYNTHESIS_SCOPE_CACHE = '__MJ_SYNTHESIS_RESOLVED_SCOPE_CACHE__';

interface ResolvedSynthesisScope {
    CombinedSourceIds: string[];
    CollectionId: string | null;
    CollectionEnvironmentId: string | null;
}

interface CachedSynthesisScopeEntry {
    userId: string;
    scope: ResolvedSynthesisScope;
}

function getSynthesisScopeCache(): WeakMap<object, CachedSynthesisScopeEntry> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_SYNTHESIS_SCOPE_CACHE];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<object, CachedSynthesisScopeEntry>();
        store[GLOBAL_KEY_SYNTHESIS_SCOPE_CACHE] = created;
        return created;
    }
    return new WeakMap<object, CachedSynthesisScopeEntry>();
}

/**
 * Server-side Remote Operation implementing `Artifact.SynthesizeFromSources`.
 *
 * Replaces the bespoke GraphQL mutation so callers invoke {@link SynthesizeArtifactFromSourcesOperation.Execute}
 * uniformly on client (over `ExecuteRemoteOperation` + `RemoteOperationProgress`) and server (in-process).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY)
export class SynthesizeArtifactFromSourcesServerOperation extends SynthesizeArtifactFromSourcesOperation {
    protected override async Authorize(
        input: SynthesizeArtifactFromSourcesInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }

        const scope = await this.resolveCombinedSourceScope(input, provider, user);
        for (const srcId of scope.CombinedSourceIds) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, srcId, user);
            if (!perms.CanRead) {
                throw new RemoteOperationError(
                    'ACCESS_DENIED',
                    `Permission denied: User lacks CanRead permission on source artifact '${srcId}'.`,
                );
            }
        }
        if (input && typeof input === 'object') {
            getSynthesisScopeCache().set(input, { userId: user.ID, scope });
        }
        return true;
    }

    protected override async InternalExecute(
        input: SynthesizeArtifactFromSourcesInput,
        provider: IMetadataProvider,
        user: UserInfo,
        context: RemoteOpServerContext,
    ): Promise<SynthesizeArtifactFromSourcesOutput> {
        const scopeCache = getSynthesisScopeCache();
        const cachedEntry = input && typeof input === 'object' ? scopeCache.get(input) : undefined;
        if (cachedEntry) {
            scopeCache.delete(input);
        }
        const scope =
            cachedEntry && UUIDsEqual(cachedEntry.userId, user.ID)
                ? cachedEntry.scope
                : await this.resolveCombinedSourceScope(input, provider, user);
        const normalizedKind = ArtifactSynthesisEngine.Instance.NormalizeTargetKind(input.TargetKind);

        context.emitProgress({
            OperationKey: ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            Handle: context.handle,
            Status: 'Reading',
            Processed: 1,
            Total: 4,
            Message: `Loading ${scope.CombinedSourceIds.length} source artifact(s)...`,
        });

        const { Sources, EnvironmentID, ErrorMessage } = await this.loadSynthesisSourceInputs(
            provider,
            user,
            scope.CombinedSourceIds,
        );
        if (Sources.length === 0) {
            throw new RemoteOperationError(
                'NOT_FOUND',
                ErrorMessage || 'No readable source artifacts could be loaded.',
            );
        }

        const digests = Sources.map((s) => ArtifactSynthesisEngine.Instance.ExtractSourceDigest(s));
        const allowedSourceIds = digests.map((d) => d.ArtifactID);
        const availableCharts = digests.flatMap((d) => d.EmbeddedCharts);
        const linkCharts = input.LinkChartsAndRanges !== false;
        const cleanTitle = (input.Title ?? '').trim();
        const cleanGoal = (input.Goal ?? '').trim();
        const prompts = ArtifactSynthesisEngine.Instance.BuildSynthesisPrompts({
            Digests: digests,
            TargetKind: normalizedKind,
            Goal: cleanGoal,
            Title: cleanTitle || undefined,
            LinkChartsAndRanges: linkCharts,
        });

        context.emitProgress({
            OperationKey: ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            Handle: context.handle,
            Status: 'Synthesizing',
            Processed: 2,
            Total: 4,
            Message: `Synthesizing ${normalizedKind} from ${digests.length} source(s)...`,
        });

        let rawModelOutput = '';
        let usedFallback = false;
        let resolvedAgentRunId: string | null = null;
        let resolvedAgentName: string | null = null;

        const trimmedAgentHandle = (input.AgentHandle ?? '').trim().replace(/^@+/, '').trim();
        if (trimmedAgentHandle) {
            const agent = await this.resolveAgentByHandle(trimmedAgentHandle, provider, user);
            const agentRunner = new AgentRunner(provider);
            const runRes = await agentRunner.RunAgent<string>({
                agent,
                conversationMessages: [
                    {
                        role: 'system',
                        content: prompts.SystemPrompt,
                    },
                    {
                        role: 'user',
                        content: prompts.UserPrompt,
                    },
                ],
                contextUser: user,
            });
            if (!runRes.success) {
                throw new RemoteOperationError(
                    'AGENT_EXECUTION_FAILED',
                    runRes.errorMessage || `AI agent '@${agent.Name}' failed to synthesize.`,
                );
            }
            resolvedAgentRunId = runRes.agentRun?.ID ?? null;
            resolvedAgentName = agent.Name ?? null;
            rawModelOutput =
                typeof runRes.payload === 'string'
                    ? runRes.payload
                    : runRes.payload != null
                      ? JSON.stringify(runRes.payload)
                      : '';
        } else {
            rawModelOutput = await this.runDirectSynthesisLlm(prompts.SystemPrompt, prompts.UserPrompt, provider, user);
        }

        let normalized = rawModelOutput
            ? ArtifactSynthesisEngine.Instance.NormalizeSynthesizedOutput({
                  TargetKind: normalizedKind,
                  RawOutput: rawModelOutput,
                  FallbackTitle: cleanTitle || undefined,
                  AllowedSourceArtifactIds: allowedSourceIds,
                  AvailableChartRefs: availableCharts,
              })
            : null;

        if (!normalized) {
            usedFallback = true;
            normalized = ArtifactSynthesisEngine.Instance.BuildDeterministicFallbackSynthesis(
                digests,
                normalizedKind,
                cleanTitle,
                cleanGoal,
                linkCharts,
            );
        }

        context.emitProgress({
            OperationKey: ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            Handle: context.handle,
            Status: 'Saving',
            Processed: 3,
            Total: 4,
            Message: `Saving "${normalized.Title}" (v1)...`,
        });

        const persisted = await this.persistSynthesizedArtifactRecord({
            provider,
            user,
            normalized,
            collectionId: scope.CollectionId,
            environmentId: EnvironmentID || scope.CollectionEnvironmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID,
            sourceArtifactIds: allowedSourceIds,
            agentRunId: resolvedAgentRunId,
            agentName: resolvedAgentName,
        });

        context.emitProgress({
            OperationKey: ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            Handle: context.handle,
            Status: 'Completed',
            Processed: 4,
            Total: 4,
            Message: `Created "${normalized.Title}"`,
        });

        return {
            ArtifactID: persisted.ArtifactID,
            VersionID: persisted.VersionID,
            VersionNumber: 1,
            Title: normalized.Title,
            ArtifactTypeName: normalized.ArtifactTypeName,
            LinkedChartCount: normalized.LinkedChartCount,
            SourceCount: digests.length,
            Warnings: normalized.Warnings,
            UsedFallback: usedFallback,
            AgentRunID: resolvedAgentRunId,
            AgentName: resolvedAgentName,
        };
    }

    private async resolveCombinedSourceScope(
        input: SynthesizeArtifactFromSourcesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ResolvedSynthesisScope> {
        const trimmedCollectionId = (input.CollectionId ?? '').trim();
        let collectionEnvironmentId: string | null = null;
        const combinedSourceIds: string[] = [];
        const seenIds = new Set<string>();

        const addUniqueSourceId = (id: string): void => {
            const clean = id.trim();
            if (!clean) return;
            const key = clean.toLowerCase();
            if (!seenIds.has(key)) {
                seenIds.add(key);
                combinedSourceIds.push(clean);
            }
        };

        for (const id of input.SourceArtifactIds ?? []) {
            if (typeof id === 'string') {
                addUniqueSourceId(id);
            }
        }

        if (trimmedCollectionId) {
            const colResult = await this.resolveCollectionForSynthesis(
                provider,
                user,
                trimmedCollectionId,
                combinedSourceIds.length === 0,
            );
            collectionEnvironmentId = colResult.EnvironmentID;
            for (const colArtId of colResult.ArtifactIDs) {
                addUniqueSourceId(colArtId);
            }
        }

        if (combinedSourceIds.length === 0) {
            throw new RemoteOperationError(
                'INVALID_INPUT',
                'Select at least one readable source artifact or non-empty collection to synthesize.',
            );
        }

        for (const srcId of combinedSourceIds) {
            if (!IsValidUUID(srcId)) {
                throw new RemoteOperationError('INVALID_INPUT', `Invalid source artifact UUID '${srcId}'.`);
            }
        }

        return {
            CombinedSourceIds: combinedSourceIds,
            CollectionId: trimmedCollectionId || null,
            CollectionEnvironmentId: collectionEnvironmentId,
        };
    }

    private async resolveCollectionForSynthesis(
        provider: IMetadataProvider,
        user: UserInfo,
        collectionId: string,
        loadCollectionArtifacts: boolean,
    ): Promise<{ EnvironmentID: string | null; ArtifactIDs: string[] }> {
        if (!IsValidUUID(collectionId)) {
            throw new RemoteOperationError('INVALID_INPUT', `Invalid collectionId UUID '${collectionId}'.`);
        }

        const rv = RunView.FromMetadataProvider(provider);
        const colRes = await rv.RunView<{ ID: string; OwnerID?: string | null; EnvironmentID?: string | null }>(
            {
                EntityName: 'MJ: Collections',
                ExtraFilter: `ID='${EscapeSQLString(collectionId)}'`,
                Fields: ['ID', 'OwnerID', 'EnvironmentID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            user,
        );
        if (!colRes.Success || !colRes.Results?.length) {
            throw new RemoteOperationError('NOT_FOUND', `Target collection '${collectionId}' was not found.`);
        }
        const collection = colRes.Results[0];
        const collectionPerms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider,
            collectionId,
            user,
        );
        if (!collectionPerms.CanEdit) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                collectionPerms.Reason
                    ? `Permission denied (CanEdit required on target collection): ${collectionPerms.Reason}`
                    : 'Permission denied: User lacks CanEdit permission on the target collection.',
            );
        }

        const artifactIds: string[] = [];
        if (loadCollectionArtifacts) {
            const linkRes = await rv.RunView<{ ArtifactVersionID?: string | null }>(
                {
                    EntityName: 'MJ: Collection Artifacts',
                    ExtraFilter: `CollectionID='${EscapeSQLString(collectionId)}'`,
                    Fields: ['ArtifactVersionID'],
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                },
                user,
            );
            const verIds = Array.from(
                new Set(
                    (linkRes.Success && linkRes.Results ? linkRes.Results : [])
                        .map((r) => (r.ArtifactVersionID ?? '').trim())
                        .filter(Boolean),
                ),
            );
            const chunkSize = 200;
            for (let i = 0; i < verIds.length; i += chunkSize) {
                const chunk = verIds.slice(i, i + chunkSize);
                const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                const verRes = await rv.RunView<{ ArtifactID?: string | null }>(
                    {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ID IN (${inList})`,
                        Fields: ['ArtifactID'],
                        SkipTotalRowCount: true,
                        ResultType: 'simple',
                    },
                    user,
                );
                for (const row of verRes.Success && verRes.Results ? verRes.Results : []) {
                    const artId = (row.ArtifactID ?? '').trim();
                    if (artId) artifactIds.push(artId);
                }
            }
        }

        return {
            EnvironmentID: collection.EnvironmentID ?? null,
            ArtifactIDs: artifactIds,
        };
    }

    private async resolveAgentByHandle(
        handle: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<MJAIAgentEntityExtended> {
        const aiEngine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        await aiEngine.Config(false, user, provider);
        const agents = aiEngine.Agents ?? [];
        const lower = handle.toLowerCase();
        const collapsed = lower.replace(/[\s_-]+/g, '');
        const exactMatches = agents.filter((a) => (a.Name ?? '').trim().toLowerCase() === lower);
        const normalizedMatches =
            exactMatches.length > 0
                ? exactMatches
                : agents.filter((a) => (a.Name ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '') === collapsed);

        if (normalizedMatches.length === 0) {
            throw new RemoteOperationError('NOT_FOUND', `No AI agent matching '@${handle}' was found.`);
        }
        const activeAgent = normalizedMatches.find((a) => a.Status === 'Active');
        if (!activeAgent) {
            throw new RemoteOperationError(
                'INVALID_INPUT',
                `AI agent '${normalizedMatches[0].Name}' is not active (Status: ${normalizedMatches[0].Status}).`,
            );
        }
        const canRun = await AIAgentPermissionHelper.HasPermission(activeAgent.ID, user, 'run');
        if (!canRun) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                `User does not have permission to run AI agent '${activeAgent.Name}'.`,
            );
        }
        return activeAgent;
    }

    private async loadSynthesisSourceInputs(
        provider: IMetadataProvider,
        user: UserInfo,
        artifactIds: ReadonlyArray<string>,
    ): Promise<{ Sources: ArtifactSynthesisSourceInput[]; EnvironmentID: string | null; ErrorMessage?: string }> {
        const rv = RunView.FromMetadataProvider(provider);
        const sources: ArtifactSynthesisSourceInput[] = [];
        let firstEnvironmentId: string | null = null;

        for (const artId of artifactIds) {
            const artRes = await rv.RunView<{
                ID: string;
                Name?: string | null;
                Description?: string | null;
                EnvironmentID?: string | null;
                Type?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(artId)}'`,
                    Fields: ['ID', 'Name', 'Description', 'EnvironmentID', 'Type'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                },
                user,
            );
            if (!artRes.Success || !artRes.Results?.length) {
                return { Sources: [], EnvironmentID: null, ErrorMessage: `Source artifact '${artId}' was not found.` };
            }
            const art = artRes.Results[0];
            if (!firstEnvironmentId && art.EnvironmentID) {
                firstEnvironmentId = art.EnvironmentID;
            }

            const verRes = await rv.RunView<{
                ID: string;
                VersionNumber?: number | null;
                ContentMode?: MJArtifactVersionEntity['ContentMode'];
                Content?: string | null;
                Configuration?: string | null;
                MimeType?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(artId)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'ContentMode', 'Content', 'Configuration', 'MimeType'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                },
                user,
            );
            const ver = verRes.Success && verRes.Results?.length ? verRes.Results[0] : undefined;
            sources.push({
                ArtifactID: art.ID,
                Name: (art.Name ?? 'Untitled Artifact').trim(),
                ArtifactType: (art.Type ?? 'Markdown Document').trim(),
                VersionNumber: ver?.VersionNumber ?? undefined,
                ContentMode: ver?.ContentMode,
                Content: ver?.Content ?? null,
                Configuration: ver?.Configuration ?? null,
                Description: art.Description ?? null,
                MimeType: ver?.MimeType ?? null,
            });
        }

        return { Sources: sources, EnvironmentID: firstEnvironmentId };
    }

    private async runDirectSynthesisLlm(
        systemPrompt: string,
        userPrompt: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<string> {
        try {
            const aiEngine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
            await aiEngine.Config(false, user, provider);
            const activeModels = (aiEngine.Models ?? []).filter(
                (m) => m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive && m.DriverClass,
            );
            const keyReadyModels = activeModels.filter((m) => {
                try {
                    const key = GetAIAPIKey(m.DriverClass);
                    return Boolean(key && key.trim().length > 0);
                } catch {
                    return false;
                }
            });
            if (keyReadyModels.length === 0) {
                return '';
            }
            const model =
                keyReadyModels.find((m) => m.DriverClass === 'OpenAILLM') ||
                keyReadyModels.find((m) => m.DriverClass === 'AnthropicLLM') ||
                keyReadyModels.find((m) => m.DriverClass === 'GeminiLLM') ||
                keyReadyModels[0];

            const apiKey = GetAIAPIKey(model.DriverClass);
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM,
                model.DriverClass,
                apiKey,
            );
            if (!llm) {
                return '';
            }

            const chatParams = new ChatParams();
            chatParams.model = model.APIName;
            chatParams.messages = [
                { role: ChatMessageRole.system, content: systemPrompt },
                { role: ChatMessageRole.user, content: userPrompt },
            ];
            const result = await llm.ChatCompletion(chatParams);
            return result?.data?.choices?.[0]?.message?.content?.trim() ?? '';
        } catch (err) {
            LogError(
                `SynthesizeArtifactFromSourcesServerOperation.runDirectSynthesisLlm warning (falling back to deterministic synthesis): ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
            return '';
        }
    }

    private async persistSynthesizedArtifactRecord(params: {
        provider: IMetadataProvider;
        user: UserInfo;
        normalized: {
            ArtifactTypeName: string;
            Title: string;
            Description: string;
            Content: string;
        };
        collectionId: string | null;
        environmentId: string;
        sourceArtifactIds: ReadonlyArray<string>;
        agentRunId: string | null;
        agentName: string | null;
    }): Promise<{ ArtifactID: string; VersionID: string }> {
        const { provider, user, normalized } = params;
        await ArtifactMetadataEngine.Instance.Config(false, user, provider);
        const allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
        const artType = ArtifactMetadataEngine.Instance.FindArtifactType(normalized.ArtifactTypeName);
        if (!artType) {
            throw new RemoteOperationError(
                'CONFIG_ERROR',
                `Artifact type '${normalized.ArtifactTypeName}' was not found or is disabled.`,
            );
        }

        const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
        artifact.NewRecord();
        artifact.Name = normalized.Title;
        artifact.Description = normalized.Description;
        artifact.TypeID = artType.ID;
        artifact.EnvironmentID = params.environmentId;
        artifact.UserID = user.ID;

        const savedArtifact = await artifact.Save();
        if (!savedArtifact) {
            throw new RemoteOperationError(
                'SAVE_FAILED',
                artifact.LatestResult?.CompleteMessage || 'Failed to save MJ: Artifacts record.',
            );
        }

        const version = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
        version.NewRecord();
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.Name = normalized.Title;
        version.Description = normalized.Description;
        version.UserID = user.ID;
        version.ContentMode = 'Text';
        version.Content = normalized.Content;
        version.ContentHash = createHash('sha256').update(normalized.Content, 'utf8').digest('hex');
        version.ContentSizeBytes = Buffer.byteLength(normalized.Content, 'utf8');
        version.Comments = params.agentName
            ? `Synthesized by ${params.agentName} from ${params.sourceArtifactIds.length} artifact(s)`
            : `AI synthesized from ${params.sourceArtifactIds.length} artifact(s)`;

        const provenanceJson = JSON.stringify({
            synthesizedFromArtifactIds: params.sourceArtifactIds,
            agentRunId: params.agentRunId,
            agentName: params.agentName,
        });
        const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
            provenanceJson,
            normalized.Content,
            artType.DriverClass ?? null,
            normalized.Title,
            {
                ArtifactType: artType,
                AllArtifactTypes: allTypes,
            },
        );
        if (enrichedConfig) {
            version.Configuration = enrichedConfig;
        }

        const savedVersion = await version.Save();
        if (!savedVersion) {
            await artifact.Delete();
            throw new RemoteOperationError(
                'SAVE_FAILED',
                version.LatestResult?.CompleteMessage || 'Failed to save MJ: Artifact Versions record.',
            );
        }

        if (params.collectionId) {
            const link = await provider.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', user);
            link.NewRecord();
            link.CollectionID = params.collectionId;
            link.ArtifactVersionID = version.ID;
            const savedLink = await link.Save();
            if (!savedLink) {
                await version.Delete();
                await artifact.Delete();
                throw new RemoteOperationError(
                    'SAVE_FAILED',
                    link.LatestResult?.CompleteMessage || 'Failed to link synthesized artifact into collection.',
                );
            }
        }

        return {
            ArtifactID: artifact.ID,
            VersionID: version.ID,
        };
    }
}

/** Ensures the server operation class is retained by tree-shakers and registered in ClassFactory. */
export function LoadSynthesizeArtifactFromSourcesOperation(): void {
    void SynthesizeArtifactFromSourcesServerOperation;
}
