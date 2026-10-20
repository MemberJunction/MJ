/**
 * @fileoverview Reranker Service for MemberJunction AI Agent framework.
 *
 * Provides centralized management of reranker instances and two-stage retrieval
 * for semantic relevance ranking of agent memory notes.
 *
 * @module @memberjunction/ai-reranker
 * @since 3.0.0
 */

import { IMetadataProvider, LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual, BaseSingleton } from '@memberjunction/global';
import { AIEngine, ExampleMatchResult, NoteMatchResult } from '@memberjunction/aiengine';
import { MJAIAgentExampleEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { BaseReranker, RerankDocument, GetAIAPIKey } from '@memberjunction/ai';
import type { RerankResponse } from '@memberjunction/ai';
import { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { RerankerConfiguration, ParseRerankerConfiguration, parseRerankerConfiguration } from './config.types';
import { AIRerankerRunner } from './AIRerankerRunner';
import { IsPromptBackedReranker } from './prompt-backed-rerankers';
import type { AIRerankRunResult } from './rerank-runner.types';
import type { DecisionRerankOptions } from './DecisionReranker';

// Re-export config types for convenience
export {
    RerankerConfiguration,
    ParseRerankerConfiguration,
    /** @deprecated Use {@link ParseRerankerConfiguration} instead. */
    parseRerankerConfiguration,
};

/** The driver class of `DecisionReranker`, which has a default decision prompt. */
const DECISION_RERANKER_DRIVER = 'DecisionReranker';

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

    /**
     * Called with the rerank's run step as soon as it is created, so the agent can add it to its run's
     * steps. When the rerank finishes, the step's `PromptRun` is the rerank's `MJ: AI Prompt Runs` row,
     * whose `TotalCost` and token rollups include a prompt-backed reranker's own prompt runs, so the
     * agent run's cost and token totals, and its `MaxCostPerRun` / `MaxTokensPerRun` guardrails, count
     * the rerank.
     */
    OnStepCreated?: (step: MJAIAgentRunStepEntityExtended) => void;
}

/** A rerank step's `InputData`: the request, and how many candidates it reranks. */
interface RerankStepInput {
    query: string;
    rerankerModelId: string;
    minRelevanceThreshold: number;
    noteCount?: number;
    exampleCount?: number;
}

/** A candidate as a rerank step's `PayloadAtStart` records it. */
interface RerankCandidatePreview {
    index: number;
    id: string;
    type?: string;
    vectorScore: number;
    preview: string;
}

/** A kept item as a rerank step's `PayloadAtEnd` records it. */
interface RerankedPreview {
    rank: number;
    id: string;
    type?: string;
    rerankScore: number;
    preview: string;
}

/** A rerank step's `PayloadAtEnd`: the kept notes or examples. */
interface RerankedPayload {
    rerankedNotes?: RerankedPreview[];
    rerankedExamples?: RerankedPreview[];
}

/** What a rerank step records when it starts: its name, the request, and the candidates. */
interface RerankStepStart {
    StepName: string;
    InputData: RerankStepInput;
    PayloadAtStart: { candidateNotes?: RerankCandidatePreview[]; candidateExamples?: RerankCandidatePreview[] };
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
export class RerankerService extends BaseSingleton<RerankerService> {
    private _rerankerCache: Map<string, BaseReranker> = new Map();

    /**
     * Get the singleton instance of RerankerService
     */
    public static get Instance(): RerankerService {
        return RerankerService.getInstance<RerankerService>();
    }

    public constructor() {
        super();
    }

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
     * @deprecated Builds a driver directly, so the call gets no failover and writes no
     * `MJ: AI Prompt Runs` row. Use {@link AIRerankerRunner.RunRerank}, which `RerankNotes` uses.
     *
     * @param modelID - ID of the AIModel with type='Reranker'
     * @param contextUser - User context for operations
     * @param promptID - The prompt a prompt-backed reranker runs. `LLMReranker` requires its chat
     * prompt's ID. For `DecisionReranker` it is optional: without one it asks the decision prompt its
     * model-vendor row's `APIName` names, as `AIRerankerRunner` does, or `Default Decision` when that
     * names no prompt.
     * @returns Reranker instance or null if unavailable
     */
    public async GetReranker(
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
        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelID));
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

            if (IsPromptBackedReranker(driverClass)) {
                // A prompt-backed reranker (LLMReranker, DecisionReranker) needs the prompt it runs and contextUser
                const promptToRun = promptID || this.defaultPromptID(driverClass, apiName);
                if (promptToRun === undefined) {
                    LogError(`RerankerService: ${driverClass} requires a promptID`);
                    return null;
                }
                reranker = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>(
                    BaseReranker,
                    driverClass,
                    '', // No API key for a prompt-backed reranker
                    apiName || model.APIName || '',
                    promptToRun,
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
     * The prompt a prompt-backed reranker runs when the caller names none. A `DecisionReranker` asks
     * the decision prompt its model-vendor row's `APIName` names, as `AIRerankerRunner` does, or, when
     * that names no prompt, an empty ID, which makes it ask `Default Decision`. An `LLMReranker` has no
     * default: undefined, because its caller must name its chat prompt.
     */
    private defaultPromptID(driverClass: string, apiName: string | null): string | undefined {
        if (driverClass !== DECISION_RERANKER_DRIVER) {
            return undefined;
        }
        const target = apiName?.trim().toLowerCase();
        const named = target ? AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target) : undefined;
        return named?.ID ?? '';
    }

    /** @deprecated Use {@link GetReranker}. */
    public async getReranker(
        modelID: string,
        contextUser: UserInfo,
        promptID?: string
    ): Promise<BaseReranker | null> {
        return this.GetReranker(modelID, contextUser, promptID);
    }

    /**
     * Get driver class and API key information for a model.
     * Looks up ModelVendor relationships to find the active vendor.
     */
    private async getModelDriverInfo(
        model: MJAIModelEntityExtended,
        contextUser: UserInfo
    ): Promise<{ driverClass: string | null; apiKey: string | null; apiName: string | null }> {
        // Find the active model vendor relationship
        const modelVendors = AIEngine.Instance.ModelVendors.filter(
            mv => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active'
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
     * Get API key for a reranker driver using the standard MJ API key utility.
     * Delegates to GetAIAPIKey which handles case-insensitive env var lookup.
     */
    private getAPIKeyForDriver(driverClass: string): string | null {
        if (!driverClass) return null;
        const key = GetAIAPIKey(driverClass);
        return key || null;
    }

    /**
     * Rerank notes using the configured reranker.
     * Implements two-stage retrieval for semantic relevance ranking.
     *
     * Reranking goes through {@link AIRerankerRunner}, pinned to `config.rerankerModelId`, so every
     * call writes an `MJ: AI Prompt Runs` row. The observability step, when there is one, links to
     * that row through its `TargetLogID`.
     *
     * IMPORTANT: This service does NOT handle fallback logic. If reranking fails, this method throws.
     * The calling code (agent class) decides, from `config.fallbackOnError`, whether to fall back to
     * the original vector search results.
     *
     * @param notes - Vector search results to rerank
     * @param query - User query for relevance scoring
     * @param config - Reranker configuration from agent
     * @param contextUser - User context for operations
     * @param options - Optional observability parameters
     * @returns Reranked notes sorted by relevance
     * @throws Error if reranking fails
     */
    public async RerankNotes(
        notes: NoteMatchResult[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        options?: RerankObservabilityOptions
    ): Promise<RerankServiceResult> {
        const startTime = Date.now();

        // Early return if no notes to rerank
        if (notes.length === 0) {
            return {
                notes,
                success: true,
                durationMs: Date.now() - startTime
            };
        }

        const step = await this.startRerankStep(options, contextUser, () => this.notesStepStart(query, config, notes), startTime);
        // Rerank through the runner, which selects the model, fails over and records the run
        const rerankedNotes = await this.observeRerank(
            step,
            startTime,
            () => this.runReranker(notes, query, config, contextUser, options),
            response => this.notesAboveThreshold(response, config),
            kept => this.notesPayloadAtEnd(kept)
        );
        LogStatus(`RerankerService: Reranked to ${rerankedNotes.length} notes (threshold: ${config.minRelevanceThreshold})`);

        return {
            notes: rerankedNotes,
            success: true,
            durationMs: Date.now() - startTime,
            runStepID: step?.ID
        };
    }

    /** The reranked notes at or above the threshold, most relevant first, each with its rerank score as `similarity`. */
    private notesAboveThreshold(response: RerankResponse, config: RerankerConfiguration): NoteMatchResult[] {
        return response.results
            .filter(r => r.relevanceScore >= config.minRelevanceThreshold)
            .map(r => ({
                note: r.document.metadata?.noteEntity as MJAIAgentNoteEntity,
                similarity: r.relevanceScore
            }));
    }

    /**
     * Reranks the notes through {@link AIRerankerRunner}, pinned to the configured model. Asks for
     * every document back, since the caller filters by threshold.
     */
    private runReranker(
        notes: NoteMatchResult[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        options?: RerankObservabilityOptions
    ): Promise<AIRerankRunResult> {
        // Convert notes to rerank documents
        const documents: RerankDocument[] = notes.map(match => ({
            id: match.note.ID,
            text: this.buildDocumentText(match.note, config.contextFields),
            metadata: { noteEntity: match.note },
            originalScore: match.similarity
        }));

        LogStatus(`RerankerService: Reranking ${documents.length} notes`);
        return this.rerankDocuments(documents, query, config, contextUser, options?.agentRunID);
    }

    /**
     * Reranks documents through {@link AIRerankerRunner}, pinned to the configured model and its
     * configured prompt. Asks for every document back, since the caller filters by threshold.
     */
    private rerankDocuments(
        documents: RerankDocument[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        agentRunID?: string
    ): Promise<AIRerankRunResult> {
        return new AIRerankerRunner().RunRerank({
            query,
            documents,
            topK: documents.length, // Get all, we'll filter by threshold
            options: this.decisionRerankOptions(config),
            ContextUser: contextUser,
            ModelID: config.rerankerModelId,
            ChatPromptID: config.rerankPromptID,
            AgentRunID: agentRunID
        });
    }

    /** The settings a DecisionReranker takes from the configuration. Other rerankers ignore them. */
    private decisionRerankOptions(config: RerankerConfiguration): DecisionRerankOptions {
        return { TimeoutMS: config.decisionTimeoutMS, MaxDocumentsPerCall: config.decisionMaxDocumentsPerCall };
    }

    /**
     * Rerank agent examples using the configured reranker: the examples stage that
     * `RerankerConfiguration.rerankExamples` turns on. It uses the same model, prompt and
     * `minRelevanceThreshold` as {@link RerankNotes}. Each document is the example's input and
     * output. With an agent run in `options`, it records a `Rerank Examples` step linked to the
     * rerank's run, as {@link RerankNotes} records `Rerank Notes`.
     *
     * Like RerankNotes, this method throws when reranking fails. The calling code decides, from
     * `config.fallbackOnError`, whether to fall back to the vector search results.
     *
     * @param examples - Vector search results to rerank
     * @param query - User query for relevance scoring
     * @param config - Reranker configuration from agent
     * @param contextUser - User context for operations
     * @param options - Optional observability parameters
     * @returns The examples at or above the threshold, most relevant first, each with its rerank score as `similarity`
     * @throws Error if reranking fails
     */
    public async RerankExamples(
        examples: ExampleMatchResult[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        options?: RerankObservabilityOptions
    ): Promise<ExampleMatchResult[]> {
        if (examples.length === 0) {
            return examples;
        }
        const startTime = Date.now();
        const documents: RerankDocument[] = examples.map(match => ({
            id: match.example.ID,
            text: this.buildExampleText(match.example),
            originalScore: match.similarity
        }));

        LogStatus(`RerankerService: Reranking ${documents.length} examples`);
        const step = await this.startRerankStep(options, contextUser, () => this.examplesStepStart(query, config, examples), startTime);
        const reranked = await this.observeRerank(
            step,
            startTime,
            () => this.rerankDocuments(documents, query, config, contextUser, options?.agentRunID),
            response => this.examplesAboveThreshold(response, examples, config),
            kept => this.examplesPayloadAtEnd(kept)
        );
        LogStatus(`RerankerService: Reranked to ${reranked.length} examples (threshold: ${config.minRelevanceThreshold})`);
        return reranked;
    }

    /** The reranked examples at or above the threshold, most relevant first, each with its rerank score as `similarity`. */
    private examplesAboveThreshold(response: RerankResponse, examples: ExampleMatchResult[], config: RerankerConfiguration): ExampleMatchResult[] {
        const byID = new Map(examples.map(match => [match.example.ID, match.example]));
        return response.results
            .filter(r => r.relevanceScore >= config.minRelevanceThreshold)
            .flatMap(r => {
                const example = byID.get(r.id);
                return example ? [{ example, similarity: r.relevanceScore }] : [];
            });
    }

    /** Build document text from an example entity for reranking: its input and its output. */
    private buildExampleText(example: MJAIAgentExampleEntity): string {
        return `Input: ${example.ExampleInput}\nOutput: ${example.ExampleOutput}`;
    }

    /** @deprecated Use {@link RerankNotes}. */
    public async rerankNotes(
        notes: NoteMatchResult[],
        query: string,
        config: RerankerConfiguration,
        contextUser: UserInfo,
        options?: RerankObservabilityOptions
    ): Promise<RerankServiceResult> {
        return this.RerankNotes(notes, query, config, contextUser, options);
    }

    /**
     * Build document text from note entity for reranking.
     * Includes note text and optional context fields.
     */
    private buildDocumentText(
        note: MJAIAgentNoteEntity,
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
    public ClearCache(): void {
        this._rerankerCache.clear();
    }

    /** @deprecated Use {@link ClearCache}. */
    public clearCache(): void {
        return this.ClearCache();
    }

    /**
     * Creates the rerank's run step when `options` names an agent run, and hands it to
     * `options.OnStepCreated`. Returns null when there is no agent run. A failure here is logged and
     * never fails the rerank.
     */
    private async startRerankStep(
        options: RerankObservabilityOptions | undefined,
        contextUser: UserInfo,
        start: () => RerankStepStart,
        startTime: number
    ): Promise<MJAIAgentRunStepEntityExtended | null> {
        if (!options?.agentRunID) {
            return null;
        }
        let step: MJAIAgentRunStepEntityExtended | null = null;
        try {
            step = await this.createRerankRunStep(options, contextUser, start(), startTime);
            options.OnStepCreated?.(step);
        } catch (e) {
            // Don't fail the reranking operation if step creation fails
            LogError(`RerankerService: Failed to create observability step: ${e instanceof Error ? e.message : String(e)}`);
        }
        return step;
    }

    /**
     * Runs a rerank and finalizes its step, when it has one: with the run, the kept items and their
     * payload when it succeeds, or as failed, with the run when there is one, before rethrowing.
     *
     * @param keep - Picks the items to return from a successful response
     * @param payloadAtEnd - The step's `PayloadAtEnd` for the kept items
     * @throws Error if reranking fails
     */
    private async observeRerank<T>(
        step: MJAIAgentRunStepEntityExtended | null,
        startTime: number,
        rerank: () => Promise<AIRerankRunResult>,
        keep: (response: RerankResponse) => T[],
        payloadAtEnd: (kept: T[]) => RerankedPayload
    ): Promise<T[]> {
        let run: AIRerankRunResult | undefined;
        try {
            run = await rerank();
            if (!run.Success || !run.Response) {
                throw new Error(run.ErrorMessage || 'Reranking failed');
            }
            const kept = keep(run.Response);
            if (step) {
                await this.finalizeRerankRunStep(step, true, { rerankedCount: kept.length, durationMs: Date.now() - startTime, payloadAtEnd: payloadAtEnd(kept) }, undefined, run);
            }
            return kept;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (step) {
                await this.finalizeRerankRunStep(step, false, { rerankedCount: 0, durationMs: Date.now() - startTime }, message, run);
            }
            throw error;
        }
    }

    /** What a `Rerank Notes` step records when it starts: the request, and each candidate note. */
    private notesStepStart(query: string, config: RerankerConfiguration, notes: NoteMatchResult[]): RerankStepStart {
        return {
            StepName: 'Rerank Notes',
            InputData: { ...this.stepInput(query, config), noteCount: notes.length },
            PayloadAtStart: {
                candidateNotes: notes.map((n, idx) => ({
                    index: idx,
                    id: n.note.ID,
                    type: n.note.Type,
                    vectorScore: n.similarity,
                    preview: this.preview(n.note.Note)
                }))
            }
        };
    }

    /** What a `Rerank Examples` step records when it starts: the request, and each candidate example. */
    private examplesStepStart(query: string, config: RerankerConfiguration, examples: ExampleMatchResult[]): RerankStepStart {
        return {
            StepName: 'Rerank Examples',
            InputData: { ...this.stepInput(query, config), exampleCount: examples.length },
            PayloadAtStart: {
                candidateExamples: examples.map((e, idx) => ({
                    index: idx,
                    id: e.example.ID,
                    vectorScore: e.similarity,
                    preview: this.preview(e.example.ExampleInput)
                }))
            }
        };
    }

    /** The request fields every rerank step records in its `InputData`. */
    private stepInput(query: string, config: RerankerConfiguration): RerankStepInput {
        return {
            query: query.substring(0, 500), // Truncate for storage
            rerankerModelId: config.rerankerModelId,
            minRelevanceThreshold: config.minRelevanceThreshold
        };
    }

    /** A `Rerank Notes` step's `PayloadAtEnd`: the kept notes with their scores. */
    private notesPayloadAtEnd(notes: NoteMatchResult[]): RerankedPayload {
        return {
            rerankedNotes: notes.map((n, rank) => ({
                rank: rank + 1,
                id: n.note.ID,
                type: n.note.Type,
                rerankScore: n.similarity,
                preview: this.preview(n.note.Note)
            }))
        };
    }

    /** A `Rerank Examples` step's `PayloadAtEnd`: the kept examples with their scores. */
    private examplesPayloadAtEnd(examples: ExampleMatchResult[]): RerankedPayload {
        return {
            rerankedExamples: examples.map((e, rank) => ({
                rank: rank + 1,
                id: e.example.ID,
                rerankScore: e.similarity,
                preview: this.preview(e.example.ExampleInput)
            }))
        };
    }

    /** The first 150 characters of a text, for a step payload. */
    private preview(text: string | null | undefined): string {
        return (text || '').substring(0, 150);
    }

    /**
     * Create an AIAgentRunStep record for reranking operation.
     * This enables observability in the agent run trace.
     */
    private async createRerankRunStep(
        options: RerankObservabilityOptions,
        contextUser: UserInfo,
        start: RerankStepStart,
        startTime: number,
        provider?: IMetadataProvider
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const md: Pick<IMetadataProvider, 'GetEntityObject'> = provider ?? new Metadata();
        const stepEntity = await md.GetEntityObject<MJAIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            contextUser
        );

        stepEntity.AgentRunID = options.agentRunID!;
        stepEntity.StepNumber = options.stepNumber || 1;
        stepEntity.StepType = 'Decision'; // Reranking is a decision step for relevance scoring
        stepEntity.StepName = start.StepName;
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date(startTime);
        stepEntity.ParentID = options.parentStepID || null;
        stepEntity.InputData = JSON.stringify(start.InputData);
        // Store the candidates in PayloadAtStart for observability
        stepEntity.PayloadAtStart = JSON.stringify(start.PayloadAtStart);

        if (!await stepEntity.Save()) {
            LogError(`RerankerService: Failed to create run step: ${JSON.stringify(stepEntity.LatestResult)}`);
        }

        return stepEntity;
    }

    /**
     * Finalize an AIAgentRunStep record after reranking completes.
     * When the rerank wrote an `MJ: AI Prompt Runs` row, the step links to it through `TargetLogID`,
     * and carries it as its `PromptRun`, which is how an agent run counts a step's cost and tokens.
     */
    private async finalizeRerankRunStep(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        output: { rerankedCount: number; durationMs: number; payloadAtEnd?: RerankedPayload },
        errorMessage?: string,
        run?: AIRerankRunResult
    ): Promise<void> {
        try {
            stepEntity.Status = success ? 'Completed' : 'Failed';
            stepEntity.CompletedAt = new Date();
            stepEntity.Success = success;
            stepEntity.ErrorMessage = errorMessage || null;
            if (run?.PromptRunID) {
                stepEntity.TargetLogID = run.PromptRunID;
            }
            if (run?.PromptRun) {
                stepEntity.PromptRun = run.PromptRun;
            }
            stepEntity.OutputData = JSON.stringify({
                rerankedCount: output.rerankedCount,
                durationMs: output.durationMs,
                success
            });

            // Store the reranked items with scores in PayloadAtEnd for observability
            if (output.payloadAtEnd) {
                stepEntity.PayloadAtEnd = JSON.stringify(output.payloadAtEnd);
            }

            if (!await stepEntity.Save()) {
                LogError(`RerankerService: Failed to finalize run step: ${JSON.stringify(stepEntity.LatestResult)}`);
            }
        } catch (e) {
            LogError(`RerankerService: Error finalizing run step: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
