import { BaseEntitySaveQueue, Metadata, UserInfo, LogError, LogStatus, IMetadataProvider } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseEmbeddings, EmbedTextsResult, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIPromptRunEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Result from an embedding execution via AIModelRunner.
 */
export interface EmbeddingRunResult {
    /** Whether the embedding call succeeded */
    Success: boolean;
    /** The embedding vectors (one per input text) */
    Vectors: number[][];
    /** The AIPromptRun ID created for tracking */
    PromptRunID: string | null;
    /** Total tokens used */
    TokensUsed: number;
    /** Cost of the call */
    Cost: number;
    /** Error message if failed */
    ErrorMessage: string | null;
    /** Execution time in milliseconds */
    ExecutionTimeMs: number;
}

/**
 * Parameters for running an embedding via AIModelRunner.
 */
export interface EmbeddingRunParams {
    /** The texts to embed */
    Texts: string[];
    /** Optional: specific AIPrompt ID for this embedding operation (type=Embedding).
     *  If not provided, uses the first active Embedding prompt found. */
    PromptID?: string;
    /** Optional: specific model ID to use. If not provided, uses the prompt's model configuration. */
    ModelID?: string;
    /** The user context for permissions and audit */
    ContextUser: UserInfo;
    /** Optional: parent run ID (e.g., agent run, classification run) for hierarchical tracking */
    ParentRunID?: string;
    /** Optional: human-readable description for the AIPromptRun record */
    Description?: string;
}

/**
 * AIModelRunner — Lightweight AI model execution tracker for non-LLM model types.
 *
 * Creates AIPromptRun records for embedding calls (and future: image, audio, video)
 * with full token/cost tracking. Uses the same model selection and vendor failover
 * infrastructure as AIPromptRunner but without template rendering or validation.
 *
 * Architecture:
 * - @memberjunction/ai (no MJ infra): BaseEmbeddings, ModelUsage
 * - @memberjunction/ai-core-plus (this class): AIModelRunner — creates AIPromptRun records
 * - @memberjunction/ai-prompts: AIPromptRunner — LLM-specific (template rendering, validation)
 *
 * Usage:
 * ```typescript
 * const runner = new AIModelRunner();
 * const result = await runner.RunEmbedding({
 *     Texts: ['Hello world', 'How are you'],
 *     ContextUser: currentUser,
 *     Description: 'Content item vectorization'
 * });
 * // result.PromptRunID links to the AIPromptRun record with token/cost data
 * ```
 */
export class AIModelRunner {
    private _provider: IMetadataProvider | null = null;

    /**
     * Fire-and-forget AIPromptRun persistence via the shared {@link BaseEntitySaveQueue}. The
     * embedding/model run record is observability — the caller gets its vectors regardless of whether
     * the tracking row persists — so saves are queued, not awaited, and the embedding call is never
     * blocked on a DB round-trip. The queue sequences saves per entity (the initial 'Running' INSERT
     * always completes before the 'Completed'/'Failed' UPDATE). `PromptRunID` is returned immediately
     * because `NewRecord()` client-generates the UUID.
     */
    private _promptRunQueue = new BaseEntitySaveQueue();

    /**
     * Optional metadata provider override. Callers should set
     * `instance.Provider = providerToUse` before invoking run methods
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    /**
     * Execute an embedding call with full AIPromptRun tracking.
     *
     * Creates an AIPromptRun record before the call, invokes the embedding model,
     * stores tokens/cost/timing on the run record, and returns the result.
     *
     * @param params - Embedding execution parameters
     * @returns Result with vectors, run ID, and usage metrics
     */
    public async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
        const startTime = Date.now();

        try {
            // Ensure AIEngine is loaded
            await AIEngineBase.Instance.Config(false, params.ContextUser);

            // Resolve the embedding prompt and model
            const { prompt, modelInfo } = await this.resolveEmbeddingModel(params);
            if (!modelInfo) {
                return this.errorResult('No embedding model available', startTime);
            }

            // Create AIPromptRun record (before the call)
            const promptRun = await this.createRunRecord(
                prompt, modelInfo.ModelID, modelInfo.VendorID, params, startTime
            );

            // Execute the embedding call
            const embeddingInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
                BaseEmbeddings, modelInfo.DriverClass, GetAIAPIKey(modelInfo.DriverClass)
            );

            if (!embeddingInstance) {
                await this.failRunRecord(promptRun, 'Failed to create embedding instance', startTime);
                return this.errorResult(`No embedding provider for driver: ${modelInfo.DriverClass}`, startTime);
            }

            const embedResult = await embeddingInstance.EmbedTexts({
                texts: params.Texts,
                model: modelInfo.APIName
            });

