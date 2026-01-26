/**
 * @fileoverview Reranker Service for MemberJunction AI Agent framework.
 *
 * Provides centralized management of reranker instances and two-stage retrieval
 * for semantic relevance ranking of agent memory notes.
 *
 * @module @memberjunction/ai-reranker
 * @since 3.0.0
 */

import { LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine, NoteMatchResult } from '@memberjunction/aiengine';
import { AIAgentNoteEntity, AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { BaseReranker, RerankDocument } from '@memberjunction/ai';
import { AIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { RerankerConfiguration, parseRerankerConfiguration } from './config.types';

// Re-export config types for convenience
export { RerankerConfiguration, parseRerankerConfiguration };

/**
 * Result from reranking operation including metrics.
 */
export interface RerankServiceResult {
    /**
     * Reranked notes sorted by relevance
     */
    notes: NoteMatchResult[];

    /**
     * Whether the reranking operation succeeded
     */
    success: boolean;

    /**
     * Time taken for reranking in milliseconds
     */
    durationMs: number;

    /**
     * Optional usage metrics for cost tracking
     */
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        cost?: number;
    };

    /**
     * ID of the created run step (if observability enabled)
     */
    runStepID?: string;
}

/**
 * Options for observability integration.
 */
export interface RerankObservabilityOptions {
    /**
     * Agent run ID for tracing
     */
    agentRunID?: string;

    /**
     * Parent step ID for hierarchical step logging
     */
    parentStepID?: string;

    /**
     * Step sequence number
     */
    stepNumber?: number;
}

/**
 * Service for managing reranker instances and performing note reranking.
 * Implements singleton pattern for efficient reranker caching.
 *
 * Key responsibilities:
 * - Parse RerankerConfiguration JSON from agent settings
 * - Instantiate and cache reranker instances by model ID
 * - Perform two-stage retrieval (vector search -> reranking)
 * - Handle graceful fallback when reranking fails
 *
 * Usage:
 * ```typescript
 * const service = RerankerService.Instance;
 * const config = service.parseConfiguration(agent.RerankerConfiguration);
 *
 * if (config?.enabled) {
 *     const result = await service.rerankNotes(
 *         vectorSearchResults,
 *         userQuery,
 *         config,
 *         contextUser
 *     );
 * }
 * ```
 */
export class RerankerService {
    private static _instance: RerankerService | null = null;
    private _rerankerCache: Map<string, BaseReranker> = new Map();

    /**
     * Get the singleton instance of RerankerService
     */
    public static get Instance(): RerankerService {
        if (!RerankerService._instance) {
            RerankerService._instance = new RerankerService();
        }
        return RerankerService._instance;
    }

    /**
     * Private constructor to enforce singleton pattern
     */
    private constructor() {}

    /**
     * Parse RerankerConfiguration JSON from agent settings.
     * Returns null if configuration is missing or invalid.
     *
     * @param configJson - JSON string from AIAgent.RerankerConfiguration
     * @returns Parsed configuration with defaults applied, or null if disabled/invalid
     */
    public parseConfiguration(configJson: string | null | undefined): RerankerConfiguration | null {
        return parseRerankerConfiguration(configJson);
    }

    /**
     * Get or create a reranker instance for the specified model.
     * Caches instances for reuse across multiple calls.
     *
     * @param modelID - ID of the AIModel with type='Reranker'
     * @param contextUser - User context for operations
     * @param promptID - Optional prompt ID for LLM-based rerankers
     * @returns Reranker instance or null if unavailable
     */
    public async getReranker(
        modelID: string,
        contextUser: UserInfo,
        promptID?: string
    ): Promise<BaseReranker | null> {
        // Check cache first
        const cacheKey = promptID ? `${modelID}:${promptID}` : modelID;
        const cached = this._rerankerCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Load model from AIEngine
        const model = AIEngine.Instance.Models.find(m => m.ID === modelID);
        if (!model) {
            LogError(`RerankerService: Model not found with ID: ${modelID}`);
            return null;
        }

        if (!model.IsActive) {
            LogError(`RerankerService: Model ${model.Name} is not active`);
            return null;
        }

        // Get the driver class and API key
        const { driverClass, apiKey, apiName } = await this.getModelDriverInfo(model, contextUser);
        if (!driverClass) {
            LogError(`RerankerService: No driver class found for model ${model.Name}`);
            return null;
        }

        // Create the reranker instance
        try {
            let reranker: BaseReranker | null = null;

            if (driverClass === 'LLMReranker') {
                // LLM reranker needs promptID and contextUser
                if (!promptID) {
                    LogError(`RerankerService: LLMReranker requires a promptID`);
                    return null;
                }
                reranker = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>(
                    BaseReranker,
                    driverClass,
                    '', // No API key for LLM reranker
                    apiName || model.APIName || '',
                    promptID,
                    contextUser
                );
            } else {
                // Standard reranker (Cohere, etc.)
                if (!apiKey) {
                    LogError(`RerankerService: No API key available for ${driverClass}`);
                    return null;
                }
                reranker = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>(
                    BaseReranker,
                    driverClass,
                    apiKey,
                    apiName || model.APIName || ''
                );
            }

            // Check if instance was created successfully
            if (!reranker) {
                LogError(`RerankerService: Failed to create instance of ${driverClass}`);
                return null;
            }

            // Cache and return
            this._rerankerCache.set(cacheKey, reranker);
            LogStatus(`RerankerService: Created ${driverClass} reranker for model ${model.Name}`);
            return reranker;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RerankerService: Failed to create reranker: ${message}`);
            return null;
        }
    }

    /**
     * Get driver class and API key information for a model.
     * Looks up ModelVendor relationships to find the active vendor.
     */
    private async getModelDriverInfo(
        model: AIModelEntityExtended,
        contextUser: UserInfo
    ): Promise<{ driverClass: string | null; apiKey: string | null; apiName: string | null }> {
        // Find the active model vendor relationship
        const modelVendors = AIEngine.Instance.ModelVendors.filter(
            mv => mv.ModelID === model.ID && mv.Status === 'Active'
        );

        if (modelVendors.length === 0) {
            // Check if this is the LLM Reranker by name (it doesn't need a vendor)
            if (model.Name === 'LLM Reranker') {
                return {
                    driverClass: 'LLMReranker',
                    apiKey: null, // LLM reranker uses AI Prompts, no API key needed
                    apiName: null
                };
            }
            // No vendor found and not LLM reranker
            return {
                driverClass: null,
                apiKey: null,
                apiName: null
            };
        }

        // Sort by priority (lower is better)
        const sortedVendors = modelVendors.sort((a, b) => a.Priority - b.Priority);
        const primaryVendor = sortedVendors[0];

        return {
            driverClass: primaryVendor.DriverClass || null,
            apiKey: this.getAPIKeyForDriver(primaryVendor.DriverClass || ''),
            apiName: primaryVendor.APIName || null
        };
    }

    /**
     * Get API key for a reranker driver from environment variables.
     * Uses naming convention: AI_VENDOR_API_KEY__<DRIVERCLASS>
     */
    private getAPIKeyForDriver(driverClass: string): string | null {
        if (!driverClass) return null;

        // Standard MemberJunction API key naming convention
        const envVar = `AI_VENDOR_API_KEY__${driverClass.toUpperCase()}`;
        const apiKey = process.env[envVar];

        if (apiKey && apiKey.trim().length > 0) {
            return apiKey;
        }

        return null;
    }

    /**
     * Rerank notes using the configured reranker.
     * Implements two-stage retrieval for semantic relevance ranking.
     *
     * IMPORTANT: This service does NOT handle fallback logic. If reranking fails,
     * this method throws an error. The calling code (agent class) is responsible
     * for deciding whether to fall back to original vector search results.
     *
     * @param notes - Vector search results to rerank
     * @param query - User query for relevance scoring
     * @param config - Reranker configuration from agent
     * @param contextUser - User context for operations
     * @param options - Optional observability parameters
     * @returns Reranked notes sorted by relevance
     * @throws Error if reranker is unavailable or reranking fails
     */
    public async rerankNotes(
        notes: NoteMatchResult[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        options?: RerankObservabilityOptions
    ): Promise<RerankServiceResult> {
        const startTime = Date.now();
        let stepEntity: AIAgentRunStepEntity | null = null;

        // Early return if no notes to rerank
        if (notes.length === 0) {
            return {
                notes,
                success: true,
                durationMs: Date.now() - startTime
            };
        }

        // Create run step if observability is enabled
        if (options?.agentRunID) {
            try {
                stepEntity = await this.createRerankRunStep(
                    options,
                    contextUser,
                    { query, noteCount: notes.length, config, notes },
                    startTime
                );
            } catch (e) {
                // Don't fail the reranking operation if step creation fails
                LogError(`RerankerService: Failed to create observability step: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        try {
            // Get or create reranker - throws if unavailable
            const reranker = await this.getReranker(
                config.rerankerModelId,
                contextUser,
                config.rerankPromptID
            );

            if (!reranker) {
                throw new Error(`Reranker not available for model ID: ${config.rerankerModelId}`);
            }

            // Convert notes to rerank documents
            const documents: RerankDocument[] = notes.map(match => ({
                id: match.note.ID,
                text: this.buildDocumentText(match.note, config.contextFields),
                metadata: { noteEntity: match.note },
                originalScore: match.similarity
            }));

            // Perform reranking - let errors propagate to caller
            LogStatus(`RerankerService: Reranking ${documents.length} notes`);
            const response = await reranker.Rerank({
                query,
                documents,
                topK: documents.length // Get all, we'll filter by threshold
            });

            if (!response.success) {
                throw new Error(response.errorMessage || 'Reranking failed');
            }

            // Map results back to NoteMatchResult format
            // Filter by minimum relevance threshold
            const rerankedNotes: NoteMatchResult[] = response.results
                .filter(r => r.relevanceScore >= config.minRelevanceThreshold)
                .map(r => {
                    const noteEntity = r.document.metadata?.noteEntity as AIAgentNoteEntity;
                    return {
                        note: noteEntity,
                        similarity: r.relevanceScore
                    };
                });

            LogStatus(`RerankerService: Reranked to ${rerankedNotes.length} notes (threshold: ${config.minRelevanceThreshold})`);

            // Finalize step on success
            if (stepEntity) {
                await this.finalizeRerankRunStep(stepEntity, true, {
                    rerankedCount: rerankedNotes.length,
                    durationMs: Date.now() - startTime,
                    rerankedNotes
                });
            }

            return {
                notes: rerankedNotes,
                success: true,
                durationMs: Date.now() - startTime,
                runStepID: stepEntity?.ID
            };

        } catch (error) {
            // Finalize step on failure
            if (stepEntity) {
                await this.finalizeRerankRunStep(stepEntity, false, {
                    rerankedCount: 0,
                    durationMs: Date.now() - startTime
                }, error instanceof Error ? error.message : String(error));
            }
            throw error;
        }
    }

    /**
     * Build document text from note entity for reranking.
     * Includes note text and optional context fields.
     */
    private buildDocumentText(
        note: AIAgentNoteEntity,
        contextFields?: string[]
    ): string {
        const parts: string[] = [note.Note || ''];

        // Add optional context fields if specified
        if (contextFields && contextFields.length > 0) {
            for (const field of contextFields) {
                // Use Get method for dynamic field access on BaseEntity
                const value = note.Get(field);
                if (value && typeof value === 'string' && value.trim().length > 0) {
                    parts.push(`${field}: ${value}`);
                }
            }
        }

        return parts.join('\n');
    }

    /**
     * Clear the reranker cache.
     * Useful for testing or when models are updated.
     */
    public clearCache(): void {
        this._rerankerCache.clear();
    }

    /**
     * Create an AIAgentRunStep record for reranking operation.
     * This enables observability in the agent run trace.
     */
    private async createRerankRunStep(
        options: RerankObservabilityOptions,
        contextUser: UserInfo,
        input: { query: string; noteCount: number; config: RerankerConfiguration; notes: NoteMatchResult[] },
        startTime: number
    ): Promise<AIAgentRunStepEntity> {
        const md = new Metadata();
        const stepEntity = await md.GetEntityObject<AIAgentRunStepEntity>(
            'MJ: AI Agent Run Steps',
            contextUser
        );

        stepEntity.AgentRunID = options.agentRunID!;
        stepEntity.StepNumber = options.stepNumber || 0;
        stepEntity.StepType = 'Decision'; // Reranking is a decision step for relevance scoring
        stepEntity.StepName = 'Rerank Notes';
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date(startTime);
        stepEntity.ParentID = options.parentStepID || null;
        stepEntity.InputData = JSON.stringify({
            query: input.query.substring(0, 500), // Truncate for storage
            noteCount: input.noteCount,
            rerankerModelId: input.config.rerankerModelId,
            minRelevanceThreshold: input.config.minRelevanceThreshold
        });

        // Store input notes in PayloadAtStart for observability
        stepEntity.PayloadAtStart = JSON.stringify({
            candidateNotes: input.notes.map((n, idx) => ({
                index: idx,
                id: n.note.ID,
                type: n.note.Type,
                vectorScore: n.similarity,
                preview: (n.note.Note || '').substring(0, 150)
            }))
        });

        if (!await stepEntity.Save()) {
            LogError(`RerankerService: Failed to create run step: ${JSON.stringify(stepEntity.LatestResult)}`);
        }

        return stepEntity;
    }

    /**
     * Finalize an AIAgentRunStep record after reranking completes.
     */
    private async finalizeRerankRunStep(
        stepEntity: AIAgentRunStepEntity,
        success: boolean,
        output: { rerankedCount: number; durationMs: number; rerankedNotes?: NoteMatchResult[] },
        errorMessage?: string
    ): Promise<void> {
        try {
            stepEntity.Status = success ? 'Completed' : 'Failed';
            stepEntity.CompletedAt = new Date();
            stepEntity.Success = success;
            stepEntity.ErrorMessage = errorMessage || null;
            stepEntity.OutputData = JSON.stringify({
                rerankedCount: output.rerankedCount,
                durationMs: output.durationMs,
                success
            });

            // Store reranked notes with scores in PayloadAtEnd for observability
            if (output.rerankedNotes) {
                stepEntity.PayloadAtEnd = JSON.stringify({
                    rerankedNotes: output.rerankedNotes.map((n, rank) => ({
                        rank: rank + 1,
                        id: n.note.ID,
                        type: n.note.Type,
                        rerankScore: n.similarity,
                        preview: (n.note.Note || '').substring(0, 150)
                    }))
                });
            }

            if (!await stepEntity.Save()) {
                LogError(`RerankerService: Failed to finalize run step: ${JSON.stringify(stepEntity.LatestResult)}`);
            }
        } catch (e) {
            LogError(`RerankerService: Error finalizing run step: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
