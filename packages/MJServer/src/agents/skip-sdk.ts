/**
 * Skip TypeScript SDK
 *
 * A general-purpose SDK for calling the Skip SaaS API.
 * This module provides a clean, reusable interface for integrating with Skip
 * that can eventually be extracted into a standalone npm package.
 */

import {
    SkipAPIRequest,
    SkipAPIResponse,
    SkipMessage,
    SkipAPIAnalysisCompleteResponse,
    SkipAPIClarifyingQuestionResponse,
    SkipRequestPhase,
    SkipResponsePhase,
    SkipAPIRequestAPIKey,
    SkipQueryInfo,
    SkipQueryCatalogEntry,
    SkipAPIAgentNote,
    SkipAPIAgentNoteType,
    SkipAPIArtifact,
    SkipAPIArtifactVersion,
    SkipAPIArtifactType
} from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { IMetadataProvider, UserInfo, LogStatus, LogError, Metadata, RunQuery, RunView, EntityInfo, EntityFieldInfo, EntityFieldValueInfo, DatabaseProviderBase } from '@memberjunction/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { gzip as gzipCompress, createGunzip } from 'zlib';
import { configInfo, baseUrl, publicUrl, graphqlPort, graphqlRootPath, apiKey as callbackAPIKey } from '../config.js';
import { getDbType } from '../index.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { CopyScalarsAndArrays, UUIDsEqual } from '@memberjunction/global';
import mssql from 'mssql';
import { registerAccessToken, GetDataAccessToken } from '../resolvers/GetDataResolver.js';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

/**
 * Configuration options for Skip SDK
 */
export interface SkipSDKConfig {
    /**
     * Skip API base URL (e.g., 'https://skip.memberjunction.com')
     */
    apiUrl?: string;

    /**
     * Skip API key for authentication
     */
    apiKey?: string;

    /**
     * Organization ID
     */
    organizationId?: string;

    /**
     * Optional organization context information
     */
    organizationInfo?: string;

    /**
     * Optional metadata provider this SDK instance binds to. When set, every metadata
     * lookup (entities, queries, schema) and direct SQL call is routed through this
     * provider — multi-tenant servers should pass the per-request provider here.
     * When omitted, the SDK falls back to the global `Metadata.Provider` (single-server
     * mode, legacy callers).
     */
    provider?: IMetadataProvider;
}

/**
 * Options for making a Skip API call
 */
export interface SkipCallOptions {
    /**
     * Conversation messages (user/assistant)
     */
    messages: SkipMessage[];

    /**
     * Conversation ID for tracking
     */
    conversationId: string;

    /**
     * Data context to provide to Skip
     */
    dataContext?: DataContext;

    /**
     * Request phase (initial_request, clarify_question_response, etc.)
     */
    requestPhase?: SkipRequestPhase;

    /**
     * Context user for permissions and metadata
     */
    contextUser: UserInfo;

    /**
     * Database connection for metadata queries
     */
    dataSource: mssql.ConnectionPool;

    /**
     * Include entity metadata in request
     */
    includeEntities?: boolean;

    /**
     * Include saved queries in request
     */
    includeQueries?: boolean;

    /**
     * Include agent notes in request
     */
    includeNotes?: boolean;

    /**
     * Include agent requests in request
     */
    includeRequests?: boolean;

    /**
     * Force refresh of entity metadata cache
     */
    forceEntityRefresh?: boolean;

    /**
     * Include callback API key and access token for Skip to call back to MJ
     */
    includeCallbackAuth?: boolean;

    /**
     * Callback for streaming status updates during execution
     */
    onStatusUpdate?: (message: string, responsePhase?: string) => void;

    /**
     * Optional payload data from a previous response (e.g., PRD in progress).
     * This enables incremental artifact building where structured data accumulates
     * throughout the conversation. When Skip returns a response with a payload,
     * the client should pass that payload back in the next request.
     */
    payload?: Record<string, any>;

    /**
     * Optional reference ID from the calling system. When the MJ API proxies a request
     * to Skip via SkipProxyAgent, this contains the MJ-side Agent Run ID for cross-system
     * correlation and debugging.
     */
    externalReferenceID?: string;
}

/**
 * Result from a Skip API call
 */
export interface SkipCallResult {
    /**
     * Whether the call was successful
     */
    success: boolean;

    /**
     * The final Skip API response
     */
    response?: SkipAPIResponse;

    /**
     * Response phase (analysis_complete, clarifying_question, status_update)
     */
    responsePhase?: string;

    /**
     * Error message if failed
     */
    error?: string;

    /**
     * All streaming responses received (including intermediate status updates)
     */
    allResponses?: any[];
}

/**
 * Shape of a single SSE event received from the Skip API stream.
 * Skip sends two formats:
 * - Wrapped: `{type: 'status_update'|'streaming'|'complete', value: SkipAPIResponse}`
 * - Flat (queue): `{responsePhase: 'queued'|'error', message: '...', error: '...'}`
 */
interface SkipStreamMessage {
    type?: string;
    value?: SkipAPIResponse;
    responsePhase?: string;
    message?: string;
    error?: string;
}

/**
 * Skip TypeScript SDK
 * Provides a clean interface for calling the Skip SaaS API
 */
export class SkipSDK {
    private config: SkipSDKConfig;

