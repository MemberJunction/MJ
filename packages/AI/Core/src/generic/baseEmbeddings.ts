import { FileCapabilities } from './baseLLM';
import { BaseModel, ModelUsage } from './baseModel';
import { AbortableDelay, CreateCancellationError, IsRequestAborted, ThrowIfAborted } from './cancellation';
import { ChatMessageContent, ChatMessageContentBlock } from './chat.types';
import { EmbedContentParams, EmbedContentResult, EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from './embed.types';
import { AIErrorInfo } from './errorTypes';

/** An embedding model's output widths, as a driver's {@link BaseEmbeddings.EmbeddingModels} table lists it. */
export interface EmbeddingModelInfo {
    Model: string;
    Description: string;
    /** The width of the vectors the model produces when no `dimensions` is requested. */
    OutputDimension: number;
    /**
     * Whether the model accepts a `dimensions` request parameter. A model that doesn't (OpenAI's
     * text-embedding-ada-002, Bedrock's Titan Embed Text V1) has one width and rejects the parameter,
     * even when the requested width is its own.
     */
    AcceptsDimensions: boolean;
    /**
     * The widths a model that accepts `dimensions` can produce. Omitted, it can produce any width from
     * 1 to {@link OutputDimension} (OpenAI's text-embedding-3 models).
     */
    SupportedDimensions?: readonly number[];
}

/**
 * Thrown before any API call when a driver's model table says the model can't produce the requested
 * width. The request would fail (or return vectors of the wrong width) on every vendor of that model,
 * so the error carries a non-retriable classification that {@link ErrorAnalyzer} passes through.
 */
export class EmbeddingDimensionsError extends Error {
    public readonly errorInfo: AIErrorInfo;

    constructor(model: string, requested: number, supported: string) {
        super(`Embedding model '${model}' can't produce ${requested}-dimension vectors; it supports ${supported}.`);
        this.name = 'EmbeddingDimensionsError';
        this.errorInfo = { errorType: 'InvalidRequest', severity: 'Fatal', canFailover: false, error: this };
    }
}

/**
 * Base class for all embedding model implementations
 */
export abstract class BaseEmbeddings extends BaseModel {
    /**
     * Protected property to store additional provider-specific settings
     */
    protected _additionalSettings: Record<string, any> = {};

    /**
     * Get the current additional settings
     */
    public get AdditionalSettings(): Record<string, any> {
        return this._additionalSettings;
    }

    /**
     * Declares which non-text mime types this provider's embedding model can embed.
     * null = text-only (the default). Multimodal providers override this.
     * Mirrors BaseLLM.GetFileCapabilities().
     */
    public GetFileCapabilities(): FileCapabilities | null {
        return null;
    }

    /**
     * Throws if `content` contains a media block whose mime type the model can't embed.
     * Text-only content always passes. Called by multimodal providers at the top of EmbedContent.
     */
    protected ValidateContentSupported(content: ChatMessageContent): void {
        if (typeof content === 'string') {
            return;
        }
        const caps = this.GetFileCapabilities();
        for (const block of content) {
            if (block.type === 'text') {
                continue;
            }
            const mime = this.resolveBlockMimeType(block);
            if (!caps || !this.mimeTypeSupported(mime, caps)) {
                throw new Error(
                    `${this.constructor.name} cannot embed content of type '${mime ?? block.type}'. ` +
                        `Supported: ${caps?.SupportedMimeTypes.join(', ') ?? 'text only'}.`,
                );
            }
        }
    }

    /** Resolve a block's effective mime: explicit field → data-URL prefix → type-based default. */
    private resolveBlockMimeType(block: ChatMessageContentBlock): string | undefined {
        if (block.mimeType) {
            return block.mimeType.toLowerCase();
        }
        const dataUrl = block.content.match(/^data:([^;]+);base64,/);
        if (dataUrl) {
            return dataUrl[1].toLowerCase();
        }
        return undefined;
    }

    /** Wildcard-aware mime match (e.g. 'image/*'), same semantics as ResolveFileInputStrategy. */
    private mimeTypeSupported(mime: string | undefined, caps: FileCapabilities): boolean {
        if (!mime) {
            return false;
        }
        return caps.SupportedMimeTypes.some((pattern) => {
            const p = pattern.toLowerCase();
            return p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) : mime === p;
        });
    }

    /**
     * Set additional provider-specific settings
     * Subclasses should override this method to validate required settings
     *
     * @param settings Provider-specific settings
     */
    public SetAdditionalSettings(settings: Record<string, any>): void {
        this._additionalSettings = { ...this._additionalSettings, ...settings };
    }

    /**
     * Clear all additional settings
     * This is useful for resetting the state of the provider
     * or when switching between different configurations.
     */
    public ClearAdditionalSettings(): void {
        this._additionalSettings = {};
    }

    /**
     * Embeds a SINGLE text into one vector.
     *
     * ERROR CONVENTION — note the deliberate asymmetry with {@link EmbedTexts}: on failure a provider
     * returns an empty `vector: []` here (a single-item soft failure the caller inspects directly).
     * The batch {@link EmbedTexts} is stricter and ALL-OR-NOTHING — one failed item collapses the whole
     * result to `vectors: []` rather than returning a partially-filled array — because its consumers pair
     * `vectors[i] ↔ records[i]` by index and a stray empty slot is silent corruption. The one case that
     * THROWS instead of degrading is a structural collapse (vector count ≠ text count); see {@link EmbedTexts}.
     */
    public abstract EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>;
    public abstract GetEmbeddingModels(): Promise<any>;

    /**
     * The driver's known embedding models and their widths. Empty by default: a driver with no table
     * forwards `dimensions` as it is given. Used by {@link DimensionsParam}.
     */
    protected get EmbeddingModels(): readonly EmbeddingModelInfo[] {
        return [];
    }

    /**
     * The `dimensions` request parameter for a call to `model`, or none.
     *
     * Callers pass the vector index's `Dimensions` on every call, and MJ stamps one on every index it
     * creates, so a model with a single width is asked for it too. For a model in
     * {@link EmbeddingModels}:
     * - a model that rejects the parameter is sent nothing when the requested width is its own,
     *   which is what it produces anyway;
     * - a width the model can't produce throws {@link EmbeddingDimensionsError} before any (paid)
     *   API call. Call this outside the driver's try/catch so the error isn't degraded to an empty
     *   result.
     *
     * A model not in the table gets the width as requested.
     */
    protected DimensionsParam(model: string, dimensions?: number): { dimensions?: number } {
        if (!dimensions) {
            return {};
        }
        const info = this.EmbeddingModels.find((m) => m.Model === model);
        if (!info) {
            return { dimensions };
        }
        if (!info.AcceptsDimensions) {
            if (dimensions !== info.OutputDimension) {
                throw new EmbeddingDimensionsError(model, dimensions, `only ${info.OutputDimension}`);
            }
            return {};
        }
        if (info.SupportedDimensions) {
            if (!info.SupportedDimensions.includes(dimensions)) {
                throw new EmbeddingDimensionsError(model, dimensions, info.SupportedDimensions.join(', '));
            }
        } else if (dimensions < 1 || dimensions > info.OutputDimension) {
            throw new EmbeddingDimensionsError(model, dimensions, `1 to ${info.OutputDimension}`);
        }
        return { dimensions };
    }

    /**
     * Whether this provider's embedding model has a NATIVE batch endpoint that returns one vector
     * per input in a single request. Defaults to `false`. Providers that pass an array of texts
     * straight to their API (e.g. OpenAI, Azure, Cohere, Mistral) override this to return `true`
     * and implement {@link embedBatch}. Providers without one inherit the safe per-text default below.
     */
    public get SupportsBatchEmbeddings(): boolean {
        return false;
    }

    /**
     * Whether this provider needs an API key to run. Defaults to `true`, because most embedding
     * providers call a hosted API. A provider that runs in-process or against a local server (e.g.
     * `LocalEmbedding`, which runs ONNX models in-process) overrides this to return `false`, so a
     * caller that checks credentials before a call (such as `AIEmbeddingRunner`) does not reject it
     * for having no key. Mirrors `VectorDBBase.RequiresAPIKey`.
     */
    public get RequiresAPIKey(): boolean {
        return true;
    }

    /**
     * Max in-flight `EmbedText` calls for the default (non-batch) path. Override to tune.
     *
     * Only the per-text fallback is throttled this way — the native {@link embedBatch} path sends all
     * texts in ONE request, so there is nothing to bound. That asymmetry is intentional: N small calls
     * need a concurrency ceiling; a single batched call does not.
     */
    protected get maxEmbedTextsConcurrency(): number {
        return 4;
    }

    /**
     * Extra retry attempts per text on the default (non-batch) path, on top of the initial attempt.
     * `0` disables retry. Retrying each text a few times before giving up stops one transient 429/500
     * from failing the whole batch (whose failure rate otherwise scales with the text count N).
     */
    protected get maxEmbedTextsRetries(): number {
        return 2;
    }

    /** Base delay (ms) for exponential backoff between per-text retries: delay = base * 2^(n-1). */
    protected get embedRetryBaseDelayMs(): number {
        return 250;
    }

    /**
     * Embeds an array of texts, returning exactly ONE vector per input text, in input order.
     *
     * DISPATCHES on {@link SupportsBatchEmbeddings}: providers with a native batch endpoint set it to
     * `true` and implement {@link embedBatch}; everyone else gets the safe per-text fallback in
     * {@link embedPerText}. (A provider may still override this method directly for fully custom
     * behavior.)
     *
     * Whichever path runs, the result is hard-asserted to be 1:1 with the inputs (an intentional
     * empty result — the per-text graceful-degrade — is allowed): a native `embedBatch` that drops
     * or reorders vectors, or any other collapse, throws here rather than letting a misaligned array
     * reach index-based consumers (e.g. EntityVectorSyncer).
     *
     * CANCELLATION: once `params.CancellationToken` fires, no further batch or text is sent and this
     * throws a cancellation error (see `CreateCancellationError`) instead of degrading to an empty
     * result, since an empty result would read as a model failure. An aborted text is never retried.
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        ThrowIfAborted(params.CancellationToken, this.constructor.name);
        const result = this.SupportsBatchEmbeddings ? await this.embedBatch(params) : await this.embedPerText(params);
        const expected = (params.texts ?? []).length;
        if (expected > 0 && result.vectors.length !== 0 && result.vectors.length !== expected) {
            throw new Error(
                `${this.constructor.name}.EmbedTexts produced ${result.vectors.length} vector(s) for ${expected} ` +
                    `input text(s); expected a 1:1 match. Refusing to return a misaligned embedding batch.`,
            );
        }
        return result;
    }

    /**
     * Native batch path. A provider that returns `SupportsBatchEmbeddings = true` MUST override this
     * with a single batched API call returning one vector per input. The default throws so the flag
     * and the implementation can't drift apart (claim batch ⇒ must implement it).
     */
    protected embedBatch(_params: EmbedTextsParams): Promise<EmbedTextsResult> {
        throw new Error(
            `${this.constructor.name} returns SupportsBatchEmbeddings = true but does not implement embedBatch(). ` +
                `Override embedBatch() with the provider's native batch call, or return false to use the per-text default.`,
        );
    }

    /**
     * Default (non-batch) path: fans out one {@link EmbedText} call per text with bounded concurrency,
     * preserving order. The 1:1 vector/text count is enforced by the dispatcher ({@link EmbedTexts}).
     *
     * Each text is first retried with bounded exponential backoff ({@link retryEmbedText}) so a lone
     * transient failure doesn't sink the batch; only a text that STILL fails after its retries counts
     * as failed.
     *
     * ERROR CONTRACT (deliberate — change here if a different policy is wanted): mirrors the
     * per-provider Gemini fix. On any other per-text failure that survives retry (EmbedText throws OR
     * yields an empty vector) we return an EMPTY result rather than throwing, so batch pipelines that
     * don't wrap EmbedTexts (e.g. EntityVectorSyncer) degrade gracefully instead of aborting. Two
     * failures are the exception and are rethrown: an aborted request (cancelled or timed out, see
     * {@link EmbedTexts}), and an {@link EmbeddingDimensionsError}, which is a configuration error no
     * retry or failover can resolve (see {@link DimensionsParam}). To
     * make it fully fail-loud instead, replace the two `emptyEmbedTextsResult(...)` returns below with
     * `throw`.
     */
    protected async embedPerText(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const { texts, ...rest } = params;
        const items = texts ?? [];
        const signal = params.CancellationToken;

        let results: EmbedTextResult[];
        try {
            results = await this.runWithConcurrency(
                items,
                (text) => {
                    // Checked before each text, so a cancelled batch issues no further calls.
                    ThrowIfAborted(signal, this.constructor.name);
                    return this.retryEmbedText(() => this.EmbedText({ ...rest, text }), signal);
                },
                this.maxEmbedTextsConcurrency,
            );
        } catch (error) {
            // A cancellation is the caller's decision, not a failed text: it is thrown, not degraded.
            this.ThrowIfRequestAborted(error, signal);
            // A refused width is the other exception: degrading it to an empty result is exactly what
            // the refusal replaces, since the runner reads that as a retriable "No vectors returned"
            // and fails over to a vendor that refuses it the same way.
            if (error instanceof EmbeddingDimensionsError) {
                throw error;
            }
            // Graceful degrade (see error contract above) — but never silently: log why it failed.
            console.error(`${this.constructor.name}.EmbedTexts: per-text embedding failed:`, error);
            return this.emptyEmbedTextsResult(params.model);
        }

        // An empty/missing vector means that text failed; refuse to return a partially-corrupt batch
        // (downstream pairs vectors to records by index, so a stray empty vector is silent corruption).
        if (items.length > 0 && results.some((r) => !r.vector || r.vector.length === 0)) {
            return this.emptyEmbedTextsResult(params.model);
        }

        const promptTokens = results.reduce((sum, r) => sum + (r.ModelUsage?.promptTokens ?? 0), 0);
        const completionTokens = results.reduce((sum, r) => sum + (r.ModelUsage?.completionTokens ?? 0), 0);
        return {
            object: 'list',
            model: results[0]?.model ?? params.model ?? '',
            ModelUsage: new ModelUsage(promptTokens, completionTokens),
            vectors: results.map((r) => r.vector),
        };
    }

    /** Empty `EmbedTextsResult` returned by the default `EmbedTexts` when an item fails (graceful degrade). */
    private emptyEmbedTextsResult(model: string | null | undefined): EmbedTextsResult {
        return { object: 'list', model: model ?? '', ModelUsage: new ModelUsage(0, 0), vectors: [] };
    }

    /**
     * Runs `fn` over `items` with at most `maxConcurrency` in flight at once, preserving order.
     * The per-item `await` inside each worker is what bounds concurrency; parallelism comes from
     * running up to `maxConcurrency` workers at the same time.
     */
    protected async runWithConcurrency<T>(
        items: string[],
        fn: (item: string, index: number) => Promise<T>,
        maxConcurrency: number,
    ): Promise<T[]> {
        const out: T[] = new Array<T>(items.length);
        let nextIndex = 0;
        let failed = false;
        const worker = async (): Promise<void> => {
            // Stop claiming new items once any worker has thrown, so we don't keep issuing
            // (paid) calls after the operation is already doomed to reject.
            for (let index = nextIndex++; !failed && index < items.length; index = nextIndex++) {
                try {
                    out[index] = await fn(items[index], index);
                } catch (error) {
                    failed = true;
                    throw error;
                }
            }
        };
        // Always run at least one worker when there's work, so a non-positive cap can't leave
        // items unprocessed (which would yield a sparse, guard-bypassing result array).
        const workerCount = items.length === 0 ? 0 : Math.max(1, Math.min(maxConcurrency, items.length));
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        return out;
    }

    /**
     * Runs a single-text embed `attempt` with bounded exponential-backoff retry. A transient failure —
     * `attempt` throws, or returns an empty/missing vector — is retried up to {@link maxEmbedTextsRetries}
     * times, sleeping {@link embedRetryBaseDelayMs} * 2^(n-1) between tries. Returns the first successful
     * result; after the final attempt returns whatever it produced (or rethrows its error) so the caller's
     * existing empty-vector / throw handling still applies. This is what keeps one transient 429/500 from
     * failing the whole batch.
     *
     * An aborted `signal` ends the retries: no attempt starts once it has fired, the backoff wait
     * rejects as soon as it fires, and a failure caused by an abort is rethrown rather than retried.
     */
    protected async retryEmbedText(attempt: () => Promise<EmbedTextResult>, signal?: AbortSignal): Promise<EmbedTextResult> {
        let lastError: unknown;
        for (let n = 0; n <= this.maxEmbedTextsRetries; n++) {
            ThrowIfAborted(signal, this.constructor.name);
            if (n > 0) {
                await this.sleep(this.embedRetryBaseDelayMs * 2 ** (n - 1), signal);
            }
            try {
                const result = await attempt();
                const failed = !result.vector || result.vector.length === 0;
                if (failed && n < this.maxEmbedTextsRetries) {
                    continue; // transient empty vector — back off and retry
                }
                return result; // success, or the final empty result after exhausting retries
            } catch (error) {
                lastError = error;
                // A refused width is a configuration error: every attempt reaches the same answer,
                // so retrying it only sleeps through the backoff first.
                if (n >= this.maxEmbedTextsRetries || IsRequestAborted(error, signal) || error instanceof EmbeddingDimensionsError) {
                    throw error; // out of retries — let the caller's catch degrade the batch
                }
            }
        }
        // Unreachable: the loop always returns or throws. Present to satisfy the type checker.
        throw lastError instanceof Error ? lastError : new Error('retryEmbedText exhausted without a result');
    }

    /**
     * Sleep helper for retry backoff, isolated so tests can override `embedRetryBaseDelayMs` to avoid
     * real delays. Rejects with a cancellation error as soon as `signal` fires.
     */
    protected sleep(ms: number, signal?: AbortSignal): Promise<void> {
        return AbortableDelay(ms, signal);
    }

    /**
     * Rethrows a failure caused by an aborted request as a cancellation error: one classified
     * `Cancelled` (never retried or failed over), or a retriable `NetworkError` when the signal was
     * aborted by a timeout. Does nothing for any other failure. A driver that catches its SDK's
     * errors calls this first, so an abort is reported as such instead of as an empty result.
     *
     * @param error The error the request failed with.
     * @param signal The request's `CancellationToken`.
     */
    protected ThrowIfRequestAborted(error: unknown, signal?: AbortSignal | null): void {
        if (IsRequestAborted(error, signal)) {
            throw CreateCancellationError({ signal, provider: this.constructor.name });
        }
    }

    /**
     * Embeds text and/or interleaved media content into a single fused vector.
     *
     * Default behavior: text-only content is delegated to EmbedText;
     * if any non-text block is present, throws — because the base provider can't embed media.
     * Multimodal providers (e.g. GeminiEmbedding) should override this method.
     */
    public async EmbedContent(params: EmbedContentParams): Promise<EmbedContentResult> {
        // Base (text-only) behavior: reject unsupported media via ValidateContentSupported — caps are
        // null here, so any non-text block throws — then flatten text blocks and delegate to EmbedText.
        ThrowIfAborted(params.CancellationToken, this.constructor.name);
        this.ValidateContentSupported(params.content);
        const content = params.content;
        const text = typeof content === 'string' ? content : content.map((block: ChatMessageContentBlock) => block.content).join('\n');
        return this.EmbedText({ ...params, text });
    }
}

/**
 * @deprecated Use BaseEmbeddings instead - will be removed in a future release
 */
export abstract class Embeddings extends BaseEmbeddings {}
