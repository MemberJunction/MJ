/**
 * @fileoverview Knowledge Agent — a sub-agent for Sage that provides
 * Knowledge Hub capabilities: search, vectorization, duplicate detection,
 * and client-side navigation.
 *
 * Server tools execute on the server (search, vectorize, dedup).
 * Client tools send instructions to the Angular client (navigate, filter).
 *
 * @module @memberjunction/ai-agents
 */

import { LogStatus, LogError, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';

/**
 * Describes a tool available to the Knowledge Agent.
 */
export interface KnowledgeAgentTool {
    /** Unique tool name */
    Name: string;
    /** Human-readable description */
    Description: string;
    /** Where the tool executes */
    ExecutionSide: 'server' | 'client';
    /** JSON schema for tool parameters */
    ParameterSchema: Record<string, unknown>;
}

/**
 * Request to invoke a client-side tool from the server.
 */
export interface ClientToolRequest {
    /** Unique request ID for correlation */
    RequestID: string;
    /** The tool name to invoke */
    ToolName: string;
    /** Parameters for the tool */
    Parameters: Record<string, unknown>;
    /** Timestamp of the request */
    RequestedAt: Date;
}

/**
 * Response from a client-side tool invocation.
 */
export interface ClientToolResponse {
    /** Correlates to the original RequestID */
    RequestID: string;
    /** Whether the client tool executed successfully */
    Success: boolean;
    /** Result data from the tool */
    Data?: Record<string, unknown>;
    /** Error message if not successful */
    ErrorMessage?: string;
    /** Timestamp of the response */
    RespondedAt: Date;
}

/**
 * Knowledge Agent provides Knowledge Hub capabilities as a sub-agent.
 *
 * ## Server Tools
 * - `search_knowledge` — Execute a unified search across vector + full-text indexes
 * - `create_entity_document` — Create a new entity document template for vectorization
 * - `run_vectorization` — Trigger vectorization for an entity
 * - `run_duplicate_detection` — Run duplicate detection on an entity
 *
 * ## Client Tools (sent to browser)
 * - `navigate_to_tab` — Switch the Knowledge Hub to a specific tab
 * - `open_suggest_panel` — Open the document suggestion panel
 * - `apply_search_filter` — Apply filters to the search UI
 */
export class KnowledgeAgent {
    /** All tools this agent can invoke */
    public static readonly Tools: KnowledgeAgentTool[] = [
        // Server tools
        {
            Name: 'search_knowledge',
            Description: 'Search across all knowledge using unified vector + full-text search with RRF fusion',
            ExecutionSide: 'server',
            ParameterSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query text' },
                    maxResults: { type: 'number', description: 'Maximum results to return (default: 20)' },
                    entityNames: { type: 'array', items: { type: 'string' }, description: 'Filter to specific entity names' },
                },
                required: ['query'],
            },
        },
        {
            Name: 'create_entity_document',
            Description: 'Create a new entity document template for vectorization using AI suggestions',
            ExecutionSide: 'server',
            ParameterSchema: {
                type: 'object',
                properties: {
                    entityName: { type: 'string', description: 'The entity to create a document template for' },
                    useCase: { type: 'string', enum: ['duplicate detection', 'search', 'classification'], description: 'The intended use case' },
                },
                required: ['entityName'],
            },
        },
        {
            Name: 'run_vectorization',
            Description: 'Trigger vectorization for an entity using its configured document template',
            ExecutionSide: 'server',
            ParameterSchema: {
                type: 'object',
                properties: {
                    entityID: { type: 'string', description: 'The Entity ID to vectorize' },
                    entityDocumentID: { type: 'string', description: 'Optional Entity Document ID (if omitted, uses default for the entity)' },
                    listID: { type: 'string', description: 'Optional List ID to restrict vectorization to a specific list' },
                    listBatchCount: { type: 'number', description: 'Number of records to fetch at a time (default: 50)' },
                },
                required: ['entityID'],
            },
        },
        {
            Name: 'run_duplicate_detection',
            Description: 'Run duplicate detection on an entity using vector similarity',
            ExecutionSide: 'server',
            ParameterSchema: {
                type: 'object',
                properties: {
                    entityID: { type: 'string', description: 'The Entity ID to check for duplicates' },
                    listID: { type: 'string', description: 'The List ID containing records to check' },
                    entityDocumentID: { type: 'string', description: 'The Entity Document ID defining the vectorization template' },
                    probabilityScore: { type: 'number', description: 'Minimum score threshold for potential duplicates (0-1)' },
                },
                required: ['entityID', 'listID'],
            },
        },
        // Client tools
        {
            Name: 'navigate_to_tab',
            Description: 'Navigate the Knowledge Hub UI to a specific tab (search, config, vectors, duplicates)',
            ExecutionSide: 'client',
            ParameterSchema: {
                type: 'object',
                properties: {
                    tab: { type: 'string', enum: ['search', 'config', 'vectors', 'duplicates'], description: 'Tab to navigate to' },
                },
                required: ['tab'],
            },
        },
        {
            Name: 'open_suggest_panel',
            Description: 'Open the entity document suggestion panel in the UI',
            ExecutionSide: 'client',
            ParameterSchema: {
                type: 'object',
                properties: {
                    entityName: { type: 'string', description: 'Pre-select this entity in the suggestion panel' },
                },
                required: [],
            },
        },
        {
            Name: 'apply_search_filter',
            Description: 'Apply search filters to the Knowledge Hub search UI',
            ExecutionSide: 'client',
            ParameterSchema: {
                type: 'object',
                properties: {
                    entityNames: { type: 'array', items: { type: 'string' }, description: 'Filter to these entity names' },
                    sourceTypes: { type: 'array', items: { type: 'string' }, description: 'Filter to these source types' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Filter to these tags' },
                },
                required: [],
            },
        },
    ];

    /**
     * Execute a server-side tool by name.
     */
    public async ExecuteServerTool(
        toolName: string,
        parameters: Record<string, unknown>,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
        LogStatus(`KnowledgeAgent: Executing server tool "${toolName}"`);

        switch (toolName) {
            case 'search_knowledge':
                return this.executeSearchKnowledge(parameters, contextUser, provider);
            case 'create_entity_document':
                return this.executeCreateEntityDocument(parameters, contextUser);
            case 'run_vectorization':
                return this.executeRunVectorization(parameters, contextUser);
            case 'run_duplicate_detection':
                return this.executeRunDuplicateDetection(parameters, contextUser);
            default:
                return { Success: false, ErrorMessage: `Unknown server tool: ${toolName}` };
        }
    }

    /**
     * Build a client tool request for the Angular frontend.
     */
    public BuildClientToolRequest(
        toolName: string,
        parameters: Record<string, unknown>
    ): ClientToolRequest {
        return {
            RequestID: this.generateRequestID(),
            ToolName: toolName,
            Parameters: parameters,
            RequestedAt: new Date(),
        };
    }

    /**
     * Get the tool definitions formatted for LLM function calling.
     */
    public GetToolDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
        return KnowledgeAgent.Tools.map(tool => ({
            name: tool.Name,
            description: tool.Description,
            parameters: tool.ParameterSchema,
        }));
    }

    // ================================================================
    // Private Tool Implementations
    // ================================================================

    /**
     * Execute search via the SearchKnowledge GraphQL mutation.
     * This uses the same UnifiedSearchService (vector + FTS + RRF fusion) that
     * the Angular search component uses, ensuring consistent results.
     */
    private async executeSearchKnowledge(
        parameters: Record<string, unknown>,
        _contextUser: UserInfo,
        providerArg?: IMetadataProvider
    ): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
        try {
            const query = String(parameters['query'] || '');
            if (!query.trim()) {
                return { Success: false, ErrorMessage: 'Query cannot be empty' };
            }

            const maxResults = Number(parameters['maxResults']) || 20;
            const entityFilter = parameters['entityNames'] as string[] | undefined;

            const provider = (providerArg ?? Metadata.Provider) as { ExecuteGQL?: (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>> };
            if (!provider?.ExecuteGQL) {
                return { Success: false, ErrorMessage: 'GraphQL provider not available for search' };
            }

            const mutation = `
                mutation SearchKnowledge($query: String!, $maxResults: Float, $filters: SearchFiltersInput) {
                    SearchKnowledge(query: $query, maxResults: $maxResults, filters: $filters) {
                        Success
                        TotalCount
                        ElapsedMs
                        ErrorMessage
                        Results {
                            ID
                            EntityName
                            RecordID
                            SourceType
                            Title
                            Snippet
                            Score
                            Tags
                        }
                    }
                }
            `;

            const filters = entityFilter?.length
                ? { EntityNames: entityFilter }
                : undefined;

            const gqlResult = await provider.ExecuteGQL(mutation, {
                query,
                maxResults,
                filters
            });

            const data = (gqlResult as Record<string, Record<string, unknown>>)['SearchKnowledge'];
            if (!data?.['Success']) {
                return {
                    Success: false,
                    ErrorMessage: String(data?.['ErrorMessage'] ?? 'Search failed')
                };
            }

            return {
                Success: true,
                Data: {
                    Results: data['Results'],
                    TotalCount: data['TotalCount'],
                    ElapsedMs: data['ElapsedMs'],
                },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgeAgent.search_knowledge failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    private async executeCreateEntityDocument(
        parameters: Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
        try {
            const entityName = String(parameters['entityName'] || '');
            const useCase = String(parameters['useCase'] || 'search');

            if (!entityName) {
                return { Success: false, ErrorMessage: 'entityName is required' };
            }

            // Dynamic import to avoid circular dependencies
            const { EntityDocumentSuggester } = await import('@memberjunction/ai-vector-sync');
            const suggester = new EntityDocumentSuggester();
            const response = await suggester.SuggestDocument(
                entityName,
                useCase as 'duplicate detection' | 'search' | 'classification',
                contextUser
            );

            if (!response.Success || !response.Suggestion) {
                return { Success: false, ErrorMessage: response.ErrorMessage || 'Suggestion failed' };
            }

            return {
                Success: true,
                Data: {
                    Template: response.Suggestion.template,
                    SelectedFields: response.Suggestion.selectedFields,
                    Reasoning: response.Suggestion.reasoning,
                    PotentialMatchThreshold: response.Suggestion.potentialMatchThreshold,
                    AbsoluteMatchThreshold: response.Suggestion.absoluteMatchThreshold,
                },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgeAgent.create_entity_document failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    private async executeRunVectorization(
        parameters: Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
        try {
            const entityID = String(parameters['entityID'] || '');
            if (!entityID) {
                return { Success: false, ErrorMessage: 'entityID is required' };
            }

            // Dynamic import to avoid circular dependencies
            const { EntityVectorSyncer } = await import('@memberjunction/ai-vector-sync');
            const syncer = new EntityVectorSyncer();
            await syncer.Config(false, contextUser);

            const result = await syncer.VectorizeEntity({
                entityID,
                entityDocumentID: parameters['entityDocumentID'] ? String(parameters['entityDocumentID']) : undefined,
                listID: parameters['listID'] ? String(parameters['listID']) : undefined,
                listBatchCount: Number(parameters['listBatchCount']) || 50,
            }, contextUser);

            return {
                Success: result.success,
                Data: { Status: result.status },
                ErrorMessage: result.errorMessage || undefined,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgeAgent.run_vectorization failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    private async executeRunDuplicateDetection(
        parameters: Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
        try {
            const entityID = String(parameters['entityID'] || '');
            const listID = String(parameters['listID'] || '');
            if (!entityID) {
                return { Success: false, ErrorMessage: 'entityID is required' };
            }
            if (!listID) {
                return { Success: false, ErrorMessage: 'listID is required' };
            }

            const detector = new DuplicateRecordDetector();
            detector.CurrentUser = contextUser;

            const request = this.buildDuplicateRequest(entityID, listID, parameters);
            const result = await detector.GetDuplicateRecords(request, contextUser);

            return {
                Success: result.Status === 'Success',
                Data: {
                    Status: result.Status,
                    DuplicateCount: result.PotentialDuplicateResult?.length || 0,
                },
                ErrorMessage: result.ErrorMessage || undefined,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgeAgent.run_duplicate_detection failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    private buildDuplicateRequest(
        entityID: string,
        listID: string,
        parameters: Record<string, unknown>
    ): { EntityID: string; ListID: string; RecordIDs: never[]; EntityDocumentID?: string; ProbabilityScore?: number } {
        return {
            EntityID: entityID,
            ListID: listID,
            RecordIDs: [],
            EntityDocumentID: parameters['entityDocumentID'] ? String(parameters['entityDocumentID']) : undefined,
            ProbabilityScore: parameters['probabilityScore'] != null ? Number(parameters['probabilityScore']) : undefined,
        };
    }

    private generateRequestID(): string {
        return `ctr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }
}