    /**
     * The metadata provider this SDK instance is bound to. Set via the constructor
     * config or the `Provider` setter. Falls back to the global `Metadata.Provider`
     * when not set — multi-tenant servers should always supply an explicit provider
     * so each request reaches its own database connection.
     */
    public get Provider(): IMetadataProvider {
        return this.config.provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this.config.provider = value ?? undefined;
    }

    // Static cache for Skip entities (shared across all instances)
    private static __skipEntitiesCache$: BehaviorSubject<Promise<EntityInfo[]> | null> = new BehaviorSubject<Promise<EntityInfo[]> | null>(null);
    private static __lastRefreshTime: number = 0;

    constructor(config?: SkipSDKConfig) {
        // Use provided config or fall back to MJ server config
        this.config = {
            apiUrl: config?.apiUrl || configInfo.askSkip?.chatURL,
            apiKey: config?.apiKey || configInfo.askSkip?.apiKey,
            organizationId: config?.organizationId || configInfo.askSkip?.orgID,
            organizationInfo: config?.organizationInfo || configInfo.askSkip?.organizationInfo
        };
    }

    /**
     * Call the Skip chat API
     */
    async chat(options: SkipCallOptions): Promise<SkipCallResult> {
        LogStatus(`[SkipSDK] Sending request to Skip API: ${this.config.apiUrl}`);

        try {
            // Build the Skip API request
            const skipRequest = await this.buildSkipRequest(options);

            // Call Skip API with SSE streaming support
            const responses = await this.sendSSERequest(
                this.config.apiUrl,
                skipRequest,
                this.buildHeaders(),
                (streamMessage: SkipStreamMessage) => {
                    // Handle streaming status updates
                    // Queue messages come as flat objects: {responsePhase: 'queued'|'error', message: '...', error: '...'}
                    // Skip API messages come wrapped: {type: 'status_update', value: {responsePhase: '...', messages: [...]}}
                    if (streamMessage.type === 'status_update' && options.onStatusUpdate) {
                        const statusContent = streamMessage.value?.messages?.[0]?.content;
                        const responsePhase = streamMessage.value?.responsePhase;
                        if (statusContent) {
                            options.onStatusUpdate(statusContent, responsePhase);
                        }
                    } else if (streamMessage.responsePhase === SkipResponsePhase.queued && options.onStatusUpdate) {
                        // Handle queue progress messages
                        const statusContent = streamMessage.message;
                        const responsePhase = streamMessage.responsePhase;
                        if (statusContent) {
                            options.onStatusUpdate(statusContent, responsePhase);
                        }
                    } else if (streamMessage.responsePhase === 'error') {
                        // Queue error messages - log but don't throw (final response will handle error)
                        // Note: 'error' is not in SkipResponsePhase enum - it's a queue-specific error state
                        LogError(`[SkipSDK] Queue error: ${streamMessage.error || 'Unknown error'}`);
                        if (options.onStatusUpdate) {
                            options.onStatusUpdate(`Error: ${streamMessage.error || 'Request failed'}`, 'error');
                        }
                    }
                }
            );

            // The last response is the final one
            if (responses && responses.length > 0) {
                const finalResponse = responses[responses.length - 1].value as SkipAPIResponse;

                // Check if Skip itself reported an error (success: false in the response body)
                if (finalResponse.success === false) {
                    const skipError = finalResponse.error || 'Skip API returned an error response';
                    LogError(`[SkipSDK] Skip API error: ${skipError}`);
                    return {
                        success: false,
                        response: finalResponse,
                        responsePhase: finalResponse.responsePhase,
                        error: skipError,
                        allResponses: responses
                    };
                }

                return {
                    success: true,
                    response: finalResponse,
                    responsePhase: finalResponse.responsePhase,
                    allResponses: responses
                };
            } else {
                return {
                    success: false,
                    error: 'No response received from Skip API'
                };
            }

        } catch (error) {
            LogError(`[SkipSDK] Error calling Skip API: ${error}`);

            // Provide user-friendly error messages for common failures
            const rawError = error instanceof Error ? error.message : String(error);
            let userFriendlyError = rawError;
            const errorStr = rawError.toLowerCase();

            if (errorStr.includes('stream error') || errorStr.includes('aborted') || errorStr.includes('econnreset')) {
                userFriendlyError = 'The Skip analysis service became unavailable during processing. Please try again.';
            } else if (errorStr.includes('econnrefused') || errorStr.includes('enotfound')) {
                userFriendlyError = 'Unable to connect to the Skip analysis service. The service may be temporarily unavailable.';
            } else if (errorStr.includes('timeout')) {
                userFriendlyError = 'The Skip analysis service took too long to respond. Please try again.';
            }

            return {
                success: false,
                error: userFriendlyError
            };
        }
    }