            if (!embedResult || !embedResult.vectors || embedResult.vectors.length === 0) {
                await this.failRunRecord(promptRun, 'Embedding returned no vectors', startTime);
                return this.errorResult('Embedding returned no vectors', startTime);
            }

            // Update AIPromptRun with usage data
            await this.completeRunRecord(promptRun, embedResult, startTime);

            return {
                Success: true,
                Vectors: embedResult.vectors,
                PromptRunID: promptRun?.ID ?? null,
                TokensUsed: embedResult.ModelUsage?.totalTokens ?? 0,
                Cost: embedResult.ModelUsage?.cost ?? 0,
                ErrorMessage: null,
                ExecutionTimeMs: Date.now() - startTime,
            };

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AIModelRunner.RunEmbedding failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    // ================================================================
    // Private: Model Resolution
    // ================================================================

    private async resolveEmbeddingModel(params: EmbeddingRunParams): Promise<{
        prompt: MJAIPromptEntityExtended | null;
        modelInfo: { ModelID: string; VendorID: string; DriverClass: string; APIName: string } | null;
    }> {
        const aiEngine = AIEngineBase.Instance;

        // Find the embedding prompt
        let prompt: MJAIPromptEntityExtended | null = null;
        if (params.PromptID) {
            prompt = aiEngine.Prompts.find(p => UUIDsEqual(p.ID, params.PromptID)) ?? null;
        } else {
            // Find first active Embedding-type prompt
            prompt = aiEngine.Prompts.find(p =>
                p.Type?.toLowerCase() === 'embedding' && p.Status === 'Active'
            ) ?? null;
        }

        // If explicit model ID provided, use it directly
        if (params.ModelID) {
            const model = aiEngine.Models.find(m => UUIDsEqual(m.ID, params.ModelID));
            if (model) {
                const vendor = this.findBestVendor(model.ID);
                if (vendor) {
                    return {
                        prompt,
                        modelInfo: {
                            ModelID: model.ID,
                            VendorID: vendor.VendorID,
                            DriverClass: vendor.DriverClass,
                            APIName: vendor.APIName ?? model.APIName ?? model.Name,
                        }
                    };
                }
            }
        }

        // Use prompt's model configuration if available
        if (prompt) {
            const promptModels = aiEngine.PromptModels
                .filter(pm => pm.PromptID === prompt!.ID)
                .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

            for (const pm of promptModels) {
                // Look up model vendor to get driver class
                const vendor = this.findBestVendor(pm.ModelID);
                if (vendor) {
                    return {
                        prompt,
                        modelInfo: {
                            ModelID: pm.ModelID,
                            VendorID: vendor.VendorID,
                            DriverClass: vendor.DriverClass,
                            APIName: vendor.APIName ?? '',
                        }
                    };
                }
            }
        }

        // Fallback: find smallest active embedding model
        const embeddingModels = aiEngine.Models.filter(m => {
            const modelType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
            return modelType === 'embeddings';
        });

        if (embeddingModels.length === 0) return { prompt, modelInfo: null };

        const sorted = [...embeddingModels].sort((a, b) =>
            (a.InputTokenLimit ?? Number.MAX_SAFE_INTEGER) - (b.InputTokenLimit ?? Number.MAX_SAFE_INTEGER)
        );

        for (const model of sorted) {
            const vendor = this.findBestVendor(model.ID);
            if (vendor) {
                return {
                    prompt,
                    modelInfo: {
                        ModelID: model.ID,
                        VendorID: vendor.VendorID,
                        DriverClass: vendor.DriverClass,
                        APIName: vendor.APIName ?? model.APIName ?? model.Name,
                    }
                };
            }
        }

        return { prompt, modelInfo: null };
    }

    private findBestVendor(modelID: string): { VendorID: string; DriverClass: string; APIName: string | null } | null {
        const aiEngine = AIEngineBase.Instance;
        const vendors = aiEngine.ModelVendors
            .filter(mv => mv.ModelID === modelID && mv.Status === 'Active' && mv.DriverClass != null)
            .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

        for (const v of vendors) {
            const apiKey = GetAIAPIKey(v.DriverClass!);
            if (apiKey) {
                return { VendorID: v.VendorID ?? '', DriverClass: v.DriverClass!, APIName: v.APIName };
            }
        }
        return null;
    }

    // ================================================================
    // Private: AIPromptRun CRUD
    // ================================================================

