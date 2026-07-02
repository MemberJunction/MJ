import { FileCapabilities } from './baseLLM';
import { BaseModel, ModelUsage } from './baseModel';
import { ChatMessageContent, ChatMessageContentBlock } from './chat.types';
import { EmbedContentParams, EmbedContentResult, EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from './embed.types';

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
     * Whether this provider's embedding model has a NATIVE batch endpoint that returns one vector
     * per input in a single request. Defaults to `false`. Providers that pass an array of texts
     * straight to their API (e.g. OpenAI, Azure, Cohere, Mistral) override this to return `true`
     * and implement {@link embedBatch}. Providers without one inherit the safe per-text default below.
     */
    public get SupportsBatchEmbeddings(): boolean {
        return false;
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
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
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
     * per-provider Gemini fix. On ANY per-text failure that survives retry (EmbedText throws OR yields
     * an empty vector) we return an EMPTY result rather than throwing, so batch pipelines that don't
     * wrap EmbedTexts (e.g. EntityVectorSyncer) degrade gracefully instead of aborting. To make it
     * fully fail-loud instead, replace the two `emptyEmbedTextsResult(...)` returns below with `throw`.
     */
    protected async embedPerText(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const { texts, ...rest } = params;
        const items = texts ?? [];

        let results: EmbedTextResult[];
        try {
            results = await this.runWithConcurrency(
                items,
                (text) => this.retryEmbedText(() => this.EmbedText({ ...rest, text })),
                this.maxEmbedTextsConcurrency,
            );
        } catch (error) {
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
     */
    protected async retryEmbedText(attempt: () => Promise<EmbedTextResult>): Promise<EmbedTextResult> {
        let lastError: unknown;
        for (let n = 0; n <= this.maxEmbedTextsRetries; n++) {
            if (n > 0) {
                await this.sleep(this.embedRetryBaseDelayMs * 2 ** (n - 1));
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
                if (n >= this.maxEmbedTextsRetries) {
                    throw error; // out of retries — let the caller's catch degrade the batch
                }
            }
        }
        // Unreachable: the loop always returns or throws. Present to satisfy the type checker.
        throw lastError instanceof Error ? lastError : new Error('retryEmbedText exhausted without a result');
    }

    /** Sleep helper for retry backoff, isolated so tests can override `embedRetryBaseDelayMs` to avoid real delays. */
    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
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
