import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import type { PreTrainedModel, PreTrainedTokenizer, PretrainedConfig, Tensor } from "@huggingface/transformers";
import { availableParallelism } from "node:os";

/**
 * Whether verbose logging is enabled, mirroring the MJ_VERBOSE semantics used by
 * @memberjunction/core's IsVerboseLoggingEnabled(). Duplicated here as a tiny inline
 * check so this leaf AI provider doesn't take a dependency on @memberjunction/core
 * just to gate a couple of routine status messages. Routine load/progress messages
 * are suppressed by default so they don't garble CodeGen's spinner; errors/warnings
 * still print unconditionally.
 */
function isVerbose(): boolean {
    const v = process.env.MJ_VERBOSE;
    return v !== undefined && ['true', '1', 'yes'].includes(v.toLowerCase());
}

type TransformersModule = typeof import("@huggingface/transformers");

/** A loaded model: its tokenizer and ONNX model, shared by every call for that model ID. */
interface LoadedModel {
    tokenizer: PreTrainedTokenizer;
    model: PreTrainedModel;
}

/** The part of a feature-extraction model's output this driver reads. */
interface ModelOutput {
    last_hidden_state: Tensor;
}

/**
 * Most texts per ONNX call. One call per batch is ~6× faster than one call per text. The `Xenova/*`
 * models are dynamically quantized, so a vector depends slightly on its batch-mates (cosine ≥ 0.998
 * to the same text embedded alone); EmbeddingGemma 2 is unaffected.
 */
const BATCH_SIZE = 32;

/**
 * Most padded tokens per ONNX call (texts × the longest one). A batch is padded to its longest text,
 * so memory grows with both; this keeps 32 texts at 256 tokens in one call, while 8k-token documents
 * go one at a time. A text longer than the budget still goes, alone.
 */
const BATCH_TOKENS = 8192;

/**
 * ONNX precision. `q8` loads `onnx/model_quantized.onnx`, the same file `@xenova/transformers`'
 * `quantized: true` loaded, and is lossless for EmbeddingGemma 2 (cosine 0.99996 to fp32).
 */
const DTYPE = 'q8';

// Retry configuration for model downloads
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 30000;

let pendingCacheDir: string | undefined;
let transformersPromise: Promise<TransformersModule> | null = null;

/**
 * Delays execution for the specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, initialDelay: number, maxDelay: number): number {
    // Exponential backoff: initialDelay * 2^attempt
    const exponentialDelay = initialDelay * Math.pow(2, attempt);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delayWithJitter = exponentialDelay + jitter;
    // Cap at max delay
    return Math.min(delayWithJitter, maxDelay);
}

/**
 * Loads `@huggingface/transformers` once, on first use. This is a deferred import (category 3 in
 * `.claude/rules/typescript-style.md`): importing it costs ~80–150 ms and ~50 MB RSS (native
 * onnxruntime and sharp), and every process that loads the server class manifest imports this
 * module, whether or not it ever embeds locally. The package is still a declared dependency.
 * The promise is shared, so concurrent first calls import once.
 */
function loadTransformers(): Promise<TransformersModule> {
    transformersPromise ??= import("@huggingface/transformers").then(transformers => {
        transformers.env.allowLocalModels = true;
        transformers.env.cacheDir = pendingCacheDir ?? process.env.TRANSFORMERS_CACHE_DIR ?? './.cache/transformers';
        return transformers;
    });
    return transformersPromise;
}

/**
 * Drops the vision and audio encoder configs of a multimodal model (e.g. EmbeddingGemma 2) so only
 * the text session loads. EmbeddingGemma 2 at q8: 314 MB of text weights instead of 850 MB.
 * A text-only config has no such keys and is returned unchanged.
 */
function textOnly(config: PretrainedConfig): PretrainedConfig {
    const encoders = config as PretrainedConfig & { vision_config?: object | null; audio_config?: object | null };
    if (encoders.vision_config) encoders.vision_config = null;
    if (encoders.audio_config) encoders.audio_config = null;
    return config;
}