    private async createRunRecord(
        prompt: MJAIPromptEntityExtended | null,
        modelID: string,
        vendorID: string,
        params: EmbeddingRunParams,
        startTime: number
    ): Promise<MJAIPromptRunEntityExtended | null> {
        try {
            const md = this.Provider;
            const promptRun = await md.GetEntityObject<MJAIPromptRunEntityExtended>(
                'MJ: AI Prompt Runs', params.ContextUser
            );
            promptRun.NewRecord();

            if (prompt) {
                promptRun.PromptID = prompt.ID;
            }
            promptRun.ModelID = modelID;
            promptRun.VendorID = vendorID || null;
            promptRun.Status = 'Running';
            promptRun.RunAt = new Date(startTime);
            promptRun.Cancelled = false;
            promptRun.CacheHit = false;
            promptRun.StreamingEnabled = false;

            if (params.ParentRunID) {
                promptRun.ParentID = params.ParentRunID;
            }

            // Store description in Messages field as context
            if (params.Description) {
                promptRun.Messages = JSON.stringify({
                    description: params.Description,
                    textCount: params.Texts.length,
                    totalChars: params.Texts.reduce((sum, t) => sum + t.length, 0),
                });
            }

            // Fire-and-forget the initial 'Running' INSERT — ID is already assigned by NewRecord()
            // so the returned PromptRunID is valid immediately; the UPDATE chains after this.
            this._promptRunQueue.Insert(promptRun);
            return promptRun;
        } catch (error) {
            LogError(`AIModelRunner: Error creating AIPromptRun: ${error}`);
            return null;
        }
    }

    /**
     * Awaits all in-flight prompt-run saves queued by this runner. The normal path does NOT
     * call this — persistence is intentionally fire-and-forget. For tests / durability needs.
     */
    public async WaitForPendingPromptRunSaves(): Promise<void> {
        await this._promptRunQueue.Flush();
    }

    private async completeRunRecord(
        promptRun: MJAIPromptRunEntityExtended | null,
        embedResult: EmbedTextsResult,
        startTime: number
    ): Promise<void> {
        if (!promptRun) return;
        try {
            promptRun.Status = 'Completed';
            promptRun.Success = true;
            promptRun.CompletedAt = new Date();
            promptRun.ExecutionTimeMS = Date.now() - startTime;

            // Store token/cost from ModelUsage
            if (embedResult.ModelUsage) {
                // TokensPrompt = UNCACHED ("net-new") input; cache reads/writes tracked separately.
                // TokensUsed = totalTokens = promptTokens + completionTokens (EXCLUDES cache), to
                // satisfy the AIPromptRun invariant TokensUsed === TokensPrompt + TokensCompletion.
                // (Embeddings don't cache, so cache buckets are 0 here regardless.)
                promptRun.TokensPrompt = embedResult.ModelUsage.promptTokens ?? 0;
                promptRun.TokensCompletion = embedResult.ModelUsage.completionTokens ?? 0;
                promptRun.TokensUsed = embedResult.ModelUsage.totalTokens ?? 0;
                promptRun.TokensCacheRead = embedResult.ModelUsage.cacheReadTokens ?? 0;
                promptRun.TokensCacheWrite = embedResult.ModelUsage.cacheWriteTokens ?? 0;
                promptRun.Cost = embedResult.ModelUsage.cost ?? 0;
                promptRun.CostCurrency = embedResult.ModelUsage.costCurrency ?? 'USD';
                promptRun.QueueTime = embedResult.ModelUsage.queueTime ?? 0;
                promptRun.PromptTime = embedResult.ModelUsage.promptTime ?? 0;
                promptRun.CompletionTime = embedResult.ModelUsage.completionTime ?? 0;
            }

            // Store vector count in Result
            promptRun.Result = JSON.stringify({
                vectorCount: embedResult.vectors?.length ?? 0,
                dimensions: embedResult.vectors?.[0]?.length ?? 0,
            });

            this._promptRunQueue.Update(promptRun); // fire-and-forget UPDATE; the INSERT landed during the embedding call
        } catch (error) {
            LogError(`AIModelRunner: Error completing AIPromptRun: ${error}`);
        }
    }

    private async failRunRecord(
        promptRun: MJAIPromptRunEntityExtended | null,
        errorMessage: string,
        startTime: number
    ): Promise<void> {
        if (!promptRun) return;
        try {
            promptRun.Status = 'Failed';
            promptRun.Success = false;
            promptRun.ErrorMessage = errorMessage;
            promptRun.CompletedAt = new Date();
            promptRun.ExecutionTimeMS = Date.now() - startTime;
            this._promptRunQueue.Update(promptRun); // fire-and-forget UPDATE; the INSERT landed during the embedding call
        } catch (error) {
            LogError(`AIModelRunner: Error failing AIPromptRun: ${error}`);
        }
    }

    // ================================================================
    // Private: Helpers
    // ================================================================

    private errorResult(message: string, startTime: number): EmbeddingRunResult {
        return {
            Success: false,
            Vectors: [],
            PromptRunID: null,
            TokensUsed: 0,
            Cost: 0,
            ErrorMessage: message,
            ExecutionTimeMs: Date.now() - startTime,
        };
    }
}