    /**
     * Build the Skip API request object
     */
    private async buildSkipRequest(options: SkipCallOptions): Promise<SkipAPIRequest> {
        const {
            messages,
            conversationId,
            dataContext,
            requestPhase = 'initial_request',
            contextUser,
            dataSource,
            includeEntities = true,
            includeQueries = true,
            includeNotes = true,
            includeRequests = false,
            forceEntityRefresh = false,
            includeCallbackAuth = true,
            payload,
            externalReferenceID
        } = options;

        // Build base request with metadata
        const baseRequest = await this.buildBaseRequest(
            contextUser,
            dataSource,
            includeEntities,
            includeQueries,
            includeNotes,
            includeRequests,
            forceEntityRefresh,
            includeCallbackAuth,
            { conversationId, requestPhase }
        );

        // Build artifacts for this conversation
        const artifacts = await this.buildArtifacts(contextUser, dataSource, conversationId);

        // Process messages: filter delegation messages and enrich with metadata
        const processedMessages = this.processMessages(messages);

        // Construct the full Skip API request
        const request: SkipAPIRequest = {
            messages: processedMessages,
            conversationID: conversationId,
            dataContext: dataContext ? CopyScalarsAndArrays(dataContext) as DataContext : undefined,
            requestPhase,
            artifacts,
            payload, // Pass through payload for incremental artifact building (e.g., PRD in progress)
            entities: baseRequest.entities || [],
            queries: baseRequest.queries || [],
            queryCatalog: baseRequest.queryCatalog,
            notes: baseRequest.notes,
            noteTypes: baseRequest.noteTypes,
            userEmail: baseRequest.userEmail,
            organizationID: baseRequest.organizationID,
            organizationInfo: baseRequest.organizationInfo,
            apiKeys: baseRequest.apiKeys,
            callingServerURL: baseRequest.callingServerURL,
            callingServerAPIKey: baseRequest.callingServerAPIKey,
            callingServerAccessToken: baseRequest.callingServerAccessToken,
            externalReferenceID,
            databasePlatform: getDbType()
        };

        return request;
    }

    /**
     * Build base request with metadata, API keys, and callback auth
     */
    private async buildBaseRequest(
        contextUser: UserInfo,
        dataSource: mssql.ConnectionPool,
        includeEntities: boolean,
        includeQueries: boolean,
        includeNotes: boolean,
        includeRequests: boolean,
        forceEntityRefresh: boolean,
        includeCallbackAuth: boolean,
        additionalTokenInfo: any = {}
    ): Promise<Partial<SkipAPIRequest>> {
        const entities = includeEntities ? await this.buildEntities(forceEntityRefresh) : [];
        const queries = includeQueries ? this.buildQueries() : [];
        // Always build the lightweight query catalog for collision detection,
        // regardless of whether full queries are included
        const queryCatalog = this.buildQueryCatalog();
        const { notes, noteTypes } = includeNotes ? await this.buildAgentNotes(contextUser) : { notes: [], noteTypes: [] };
        // Note: requests would be built here if includeRequests is true

        // Setup access token for Skip callbacks if needed
        let accessToken: GetDataAccessToken | undefined;
        if (includeCallbackAuth) {
            const tokenInfo = {
                type: 'skip_api_request',
                userEmail: contextUser.Email,
                userName: contextUser.Name,
                userID: contextUser.ID,
                ...additionalTokenInfo
            };

            accessToken = registerAccessToken(
                undefined,
                1000 * 60 * 10, // 10 minutes
                tokenInfo
            );
        }

        return {
            entities,
            queries,
            queryCatalog,
            notes,
            noteTypes,
            userEmail: contextUser.Email,
            organizationID: this.config.organizationId,
            organizationInfo: this.config.organizationInfo,
            apiKeys: this.buildAPIKeys(),
            callingServerURL: accessToken ? (publicUrl || `${baseUrl}:${graphqlPort}${graphqlRootPath}`) : undefined,
            callingServerAPIKey: accessToken ? callbackAPIKey : undefined,
            callingServerAccessToken: accessToken ? accessToken.Token : undefined
        };
    }

    /**
     * Build entity metadata for Skip
     * Copied from AskSkipResolver.BuildSkipEntities - uses cached metadata with refresh logic
     */
    private async buildEntities(forceRefresh: boolean, refreshIntervalMinutes: number = 15): Promise<EntityInfo[]> {
        try {
            const now = Date.now();
            const cacheExpired = (now - SkipSDK.__lastRefreshTime) > (refreshIntervalMinutes * 60 * 1000);

            // If force refresh is requested OR cache expired OR cache is empty, refresh
            if (forceRefresh || cacheExpired || SkipSDK.__skipEntitiesCache$.value === null) {
                LogStatus(`[SkipSDK] Refreshing Skip entities cache (force: ${forceRefresh}, expired: ${cacheExpired})`);
                const newData = this.refreshSkipEntities();
                SkipSDK.__skipEntitiesCache$.next(newData);
            }

            return SkipSDK.__skipEntitiesCache$.pipe(take(1)).toPromise();
        }
        catch (e) {
            LogError(`[SkipSDK] buildEntities error: ${e}`);
            return [];
        }
    }

