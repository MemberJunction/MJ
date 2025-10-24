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
    SkipAPIRequestAPIKey,
    SkipQueryInfo,
    SkipEntityInfo,
    SkipEntityFieldInfo,
    SkipEntityFieldValueInfo,
    SkipEntityRelationshipInfo,
    SkipAPIAgentNote,
    SkipAPIAgentNoteType,
    SkipAPIArtifact
} from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { UserInfo, LogStatus, LogError, Metadata, RunView, EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '@memberjunction/core';
import { sendPostRequest } from '../util.js';
import { configInfo, baseUrl, publicUrl, graphqlPort, graphqlRootPath, apiKey as callbackAPIKey } from '../config.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { CopyScalarsAndArrays } from '@memberjunction/global';
import mssql from 'mssql';
import { registerAccessToken, GetDataAccessToken } from '../resolvers/GetDataResolver.js';
import { ArtifactTypeEntity } from '@memberjunction/core-entities';
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
 * Skip TypeScript SDK
 * Provides a clean interface for calling the Skip SaaS API
 */
export class SkipSDK {
    private config: SkipSDKConfig;

    // Static cache for Skip entities (shared across all instances)
    private static __skipEntitiesCache$: BehaviorSubject<Promise<SkipEntityInfo[]> | null> = new BehaviorSubject<Promise<SkipEntityInfo[]> | null>(null);
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

            // Call Skip API with streaming support
            const responses = await sendPostRequest(
                this.config.apiUrl,
                skipRequest,
                true, // useCompression
                this.buildHeaders(),
                (streamMessage: any) => {
                    // Handle streaming status updates
                    if (streamMessage.type === 'status_update' && options.onStatusUpdate) {
                        const statusContent = streamMessage.value?.messages?.[0]?.content;
                        const responsePhase = streamMessage.value?.responsePhase;
                        if (statusContent) {
                            options.onStatusUpdate(statusContent, responsePhase);
                        }
                    }
                }
            );

            // The last response is the final one
            if (responses && responses.length > 0) {
                const finalResponse = responses[responses.length - 1].value as SkipAPIResponse;

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
            return {
                success: false,
                error: String(error)
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
            includeCallbackAuth = true
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
            entities: baseRequest.entities || [],
            queries: baseRequest.queries || [],
            notes: baseRequest.notes,
            noteTypes: baseRequest.noteTypes,
            userEmail: baseRequest.userEmail,
            organizationID: baseRequest.organizationID,
            organizationInfo: baseRequest.organizationInfo,
            apiKeys: baseRequest.apiKeys,
            callingServerURL: baseRequest.callingServerURL,
            callingServerAPIKey: baseRequest.callingServerAPIKey,
            callingServerAccessToken: baseRequest.callingServerAccessToken
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
        const entities = includeEntities ? await this.buildEntities(dataSource, forceEntityRefresh) : [];
        const queries = includeQueries ? this.buildQueries() : [];
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
    private async buildEntities(dataSource: mssql.ConnectionPool, forceRefresh: boolean, refreshIntervalMinutes: number = 15): Promise<SkipEntityInfo[]> {
        try {
            const now = Date.now();
            const cacheExpired = (now - SkipSDK.__lastRefreshTime) > (refreshIntervalMinutes * 60 * 1000);

            // If force refresh is requested OR cache expired OR cache is empty, refresh
            if (forceRefresh || cacheExpired || SkipSDK.__skipEntitiesCache$.value === null) {
                LogStatus(`[SkipSDK] Refreshing Skip entities cache (force: ${forceRefresh}, expired: ${cacheExpired})`);
                const newData = this.refreshSkipEntities(dataSource);
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
        const md = new Metadata();
        const approvedQueries = md.Queries.filter((q) => q.Status === status);

        return approvedQueries.map((q) => ({
            id: q.ID,
            name: q.Name,
            description: q.Description,
            category: q.Category,
            categoryPath: this.buildQueryCategoryPath(md, q.CategoryID),
            sql: q.SQL,
            originalSQL: q.OriginalSQL,
            feedback: q.Feedback,
            status: q.Status,
            qualityRank: q.QualityRank,
            createdAt: q.__mj_CreatedAt,
            updatedAt: q.__mj_UpdatedAt,
            categoryID: q.CategoryID,
            embeddingVector: q.EmbeddingVector,
            embeddingModelID: q.EmbeddingModelID,
            embeddingModelName: q.EmbeddingModel,
            fields: q.Fields.map((f) => ({
                id: f.ID,
                queryID: f.QueryID,
                sequence: f.Sequence,
                name: f.Name,
                description: f.Description,
                sqlBaseType: f.SQLBaseType,
                sqlFullType: f.SQLFullType,
                sourceEntityID: f.SourceEntityID,
                sourceEntity: f.SourceEntity,
                sourceFieldName: f.SourceFieldName,
                isComputed: f.IsComputed,
                computationDescription: f.ComputationDescription,
                isSummary: f.IsSummary,
                summaryDescription: f.SummaryDescription,
                createdAt: f.__mj_CreatedAt,
                updatedAt: f.__mj_UpdatedAt
            })),
            params: q.Parameters.map((p) => ({
                id: p.ID,
                queryID: p.QueryID,
                name: p.Name,
                description: p.Description,
                type: p.Type,
                isRequired: p.IsRequired,
                // LinkedParameterName and LinkedParameterType may not exist on QueryParameterInfo
                defaultValue: p.DefaultValue,
                createdAt: p.__mj_CreatedAt,
                updatedAt: p.__mj_UpdatedAt
            }))
        }));
    }

    /**
     * Recursively build category path for a query
     */
    private buildQueryCategoryPath(md: Metadata, categoryID: string): string {
        const cat = md.QueryCategories.find((c) => c.ID === categoryID);
        if (!cat) return '';
        if (!cat.ParentID) return cat.Name;
        const parentPath = this.buildQueryCategoryPath(md, cat.ParentID);
        return parentPath ? `${parentPath}/${cat.Name}` : cat.Name;
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
     * Build artifacts for a conversation
     * Uses ConversationDetailArtifact join table to get artifacts that were outputs from previous conversation details
     * Direction = 'Output' means the artifact was generated by Skip, Direction = 'Input' means it was passed in
     * Note: ConversationArtifact entity is deprecated - we now use the core Artifact entity
     */
    private async buildArtifacts(contextUser: UserInfo, dataSource: mssql.ConnectionPool, conversationId: string): Promise<SkipAPIArtifact[]> {
        const rv = new RunView();

        // Query ConversationDetailArtifact to find artifacts that were outputs (generated by Skip)
        // These are the artifacts we want to pass back as context for future requests
        const results = await rv.RunViews([
            {
                EntityName: "MJ: Conversation Detail Artifacts",
                ExtraFilter: `Direction='Output' AND ConversationDetailID IN (SELECT ID FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversationDetails] WHERE ConversationID='${conversationId}')`,
                OrderBy: "__mj_CreatedAt"
            },
            {
                EntityName: "MJ: Artifacts",
                OrderBy: "__mj_CreatedAt"
            },
            {
                EntityName: "MJ: Artifact Types",
                OrderBy: "Name"
            },
            {
                EntityName: "MJ: Artifact Versions",
                OrderBy: 'ArtifactID, __mj_CreatedAt'
            }
        ], contextUser);

        if (!results || results.length === 0 || !results.every(r => r.Success)) {
            return [];
        }

        // Get the artifact VERSION IDs from ConversationDetailArtifact where Direction='Output'
        // ConversationDetailArtifact links to ArtifactVersionID, not ArtifactID directly
        const outputVersionIds = new Set(
            results[0].Results
                .map((cda: any) => cda.ArtifactVersionID)
                .filter(id => id) // Filter out null/undefined
        );

        const types = results[2].Results.map((a: ArtifactTypeEntity) => ({
            id: a.ID,
            name: a.Name,
            description: a.Description,
            contentType: a.ContentType,
            enabled: a.IsEnabled,
            createdAt: a.__mj_CreatedAt,
            updatedAt: a.__mj_UpdatedAt
        }));

        // Get the versions that were outputs
        const allVersions: any[] = results[3].Results as any[];
        const outputVersions = allVersions.filter(v => outputVersionIds.has(v.ID));

        // Group versions by their parent ArtifactID to build SkipAPIArtifact objects
        const versionsByArtifactId = new Map<string, any[]>();
        outputVersions.forEach(v => {
            if (!versionsByArtifactId.has(v.ArtifactID)) {
                versionsByArtifactId.set(v.ArtifactID, []);
            }
            versionsByArtifactId.get(v.ArtifactID)!.push(v);
        });

        const allArtifacts = results[1].Results as any[];
        const artifacts = allArtifacts
            .filter(a => versionsByArtifactId.has(a.ID)) // Only include artifacts that have output versions
            .map((a: any) => {
            const thisArtifactsVersions = versionsByArtifactId.get(a.ID) || [];

            const versions = thisArtifactsVersions.map((v: any) => ({
                id: v.ID,
                artifactId: v.ArtifactID,
                version: v.Version,
                configuration: v.Configuration,
                content: v.Content,
                comments: v.Comments,
                createdAt: v.__mj_CreatedAt,
                updatedAt: v.__mj_UpdatedAt
            }));

            return {
                id: a.ID,
                conversationId: conversationId, // Set from parameter since Artifact doesn't have ConversationID
                name: a.Name,
                description: a.Description,
                artifactType: types.find(t => t.id === a.ArtifactTypeID),
                sharingScope: a.SharingScope,
                currentVersion: versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 1,
                versions,
                comments: a.Comments || '', // Use artifact comments if available
                createdAt: a.__mj_CreatedAt,
                updatedAt: a.__mj_UpdatedAt
            };
        });

        return artifacts;
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
     * Refreshes the Skip entities cache
     * Rebuilds the entity information that is provided to Skip
     * Copied from AskSkipResolver.refreshSkipEntities
     */
    private async refreshSkipEntities(dataSource: mssql.ConnectionPool): Promise<SkipEntityInfo[]> {
        try {
            const md = new Metadata();
            const skipSpecialIncludeEntities = (configInfo.askSkip?.entitiesToSend?.includeEntitiesFromExcludedSchemas ?? [])
                .map((e) => e.trim().toLowerCase());

            // Get the list of entities
            const entities = md.Entities.filter((e) => {
                if (!configInfo.askSkip.entitiesToSend.excludeSchemas.includes(e.SchemaName) ||
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

            // Now we have our list of entities, pack em up
            const result = await Promise.all(entities.map((e) => this.packSingleSkipEntityInfo(e, dataSource)));

            SkipSDK.__lastRefreshTime = Date.now(); // Update last refresh time
            return result;
        }
        catch (e) {
            LogError(`[SkipSDK] refreshSkipEntities error: ${e}`);
            return [];
        }
    }

    /**
     * Packs information about a single entity for Skip
     * Includes fields, relationships, and sample data
     * Copied from AskSkipResolver.PackSingleSkipEntityInfo
     */
    private async packSingleSkipEntityInfo(e: EntityInfo, dataSource: mssql.ConnectionPool): Promise<SkipEntityInfo> {
        try {
            const ret: SkipEntityInfo = {
                id: e.ID,
                name: e.Name,
                schemaName: e.SchemaName,
                baseView: e.BaseView,
                description: e.Description,

                fields: await Promise.all(e.Fields.filter(f => {
                    // we want to check the scopes for the field level and make sure it is either All or AI or has both
                    const scopes = f.ScopeDefault?.split(',').map((s) => s.trim().toLowerCase());
                    return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai');
                }).map(f => {
                    return this.packSingleSkipEntityField(f, dataSource);
                })),

                relatedEntities: e.RelatedEntities.map((r) => {
                    return this.packSingleSkipEntityRelationship(r);
                }),

                rowsPacked: e.RowsToPackWithSchema,
                rowsSampleMethod: e.RowsToPackSampleMethod,
                rows: await this.packEntityRows(e, dataSource)
            };
            return ret;
        }
        catch (e) {
            LogError(`[SkipSDK] packSingleSkipEntityInfo error: ${e}`);
            return null;
        }
    }

    /**
     * Packs information about a single entity relationship
     * These relationships help Skip understand the data model
     * Copied from AskSkipResolver.PackSingleSkipEntityRelationship
     */
    private packSingleSkipEntityRelationship(r: EntityRelationshipInfo): SkipEntityRelationshipInfo {
        try {
            return {
                entityID: r.EntityID,
                relatedEntityID: r.RelatedEntityID,
                type: r.Type,
                entityKeyField: r.EntityKeyField,
                relatedEntityJoinField: r.RelatedEntityJoinField,
                joinView: r.JoinView,
                joinEntityJoinField: r.JoinEntityJoinField,
                joinEntityInverseJoinField: r.JoinEntityInverseJoinField,
                entity: r.Entity,
                entityBaseView: r.EntityBaseView,
                relatedEntity: r.RelatedEntity,
                relatedEntityBaseView: r.RelatedEntityBaseView,
            };
        }
        catch (e) {
            LogError(`[SkipSDK] packSingleSkipEntityRelationship error: ${e}`);
            return null;
        }
    }

    /**
     * Packs information about a single entity field
     * Includes metadata and possible values
     * Copied from AskSkipResolver.PackSingleSkipEntityField
     */
    private async packSingleSkipEntityField(f: EntityFieldInfo, dataSource: mssql.ConnectionPool): Promise<SkipEntityFieldInfo> {
        try {
            return {
                entityID: f.EntityID,
                sequence: f.Sequence,
                name: f.Name,
                displayName: f.DisplayName,
                category: f.Category,
                type: f.Type,
                description: f.Description,
                isPrimaryKey: f.IsPrimaryKey,
                allowsNull: f.AllowsNull,
                isUnique: f.IsUnique,
                length: f.Length,
                precision: f.Precision,
                scale: f.Scale,
                sqlFullType: f.SQLFullType,
                defaultValue: f.DefaultValue,
                autoIncrement: f.AutoIncrement,
                valueListType: f.ValueListType,
                extendedType: f.ExtendedType,
                defaultInView: f.DefaultInView,
                defaultColumnWidth: f.DefaultColumnWidth,
                isVirtual: f.IsVirtual,
                isNameField: f.IsNameField,
                relatedEntityID: f.RelatedEntityID,
                relatedEntityFieldName: f.RelatedEntityFieldName,
                relatedEntity: f.RelatedEntity,
                relatedEntitySchemaName: f.RelatedEntitySchemaName,
                relatedEntityBaseView: f.RelatedEntityBaseView,
                possibleValues: await this.packFieldPossibleValues(f, dataSource),
            };
        }
        catch (e) {
            LogError(`[SkipSDK] packSingleSkipEntityField error: ${e}`);
            return null;
        }
    }

    /**
     * Packs entity rows (sample data)
     * Copied from AskSkipResolver.PackEntityRows
     */
    private async packEntityRows(e: EntityInfo, dataSource: mssql.ConnectionPool): Promise<any[]> {
        try {
            if (e.RowsToPackWithSchema === 'None')
                return [];

            // only include columns that have a scopes including either All and/or AI or have Null for ScopeDefault
            const fields = e.Fields.filter((f) => {
                const scopes = f.ScopeDefault?.split(',').map((s) => s.trim().toLowerCase());
                return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai');
            }).map(f => `[${f.Name}]`).join(',');

            // now run the query based on the row packing method
            let sql: string = '';
            switch (e.RowsToPackWithSchema) {
                case 'All':
                    sql = `SELECT ${fields} FROM ${e.SchemaName}.${e.BaseView}`;
                    break;
                case 'Sample':
                    switch (e.RowsToPackSampleMethod) {
                        case 'random':
                            sql = `SELECT TOP ${e.RowsToPackSampleCount} ${fields} FROM [${e.SchemaName}].[${e.BaseView}] ORDER BY newid()`;
                            break;
                        case 'top n':
                            const orderBy = e.RowsToPackSampleOrder ? ` ORDER BY [${e.RowsToPackSampleOrder}]` : '';
                            sql = `SELECT TOP ${e.RowsToPackSampleCount} ${fields} FROM [${e.SchemaName}].[${e.BaseView}]${orderBy}`;
                            break;
                        case 'bottom n':
                            const firstPrimaryKey = e.FirstPrimaryKey.Name;
                            const innerOrderBy = e.RowsToPackSampleOrder ? `[${e.RowsToPackSampleOrder}]` : `[${firstPrimaryKey}] DESC`;
                            sql = `SELECT * FROM (
                                        SELECT TOP ${e.RowsToPackSampleCount} ${fields}
                                        FROM [${e.SchemaName}].[${e.BaseView}]
                                        ORDER BY ${innerOrderBy}
                                    ) sub
                                    ORDER BY [${firstPrimaryKey}] ASC;`;
                            break;
                    }
            }
            const request = new mssql.Request(dataSource);
            const result = await request.query(sql);
            if (!result || !result.recordset) {
                return [];
            }
            else {
                return result.recordset;
            }
        }
        catch (e) {
            LogError(`[SkipSDK] packEntityRows error: ${e}`);
            return [];
        }
    }

    /**
     * Packs possible values for an entity field
     * These values help Skip understand the domain and valid values for fields
     * Copied from AskSkipResolver.PackFieldPossibleValues
     */
    private async packFieldPossibleValues(f: EntityFieldInfo, dataSource: mssql.ConnectionPool): Promise<SkipEntityFieldValueInfo[]> {
        try {
            if (f.ValuesToPackWithSchema === 'None') {
                return []; // don't pack anything
            }
            else if (f.ValuesToPackWithSchema === 'All') {
                // wants ALL of the distinct values
                return await this.getFieldDistinctValues(f, dataSource);
            }
            else if (f.ValuesToPackWithSchema === 'Auto') {
                // default setting - pack based on the ValueListType
                if (f.ValueListTypeEnum === 'List') {
                    // simple list of values in the Entity Field Values table
                    return f.EntityFieldValues.map((v) => {
                        return { value: v.Value, displayValue: v.Value };
                    });
                }
                else if (f.ValueListTypeEnum === 'ListOrUserEntry') {
                    // could be a user provided value, OR the values in the list of possible values.
                    // get the distinct list of values from the DB and concat that with the f.EntityFieldValues array - deduped and return
                    const values = await this.getFieldDistinctValues(f, dataSource);
                    if (!values || values.length === 0) {
                        // no result, just return the EntityFieldValues
                        return f.EntityFieldValues.map((v) => {
                            return { value: v.Value, displayValue: v.Value };
                        });
                    }
                    else {
                        return [...new Set([...f.EntityFieldValues.map((v) => {
                            return { value: v.Value, displayValue: v.Value };
                        }), ...values])];
                    }
                }
            }
            return []; // if we get here, nothing to pack
        }
        catch (e) {
            LogError(`[SkipSDK] packFieldPossibleValues error: ${e}`);
            return [];
        }
    }

    /**
     * Gets distinct values for a field from the database
     * Used to provide Skip with information about the possible values
     * Copied from AskSkipResolver.GetFieldDistinctValues
     */
    private async getFieldDistinctValues(f: EntityFieldInfo, dataSource: mssql.ConnectionPool): Promise<SkipEntityFieldValueInfo[]> {
        try {
            const sql = `SELECT DISTINCT ${f.Name} FROM ${f.SchemaName}.${f.BaseView}`;
            const request = new mssql.Request(dataSource);
            const result = await request.query(sql);
            if (!result || !result.recordset) {
                return [];
            }
            else {
                return result.recordset.map((r) => {
                    return {
                        value: r[f.Name],
                        displayValue: r[f.Name]
                    };
                });
            }
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