/**
 * Matryoshka truncation: keeps the leading `dimensions` values, then L2 re-normalizes, because a
 * slice of a unit vector is not unit length and cosine scores would drift silently.
 */
function truncateToDimensions(vector: number[], dimensions: number): number[] {
    if (dimensions === vector.length) {
        return vector;
    }
    if (dimensions > vector.length) {
        throw new Error(`Requested ${dimensions} dimensions, but the model produces ${vector.length}`);
    }
    const head = vector.slice(0, dimensions);
    const norm = Math.hypot(...head);
    return norm > 0 ? head.map(x => x / norm) : head;
}

@RegisterClass(BaseEmbeddings, 'LocalEmbedding')
export class LocalEmbedding extends BaseEmbeddings {
    private static models: Map<string, Promise<LoadedModel>> = new Map();

    constructor(apiKey?: string) {
        // Local embeddings don't require an API key
        super(apiKey || 'local');
    }

    /**
     * Runs ONNX models in-process, so it needs no API key. Lets credential checks (e.g.
     * `AIEmbeddingRunner`) accept a local model on an install with no
     * `AI_VENDOR_API_KEY__LocalEmbedding` set.
     */
    public override get RequiresAPIKey(): boolean {
        return false;
    }

    /** Batches go through {@link embedBatch}: one ONNX call per {@link BATCH_SIZE} texts or {@link BATCH_TOKENS} padded tokens. */
    public override get SupportsBatchEmbeddings(): boolean {
        return true;
    }

    /**
     * Get or start loading the model for a Hugging Face model ID (e.g. 'Xenova/all-MiniLM-L6-v2').
     * Concurrent callers share one load; a failed load is forgotten so the next call retries.
     */
    private getModel(modelId: string): Promise<LoadedModel> {
        let loading = LocalEmbedding.models.get(modelId);
        if (!loading) {
            loading = this.loadModel(modelId);
            LocalEmbedding.models.set(modelId, loading);
            const pending = loading;
            pending.catch(() => {
                if (LocalEmbedding.models.get(modelId) === pending) {
                    LocalEmbedding.models.delete(modelId);
                }
            });
        }
        return loading;
    }

    /**
     * Load a model with retry logic.
     * Uses exponential backoff to handle transient network failures when
     * downloading models from HuggingFace Hub on first startup.
     */
    private async loadModel(modelId: string): Promise<LoadedModel> {
        const { AutoConfig, AutoModel, AutoTokenizer } = await loadTransformers();
        const maxRetries = DEFAULT_MAX_RETRIES;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt === 0) {
                    // First attempt - let user know download may take time (verbose only)
                    if (isVerbose()) {
                        console.log(`Loading embedding model ${modelId} from HuggingFace (first-time download may take a moment)...`);
                    }
                } else {
                    const backoffDelay = calculateBackoffDelay(attempt - 1, DEFAULT_INITIAL_DELAY_MS, DEFAULT_MAX_DELAY_MS);
                    console.log(`  Retrying download (attempt ${attempt + 1}/${maxRetries})...`);
                    await delay(backoffDelay);
                }

                const config = textOnly(await AutoConfig.from_pretrained(modelId));
                // ONNX Runtime sizes its thread pool from the host's cores and ignores a container's CPU limit;
                // with 2 CPUs on an 18-core host that made EmbeddingGemma 2 queries 1.3 s instead of 0.1 s.
                // availableParallelism() honors cpusets and CPU quotas.
                const [tokenizer, model] = await Promise.all([
                    AutoTokenizer.from_pretrained(modelId),
                    AutoModel.from_pretrained(modelId, {
                        config, dtype: DTYPE, device: 'cpu', session_options: { intraOpNumThreads: availableParallelism() },
                    }),
                ]);

                if (attempt > 0) {
                    // Recovered after a retry — worth surfacing regardless of verbosity
                    console.log(`Successfully loaded model ${modelId} on attempt ${attempt + 1}`);
                } else if (isVerbose()) {
                    console.log(`Model ${modelId} loaded successfully`);
                }

