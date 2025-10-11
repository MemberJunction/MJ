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
    SkipAPIAgentNote,
    SkipAPIAgentNoteType,
    SkipAPIArtifact
} from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { UserInfo, LogStatus, LogError, Metadata, RunView } from '@memberjunction/core';
import { sendPostRequest } from '../util.js';
import { configInfo, baseUrl, publicUrl, graphqlPort, graphqlRootPath, apiKey as callbackAPIKey } from '../config.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { CopyScalarsAndArrays } from '@memberjunction/global';
import mssql from 'mssql';
import { registerAccessToken, GetDataAccessToken } from '../resolvers/GetDataResolver.js';
import { ConversationArtifactEntity, ConversationArtifactVersionEntity, ArtifactTypeEntity } from '@memberjunction/core-entities';

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

        // Construct the full Skip API request
        const request: SkipAPIRequest = {
            messages,
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
     * This can be extracted from AskSkipResolver.BuildSkipEntities if needed
     */
    private async buildEntities(dataSource: mssql.ConnectionPool, forceRefresh: boolean): Promise<SkipEntityInfo[]> {
        // TODO: Implement entity metadata building
        // This would typically query the metadata and convert to SkipEntityInfo format
        // For now, returning empty array - can be populated later
        return [];
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
     */
    private async buildArtifacts(contextUser: UserInfo, dataSource: mssql.ConnectionPool, conversationId: string): Promise<SkipAPIArtifact[]> {
        const md = new Metadata();
        const ei = md.EntityByName('MJ: Conversation Artifacts');
        const rv = new RunView();

        const results = await rv.RunViews([
            {
                EntityName: "MJ: Conversation Artifacts",
                ExtraFilter: `ConversationID='${conversationId}'`,
                OrderBy: "__mj_CreatedAt"
            },
            {
                EntityName: "MJ: Artifact Types",
                OrderBy: "Name"
            },
            {
                EntityName: "MJ: Conversation Artifact Versions",
                ExtraFilter: `ConversationArtifactID IN (SELECT ID FROM [${ei.SchemaName}].[${ei.BaseView}] WHERE ConversationID='${conversationId}')`,
                OrderBy: 'ConversationArtifactID, __mj_CreatedAt'
            }
        ], contextUser);

        if (!results || results.length === 0 || !results.every(r => r.Success)) {
            return [];
        }

        const types = results[1].Results.map((a: ArtifactTypeEntity) => ({
            id: a.ID,
            name: a.Name,
            description: a.Description,
            contentType: a.ContentType,
            enabled: a.IsEnabled,
            createdAt: a.__mj_CreatedAt,
            updatedAt: a.__mj_UpdatedAt
        }));

        const artifacts = results[0].Results.map((a: ConversationArtifactEntity) => {
            const rawVersions: ConversationArtifactVersionEntity[] = results[2].Results as ConversationArtifactVersionEntity[];
            const thisArtifactsVersions = rawVersions.filter(rv => rv.ConversationArtifactID === a.ID);

            const versions = thisArtifactsVersions.map((v: ConversationArtifactVersionEntity) => ({
                id: v.ID,
                artifactId: v.ConversationArtifactID,
                version: v.Version,
                configuration: v.Configuration,
                content: v.Content,
                comments: v.Comments,
                createdAt: v.__mj_CreatedAt,
                updatedAt: v.__mj_UpdatedAt
            }));

            return {
                id: a.ID,
                conversationId: a.ConversationID,
                name: a.Name,
                description: a.Description,
                artifactType: types.find(t => t.id === a.ArtifactTypeID),
                sharingScope: a.SharingScope,
                currentVersion: versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 1,
                versions,
                comments: '', // Default empty comments since it's required
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
}