    /**
     * Build saved queries for Skip
     */
    private buildQueries(status: "Pending" | "In-Review" | "Approved" | "Rejected" | "Obsolete" = 'Approved'): SkipQueryInfo[] {
        const md = this.Provider;
        const approvedQueries = md.Queries.filter((q) => q.Status === status);

        return approvedQueries.map((q) => ({
            ID: q.ID,
            Name: q.Name,
            Description: q.Description,
            Category: q.Category,
            CategoryPath: this.buildQueryCategoryPath(md, q.CategoryID),
            CategoryID: q.CategoryID,
            SQL: q.SQL,
            Status: q.Status,
            QualityRank: q.QualityRank,
            Reusable: q.Reusable,
            EmbeddingVector: q.EmbeddingVector,
            EmbeddingModelID: q.EmbeddingModelID,
            EmbeddingModelName: q.EmbeddingModel,
            TechnicalDescription: q.TechnicalDescription,
            Fields: q.Fields.map((f) => ({
                ID: f.ID,
                QueryID: f.QueryID,
                Name: f.Name,
                Description: f.Description,
                Sequence: f.Sequence,
                SQLBaseType: f.SQLBaseType,
                SQLFullType: f.SQLFullType,
                SourceEntityID: f.SourceEntityID,
                SourceEntity: f.SourceEntity,
                SourceFieldName: f.SourceFieldName,
                IsComputed: f.IsComputed,
                ComputationDescription: f.ComputationDescription,
                IsSummary: f.IsSummary,
                SummaryDescription: f.SummaryDescription
            })),
            Parameters: q.Parameters.map((p) => ({
                ID: p.ID,
                QueryID: p.QueryID,
                Name: p.Name,
                Description: p.Description,
                Type: p.Type,
                IsRequired: p.IsRequired,
                DefaultValue: p.DefaultValue,
                SampleValue: p.SampleValue,
                ValidationFilters: p.ValidationFilters
            })),
            Entities: q.Entities.map((e) => ({
                ID: e.ID,
                QueryID: e.QueryID,
                EntityID: e.EntityID,
                Entity: e.Entity
            })),
            CacheEnabled: q.CacheEnabled,
            CacheMaxSize: q.CacheMaxSize,
            CacheTTLMinutes: q.CacheTTLMinutes,
            CacheValidationSQL: q.CacheValidationSQL
        }));
    }

    /**
     * Recursively build category path for a query
     */
    private buildQueryCategoryPath(md: IMetadataProvider, categoryID: string): string {
        const cat = md.QueryCategories.find((c) => UUIDsEqual(c.ID, categoryID));
        if (!cat) return '';
        if (!cat.ParentID) return cat.Name;
        const parentPath = this.buildQueryCategoryPath(md, cat.ParentID);
        return parentPath ? `${parentPath}/${cat.Name}` : cat.Name;
    }

    /**
     * Build a lightweight catalog of ALL query names and category paths (regardless of status).
     * Always called regardless of includeQueries, so collision detection
     * has accurate data even when full query metadata is not transmitted.
     * Includes all statuses because the database enforces name+category uniqueness
     * across all queries, not just approved ones.
     */
    private buildQueryCatalog(): SkipQueryCatalogEntry[] {
        const md = this.Provider;

        return md.Queries.map((q) => ({
            Name: q.Name,
            CategoryPath: this.buildQueryCategoryPath(md, q.CategoryID)
        }));
    }

    /**
     * Build agent notes for Skip
     */
    private async buildAgentNotes(contextUser: UserInfo): Promise<{ notes: SkipAPIAgentNote[], noteTypes: SkipAPIAgentNoteType[] }> {
        // TODO: Implement agent notes building
        // This would query AIAgentNote entities and convert to SkipAPIAgentNote format
        // For now, returning empty arrays
        return { notes: [], noteTypes: [] };
    }