                return { tokenizer, model };
            } catch (error) {
                lastError = error;

                // Check if this is a transient network error worth retrying
                const isTransientError = this.isTransientNetworkError(error);

                if (isTransientError && attempt < maxRetries - 1) {
                    // Brief message for transient errors - full details only on final failure
                    const briefReason = this.getBriefErrorReason(error);
                    console.warn(`  Connection issue: ${briefReason}`);
                    // Continue to next retry attempt
                } else {
                    // Final attempt or non-transient error - log full details
                    const errorInfo = ErrorAnalyzer.analyzeError(error, 'LocalEmbedding');
                    console.error(`Failed to load model ${modelId} after ${attempt + 1} attempt(s):`, errorInfo);
                    break;
                }
            }
        }

        // All retries exhausted
        const errorInfo = ErrorAnalyzer.analyzeError(lastError, 'LocalEmbedding');
        const errorMessage = typeof errorInfo === 'string'
            ? errorInfo
            : (errorInfo as { message?: string }).message || 'Unknown error';
        throw new Error(`Failed to load local embedding model ${modelId}: ${errorMessage}`);
    }

    /**
     * Determines if an error is a transient network error that should be retried.
     */
    private isTransientNetworkError(error: unknown): boolean {
        if (!error) return false;

        const errorObj = error as { cause?: { code?: string }; code?: string; message?: string };

        // Check for common transient error codes
        const transientCodes = [
            'UND_ERR_CONNECT_TIMEOUT',
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN',
            'EPIPE',
            'EHOSTUNREACH',
            'ENETUNREACH'
        ];

        const errorCode = errorObj.cause?.code || errorObj.code;
        if (errorCode && transientCodes.includes(errorCode)) {
            return true;
        }

        // Check error message for network-related keywords
        const errorMessage = errorObj.message?.toLowerCase() || '';
        const transientKeywords = ['timeout', 'network', 'connection', 'fetch failed', 'socket hang up'];
        if (transientKeywords.some(keyword => errorMessage.includes(keyword))) {
            return true;
        }

        return false;
    }

    /**
     * Returns a brief, user-friendly description of the error for retry logging.
     */
    private getBriefErrorReason(error: unknown): string {
        if (!error) return 'unknown error';

        const errorObj = error as { cause?: { code?: string; message?: string }; code?: string; message?: string };
        const errorCode = errorObj.cause?.code || errorObj.code;

        // Map error codes to friendly messages
        const codeMessages: Record<string, string> = {
            'UND_ERR_CONNECT_TIMEOUT': 'connection timeout',
            'ECONNRESET': 'connection reset',
            'ECONNREFUSED': 'connection refused',
            'ETIMEDOUT': 'request timeout',
            'ENOTFOUND': 'host not found',
            'EAI_AGAIN': 'DNS lookup timeout',
            'EHOSTUNREACH': 'host unreachable',
            'ENETUNREACH': 'network unreachable'
        };

        if (errorCode && codeMessages[errorCode]) {
            return codeMessages[errorCode];
        }

        // Fall back to error message
        if (errorObj.message) {
            return errorObj.message.substring(0, 50);
        }

        return 'network error';
    }

    /**
     * Embeds texts with mean pooling and L2 normalization, the same computation as the
     * transformers.js `feature-extraction` pipeline. The driver tokenizes itself so it can truncate
     * to `maxInputTokens`: the pipeline only truncates to the tokenizer's own limit, and some
     * tokenizers declare none (EmbeddingGemma 2's reads as 1e30, past its 8,192-token window).
     */
    private async embed(modelId: string, texts: string[], dimensions?: number, maxInputTokens?: number): Promise<{ vectors: number[][]; tokens: number }> {
        const { tokenizer, model } = await this.getModel(modelId);
        const { mean_pooling } = await loadTransformers();
        const vectors: number[][] = [];
        let tokens = 0;

        const lengths = texts.map(t => Math.min(tokenizer.encode(t).length, maxInputTokens ?? Infinity));
        for (let start = 0, end = 0; start < texts.length; start = end) {
            let longest = lengths[start];
            for (end = start + 1; end < texts.length && end - start < BATCH_SIZE; end++) {
                const next = Math.max(longest, lengths[end]);
                if (next * (end - start + 1) > BATCH_TOKENS) break;
                longest = next;
            }
            const inputs = tokenizer(texts.slice(start, end), { padding: true, truncation: true, max_length: maxInputTokens });
            const output: ModelOutput = await model(inputs);
            const pooled = mean_pooling(output.last_hidden_state, inputs.attention_mask).normalize(2, -1);
            vectors.push(...(pooled.tolist() as number[][]));
            tokens += Number(inputs.attention_mask.sum().item());
        }

        return { vectors: dimensions ? vectors.map(v => truncateToDimensions(v, dimensions)) : vectors, tokens };
    }

    private requireModel(model: string | undefined): string {
        if (!model) {
            throw new Error('Model name is required for LocalEmbedding provider');
        }
        return model;
    }

    /**
     * Embed a single text string
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const modelName = this.requireModel(params.model);
        try {
            const { vectors, tokens } = await this.embed(modelName, [params.text], params.dimensions, params.maxInputTokens);
            return { object: 'object', model: modelName, ModelUsage: new ModelUsage(tokens, 0), vector: vectors[0] };
        } catch (error) {
            // BaseEmbeddings error convention: a failed single embed returns an empty vector.
            console.error('Local embedding error:', ErrorAnalyzer.analyzeError(error, 'LocalEmbedding'));
            return { object: 'object', model: modelName, ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
    }

    /**
     * Native batch path behind {@link BaseEmbeddings.EmbedTexts}, which checks the result is 1:1
     * with the inputs.
     */
    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const modelName = this.requireModel(params.model);
        try {
            const { vectors, tokens } = await this.embed(modelName, params.texts, params.dimensions, params.maxInputTokens);
            return { object: 'list', model: modelName, ModelUsage: new ModelUsage(tokens, 0), vectors };
        } catch (error) {
            // BaseEmbeddings error convention: a failed batch returns no vectors at all.
            console.error('Local embedding error:', ErrorAnalyzer.analyzeError(error, 'LocalEmbedding'));
            return { object: 'list', model: modelName, ModelUsage: new ModelUsage(0, 0), vectors: [] };
        }
    }

    /**
     * Get available embedding models
     * Note: In production, this would be fetched from the database
     * through MemberJunction's AI framework
     */
    public async GetEmbeddingModels(): Promise<any> {
        // This method is typically not called directly when using MemberJunction
        // as the models are configured in the database
        return [];
    }

    /**
     * Accepts `cacheDir`, the model download directory. It applies when the runtime first loads,
     * so set it before the first embed.
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        super.SetAdditionalSettings(settings);
        if (settings.cacheDir) {
            pendingCacheDir = settings.cacheDir;
        }
    }

    /**
     * Clear loaded models to free memory
     */
    public ClearCache(): void {
        LocalEmbedding.models.clear();
        console.log('Cleared local embedding model cache');
    }

    /** @deprecated Use {@link ClearCache}. */
    public clearCache(): void {
        return this.ClearCache();
    }

    /**
     * Static method to clear the shared cache
     */
    public static ClearSharedCache(): void {
        LocalEmbedding.models.clear();
        console.log('Cleared shared local embedding model cache');
    }

    /** @deprecated Use {@link ClearSharedCache}. */
    public static clearSharedCache(): void {
        return this.ClearSharedCache();
    }

    /**
     * Preload a specific model for faster first inference
     */
    public async PreloadModel(modelName: string): Promise<void> {
        await this.getModel(modelName);
    }

    /** @deprecated Use {@link PreloadModel}. */
    public async preloadModel(modelName: string): Promise<void> {
        return this.PreloadModel(modelName);
    }
}