    /**
     * Build artifacts for a conversation using optimized query
     * Uses GetConversationArtifactsForAgent query which joins through ConversationDetailArtifact
     * to get artifacts that were outputs from Skip agent's conversation details
     */
    private async buildArtifacts(contextUser: UserInfo, dataSource: mssql.ConnectionPool, conversationId: string): Promise<SkipAPIArtifact[]> {
        try {
            const rq = new RunQuery();

            // Ensure AIEngine is configured and get Skip agent ID
            await AIEngine.Instance.Config(false, contextUser);
            const skipAgent = AIEngine.Instance.GetAgentByName('Skip');
            const skipAgentId = skipAgent?.ID;

            if (!skipAgentId) {
                LogError('[SkipSDK] Skip agent not found in AIEngine');
            }

            // Use optimized query that replaces 4 RunView calls with 1 query
            // This query includes Configuration field needed for component spec extraction
            // Filter by Skip agent ID to only get artifacts created by Skip (not delegation agents)
            const result = await rq.RunQuery({
                QueryName: 'GetConversationArtifactsForAgent',
                CategoryPath: 'MJ/Conversations',
                Parameters: {
                    ConversationID: conversationId,
                    AgentID: skipAgentId // Filter to only artifacts created by Skip agent
                }
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return [];
            }

            // Query returns flat result set: one row per artifact version
            // Group by ArtifactID to build SkipAPIArtifact objects with their versions
            const artifactMap = new Map<string, {
                artifact: any,
                artifactType: SkipAPIArtifactType,
                versions: SkipAPIArtifactVersion[]
            }>();

            // Process each row (represents one version)
            for (const row of result.Results) {
                const artifactId = row.ArtifactID;

                // Initialize artifact entry if not exists
                if (!artifactMap.has(artifactId)) {
                    // Map database sharingScope values to SkipAPIArtifact expected values
                    let sharingScope: 'None' | 'SpecificUsers' | 'Everyone' | 'Public' = 'None';
                    const dbSharingScope = (row.SharingScope || '').toLowerCase();
                    if (dbSharingScope === 'always' || dbSharingScope === 'everyone') {
                        sharingScope = 'Everyone';
                    } else if (dbSharingScope === 'public') {
                        sharingScope = 'Public';
                    } else if (dbSharingScope === 'specific users' || dbSharingScope === 'specificusers') {
                        sharingScope = 'SpecificUsers';
                    }

                    artifactMap.set(artifactId, {
                        artifact: {
                            id: artifactId,
                            conversationId: conversationId,
                            name: row.ArtifactName,
                            description: row.ArtifactDescription || '',
                            sharingScope: sharingScope,
                            comments: row.ArtifactComments || '',
                            createdAt: new Date(row.ArtifactCreatedAt),
                            updatedAt: new Date(row.ArtifactUpdatedAt)
                        },
                        artifactType: {
                            id: row.ArtifactTypeID,
                            name: row.ArtifactTypeName,
                            description: row.ArtifactTypeDescription,
                            contentType: row.ArtifactTypeContentType,
                            enabled: true,
                            createdAt: new Date(row.ArtifactTypeCreatedAt),
                            updatedAt: new Date(row.ArtifactTypeUpdatedAt)
                        },
                        versions: []
                    });
                }

                // Add this version to the artifact
                const entry = artifactMap.get(artifactId)!;
                entry.versions.push({
                    id: row.VersionID,
                    artifactId: artifactId,
                    conversationDetailID: row.ConversationDetailID, // Direct from join table!
                    version: row.Version,
                    configuration: row.Configuration || '',
                    content: row.Content || '',
                    comments: row.VersionComments || '',
                    createdAt: new Date(row.VersionCreatedAt),
                    updatedAt: new Date(row.VersionUpdatedAt)
                });
            }

            // Convert map to SkipAPIArtifact array
            const artifacts: SkipAPIArtifact[] = Array.from(artifactMap.values()).map(entry => ({
                ...entry.artifact,
                artifactType: entry.artifactType,
                versions: entry.versions
            }));

            // Also include INPUT artifacts (e.g., user-captured Data Snapshots
            // attached to messages via the Analyze button or
            // client:capture-data-snapshot actionable command). The query above
            // only returns Direction='Output' artifacts produced BY Skip — but
            // Skip also needs to see artifacts the user gave it as input.
            const inputArtifacts = await this.buildInputArtifacts(contextUser, conversationId, artifactMap);
            if (inputArtifacts.length > 0) {
                artifacts.push(...inputArtifacts);
            }

            return artifacts;
        } catch (error) {
            LogError(`Failed to build artifacts for conversation ${conversationId}: ${error}`);
            return [];
        }
    }

    /**
     * Fetch INPUT artifacts attached to user messages in this conversation
     * (Direction='Input' on ConversationDetailArtifact). Skip should see these
     * so it can use captured Data Snapshots, user-uploaded files, etc., in
     * its analysis.
     *
     * Deduplicates against `alreadyLoaded` (the Output artifacts) so the same
     * artifact ID doesn't appear twice if it was both produced and re-attached.
     */
    private async buildInputArtifacts(
        contextUser: UserInfo,
        conversationId: string,
        alreadyLoaded: Map<string, { artifact: any; artifactType: SkipAPIArtifactType; versions: SkipAPIArtifactVersion[] }>
    ): Promise<SkipAPIArtifact[]> {
        try {
            const rv = new RunView();
            // Pull conversation detail IDs in this conversation
            const detailsResult = await rv.RunView<MJConversationDetailEntity>({
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${conversationId}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            }, contextUser);
            const detailIds = detailsResult.Success && detailsResult.Results
                ? (detailsResult.Results as { ID: string }[]).map(r => r.ID)
                : [];
            if (detailIds.length === 0) return [];

            // Junction rows where Direction='Input' for those details
            const junctionResult = await rv.RunView({
                EntityName: 'MJ: Conversation Detail Artifacts',
                ExtraFilter: `ConversationDetailID IN ('${detailIds.join("','")}') AND Direction='Input'`,
                Fields: ['ArtifactVersionID', 'ConversationDetailID'],
                ResultType: 'simple',
            }, contextUser);
            const junctions = junctionResult.Success && junctionResult.Results
                ? (junctionResult.Results as { ArtifactVersionID: string; ConversationDetailID: string }[])
                : [];
            if (junctions.length === 0) return [];

            // Load each ArtifactVersion + its parent Artifact + ArtifactType
            const versionIds = [...new Set(junctions.map(j => j.ArtifactVersionID))];
            const versionsResult = await rv.RunView({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID IN ('${versionIds.join("','")}')`,
                ResultType: 'simple',
            }, contextUser);
            const versions = versionsResult.Success && versionsResult.Results
                ? (versionsResult.Results as Record<string, any>[])
                : [];
            if (versions.length === 0) return [];

            const artifactIds = [...new Set(versions.map(v => v.ArtifactID as string))];
            const artifactsResult = await rv.RunView({
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID IN ('${artifactIds.join("','")}')`,
                ResultType: 'simple',
            }, contextUser);
            const artifactRows = artifactsResult.Success && artifactsResult.Results
                ? (artifactsResult.Results as Record<string, any>[])
                : [];

            const typeIds = [...new Set(artifactRows.map(a => a.TypeID as string))];
            const typesResult = await rv.RunView({
                EntityName: 'MJ: Artifact Types',
                ExtraFilter: `ID IN ('${typeIds.join("','")}')`,
                ResultType: 'simple',
            }, contextUser);
            const typeRows = typesResult.Success && typesResult.Results
                ? (typesResult.Results as Record<string, any>[])
                : [];
            const typeMap = new Map<string, Record<string, any>>(typeRows.map(t => [t.ID as string, t]));

            // Build a junction lookup: artifactVersionId -> conversationDetailId
            const versionToDetail = new Map(junctions.map(j => [j.ArtifactVersionID, j.ConversationDetailID]));

            // Build SkipAPIArtifact entries
            const inputArtifactMap = new Map<string, { artifact: any; artifactType: SkipAPIArtifactType; versions: SkipAPIArtifactVersion[] }>();
            for (const v of versions) {
                const aRow = artifactRows.find(a => a.ID === v.ArtifactID);
                if (!aRow) continue;
                if (alreadyLoaded.has(aRow.ID as string)) continue; // dedup

                const typeRow = typeMap.get(aRow.TypeID as string);
                if (!typeRow) continue;

                let entry = inputArtifactMap.get(aRow.ID as string);
                if (!entry) {
                    entry = {
                        artifact: {
                            id: aRow.ID,
                            conversationId,
                            name: aRow.Name,
                            description: aRow.Description || '',
                            sharingScope: 'None',
                            comments: aRow.Comments || '',
                            createdAt: new Date(aRow.__mj_CreatedAt),
                            updatedAt: new Date(aRow.__mj_UpdatedAt),
                        },
                        artifactType: {
                            id: typeRow.ID,
                            name: typeRow.Name,
                            description: typeRow.Description,
                            contentType: typeRow.ContentType,
                            enabled: true,
                            createdAt: new Date(typeRow.__mj_CreatedAt),
                            updatedAt: new Date(typeRow.__mj_UpdatedAt),
                        },
                        versions: [],
                    };
                    inputArtifactMap.set(aRow.ID as string, entry);
                }
                entry.versions.push({
                    id: v.ID,
                    artifactId: v.ArtifactID,
                    conversationDetailID: versionToDetail.get(v.ID) ?? '',
                    version: v.VersionNumber,
                    configuration: v.Configuration || '',
                    content: v.Content || '',
                    comments: v.Comments || '',
                    createdAt: new Date(v.__mj_CreatedAt),
                    updatedAt: new Date(v.__mj_UpdatedAt),
                });
            }

            return Array.from(inputArtifactMap.values()).map(entry => ({
                ...entry.artifact,
                artifactType: entry.artifactType,
                versions: entry.versions,
            }));
        } catch (error) {
            LogError(`Failed to load input artifacts for conversation ${conversationId}: ${error}`);
            return [];
        }
    }

    /**
     * Build API keys for AI services
     */
    private buildAPIKeys(): SkipAPIRequestAPIKey[] {
        return [
            {
                vendorDriverName: 'OpenAILLM',
                apiKey: GetAIAPIKey('OpenAILLM')
            },
            {
                vendorDriverName: 'AnthropicLLM',
                apiKey: GetAIAPIKey('AnthropicLLM')
            },
            {
                vendorDriverName: 'GeminiLLM',
                apiKey: GetAIAPIKey('GeminiLLM')
            },
            {
                vendorDriverName: 'GroqLLM',
                apiKey: GetAIAPIKey('GroqLLM')
            },
            {
                vendorDriverName: 'MistralLLM',
                apiKey: GetAIAPIKey('MistralLLM')
            },
            {
                vendorDriverName: 'CerebrasLLM',
                apiKey: GetAIAPIKey('CerebrasLLM')
            }
        ];
    }

    /**
     * Build HTTP headers for Skip API requests
     */
    private buildHeaders(): Record<string, string> {
        return {
            'x-api-key': this.config.apiKey || '',
            'Content-Type': 'application/json'
        };
    }

    /**
     * Send an SSE-aware POST request to the Skip API.
     * Replaces sendPostRequest for SSE format: parses `data: {json}\n\n` events
     * instead of NDJSON `{json}\n` lines. This is required because Azure Container
     * Apps' Envoy proxy buffers NDJSON responses but streams SSE responses.
     */
    private async sendSSERequest(
        url: string,
        payload: SkipAPIRequest,
        headers: Record<string, string>,
        streamCallback?: (event: SkipStreamMessage) => void
    ): Promise<SkipStreamMessage[]> {
        // Gzip the request body
        const compressed = await new Promise<Buffer>((resolve, reject) => {
            gzipCompress(JSON.stringify(payload), (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        return new Promise((resolve, reject) => {
            try {
                const parsedUrl = new URL(url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                    path: parsedUrl.pathname,
                    method: 'POST' as const,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Encoding': 'gzip',
                        ...headers
                    }
                };

                const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;
                const events: SkipStreamMessage[] = [];
                let buffer = '';
                let streamEnded = false;

                const parseSSELine = (line: string): void => {
                    if (line.trim() === '') return;           // Skip empty lines (SSE event delimiters)
                    if (!line.startsWith('data: ')) return;   // Skip non-data SSE fields
                    const jsonStr = line.slice(6);
                    if (!jsonStr.trim()) return;

                    try {
                        const event = JSON.parse(jsonStr) as SkipStreamMessage;
                        events.push(event);
                        streamCallback?.(event);
                    } catch (e) {
                        LogError(`[SkipSDK] SSE parse error: ${e}`);
                    }
                };

                const handleStreamEnd = (): void => {
                    if (streamEnded) return;
                    streamEnded = true;
                    // Try to parse any remaining data in buffer
                    if (buffer.trim()) {
                        parseSSELine(buffer);
                    }
                    resolve(events);
                };

                const req = requestFn(options, (res) => {
                    // Check for non-2xx HTTP status codes before attempting SSE parsing.
                    // The Skip API returns JSON error bodies for auth/validation failures (401, 403, etc.)
                    // which won't contain SSE `data:` lines, resulting in an empty events array
                    // and the misleading "No response received from Skip API" error.
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        let errorBody = '';
                        res.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
                        res.on('end', () => {
                            let errorMessage = `Skip API returned HTTP ${res.statusCode}`;
                            try {
                                const parsed = JSON.parse(errorBody);
                                if (parsed.message) {
                                    errorMessage = parsed.message;
                                } else if (parsed.error) {
                                    errorMessage = parsed.error;
                                }
                            } catch {
                                // Non-JSON body — use raw text if available
                                if (errorBody.trim()) {
                                    errorMessage += `: ${errorBody.trim().substring(0, 200)}`;
                                }
                            }
                            LogError(`[SkipSDK] HTTP ${res.statusCode} from ${url}: ${errorMessage}`);
                            reject(new Error(errorMessage));
                        });
                        return;
                    }

                    const gunzip = createGunzip();
                    const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(gunzip) : res;

                    stream.on('data', (chunk: Buffer) => {
                        buffer += chunk.toString();
                        let boundary: number;
                        while ((boundary = buffer.indexOf('\n')) !== -1) {
                            const line = buffer.substring(0, boundary);
                            buffer = buffer.substring(boundary + 1);
                            parseSSELine(line);
                        }
                    });

                    stream.on('end', handleStreamEnd);

                    stream.on('close', () => {
                        if (!streamEnded) {
                            LogError(`[SkipSDK] SSE stream closed prematurely for ${url}`);
                            handleStreamEnd();
                        }
                    });

                    stream.on('error', (e: Error) => {
                        if (!streamEnded) {
                            LogError(`[SkipSDK] SSE stream error for ${url}: ${e.message}`);
                            reject(new Error(`SSE stream error: ${e.message}`));
                        }
                    });
                });

                req.on('error', (e: Error) => {
                    LogError(`[SkipSDK] SSE request error for ${url}: ${e.message}`);
                    reject(new Error(`HTTP request failed to ${url}: ${e.message}`));
                });

                req.write(compressed);
                req.end();
            } catch (e) {
                LogError(`[SkipSDK] sendSSERequest error: ${e}`);
                reject(e);
            }
        });
    }

    /**
     * Refreshes the Skip entities cache
     * Rebuilds the entity information that is provided to Skip
     * Refreshes the entity metadata cache. Filters entities by schema/scope config,
     * filters fields by AI scope, and enriches field values from the database.
     * Returns EntityInfo objects directly — no intermediate Skip-specific types needed.
     */
    private async refreshSkipEntities(): Promise<EntityInfo[]> {
        try {
            const md = this.Provider;

            // Diagnostic logging
            LogStatus(`[SkipSDK.refreshSkipEntities] Total entities in metadata: ${md.Entities.length}`);
            LogStatus(`[SkipSDK.refreshSkipEntities] Config excludeSchemas: ${JSON.stringify(configInfo.askSkip?.entitiesToSend?.excludeSchemas)}`);
            LogStatus(`[SkipSDK.refreshSkipEntities] Config includeEntitiesFromExcludedSchemas: ${JSON.stringify(configInfo.askSkip?.entitiesToSend?.includeEntitiesFromExcludedSchemas)}`);

            const skipSpecialIncludeEntities = (configInfo.askSkip?.entitiesToSend?.includeEntitiesFromExcludedSchemas ?? [])
                .map((e) => e.trim().toLowerCase());

            // Get the list of entities
            const entities = md.Entities.filter((e) => {
                if (!(configInfo.askSkip?.entitiesToSend?.excludeSchemas ?? []).includes(e.SchemaName) ||
                    skipSpecialIncludeEntities.includes(e.Name.trim().toLowerCase())) {
                    const sd = e.ScopeDefault?.trim();
                    if (sd && sd.length > 0) {
                        const scopes = sd.split(',').map((s) => s.trim().toLowerCase()) ?? ['all'];
                        return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai') || skipSpecialIncludeEntities.includes(e.Name.trim().toLowerCase());
                    }
                    else {
                        return true; // no scope, so include it
                    }
                }
                return false;
            });

            LogStatus(`[SkipSDK.refreshSkipEntities] Filtered entities count: ${entities.length}`);
            if (entities.length === 0) {
                LogError(`[SkipSDK.refreshSkipEntities] WARNING: No entities passed filtering! This will result in empty Skip entities list.`);
            }

            // Build enriched EntityInfo objects with filtered fields and packed values
            const result = await Promise.all(entities.map((e) => this.buildEntityForSkip(e)));

            LogStatus(`[SkipSDK.refreshSkipEntities] Successfully packed ${result.length} entities for Skip`);

            SkipSDK.__lastRefreshTime = Date.now();
            return result;
        }
        catch (e) {
            LogError(`[SkipSDK] refreshSkipEntities error: ${e}`);
            return [];
        }
    }

    /**
     * Builds an EntityInfo object for Skip, filtering fields by AI scope and
     * enriching field values from the database. Returns a new EntityInfo
     * constructed from a plain object so it serializes cleanly via toJSON().
     */
    private async buildEntityForSkip(e: EntityInfo): Promise<EntityInfo> {
        try {
            // Filter fields by scope (only include fields visible to AI)
            const filteredFields = e.Fields.filter(f => {
                const scopes = f.ScopeDefault?.split(',').map((s) => s.trim().toLowerCase());
                return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai');
            });

            // Enrich each field with packed possible values
            const enrichedFields = await Promise.all(filteredFields.map(f => this.enrichFieldValues(f)));

            // Clone the entity via toJSON, then swap in filtered+enriched fields and Skip-specific
            // Active-only organic keys. Any future EntityInfo properties flow through automatically.
            return new EntityInfo({
                ...e.toJSON(),
                Fields: enrichedFields,
                OrganicKeys: e.OrganicKeys.filter(ok => ok.Status === 'Active'),
            });
        }
        catch (err) {
            LogError(`[SkipSDK] buildEntityForSkip error: ${err}`);
            return null;
        }
    }

    /**
     * Enriches a field's EntityFieldValues with possible values from the database.
     * Returns a plain object that can be used to construct an EntityFieldInfo.
     */
    private async enrichFieldValues(f: EntityFieldInfo): Promise<Record<string, unknown>> {
        return {
            ...f.toJSON(),
            EntityFieldValues: await this.packFieldValues(f),
        };
    }

    /**
     * Packs possible values for an entity field based on the ValuesToPackWithSchema setting.
     * Returns EntityFieldValueInfo-compatible objects.
     */
    private async packFieldValues(f: EntityFieldInfo): Promise<EntityFieldValueInfo[]> {
        try {
            if (f.ValuesToPackWithSchema === 'None') {
                return [];
            }
            else if (f.ValuesToPackWithSchema === 'All') {
                return await this.getFieldDistinctValues(f);
            }
            else if (f.ValuesToPackWithSchema === 'Auto') {
                if (f.ValueListTypeEnum === 'List') {
                    return f.EntityFieldValues.map((v) => new EntityFieldValueInfo({ Value: v.Value, Code: v.Value }));
                }
                else if (f.ValueListTypeEnum === 'ListOrUserEntry') {
                    const values = await this.getFieldDistinctValues(f);
                    if (!values || values.length === 0) {
                        return f.EntityFieldValues.map((v) => new EntityFieldValueInfo({ Value: v.Value, Code: v.Value }));
                    }
                    else {
                        const fromEntityFieldValues = f.EntityFieldValues.map((v) => new EntityFieldValueInfo({ Value: v.Value, Code: v.Value }));
                        return [...new Set([...fromEntityFieldValues, ...values])];
                    }
                }
            }
            return [];
        }
        catch (e) {
            LogError(`[SkipSDK] packFieldValues error: ${e}`);
            return [];
        }
    }

    /**
     * Gets distinct values for a field from the database.
     * Returns EntityFieldValueInfo objects.
     */
    private async getFieldDistinctValues(f: EntityFieldInfo): Promise<EntityFieldValueInfo[]> {
        try {
            // Use this SDK instance's bound provider so multi-tenant servers route the SQL
            // through the right connection. ExecuteSQL works on both SQL Server and PostgreSQL.
            const provider = this.Provider as unknown as DatabaseProviderBase;
            const sql = `SELECT DISTINCT ${f.Name} FROM ${f.SchemaName}.${f.BaseView}`;
            const rows = await provider.ExecuteSQL<Record<string, unknown>>(sql);
            if (!rows || rows.length === 0) {
                return [];
            }
            return rows.map((r) => new EntityFieldValueInfo({ Value: r[f.Name] as string, Code: r[f.Name] as string }));
        }
        catch (e) {
            LogError(`[SkipSDK] getFieldDistinctValues error: ${e}`);
            return [];
        }
    }

    /**
     * Process messages: filter delegation messages and add metadata fields
     * Messages coming in should already have conversationDetailID if they exist in the database
     */
    private processMessages(messages: SkipMessage[]): SkipMessage[] {
        // Filter out delegation messages (administrative messages that shouldn't go to Skip)
        const filteredMessages = messages.filter(msg => !this.isDelegationMessage(msg.content));

        // Enrich messages with default metadata if not already present
        return filteredMessages.map(msg => ({
            ...msg,
            // Add default metadata fields if not already present
            // Messages from DB already have conversationDetailID, temp messages get temp-X
            hiddenToUser: msg.hiddenToUser ?? false,
            userRating: msg.userRating ?? null,
            userFeedback: msg.userFeedback ?? null,
            reflectionInsights: msg.reflectionInsights ?? null,
            summaryOfEarlierConveration: msg.summaryOfEarlierConveration ?? null
        }));
    }

    /**
     * Check if a message is a delegation message that should be filtered out
     * Uses flexible pattern matching to detect variations of delegation messages
     */
    private isDelegationMessage(content: string): boolean {
        if (!content) return false;

        const lowerContent = content.toLowerCase();

        // Check for both "delegating" or "delegate" AND "skip" in any order
        const hasDelegatingOrDelegate = lowerContent.includes('delegating') || lowerContent.includes('delegate');
        const hasSkip = lowerContent.includes('skip');

        return hasDelegatingOrDelegate && hasSkip;
    }
}
