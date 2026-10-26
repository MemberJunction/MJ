import { RegisterClass } from '@memberjunction/global';
import { BaseReranker, RerankParams, RerankResult } from '@memberjunction/ai';
import { CohereClient } from 'cohere-ai';

/**
 * A focused passage span returned by Cohere Rerank 5 Context Focus (`relevant_spans`).
 */
export interface CohereRelevantSpan {
    /** 0-based inclusive start character offset in the source document text */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    start: number;
    /** 0-based exclusive end character offset in the source document text */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    end: number;
    /** Calibrated relevance score (0.0-1.0) for this specific span */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    score: number;
    /** Extracted substring from the document text (`document.text.slice(start, end)`) */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    text: string;
}

/**
 * Configuration for Cohere Rerank 5 Context Focus (`relevant_spans` on `/v2/rerank`).
 */
export interface CohereRelevantSpansConfig {
    /** Enable or disable Context Focus span extraction */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    mode: 'enabled' | 'disabled';
    /** Minimum score threshold for returned spans (0.0-1.0) */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    threshold?: number;
    /** Maximum number of spans to return per document */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    max_spans?: number;
    /** CamelCase alias for `max_spans` */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    maxSpans?: number;
}

/**
 * Provider-specific options accepted in `RerankParams.options` by `CohereReranker`.
 */
export interface CohereRerankOptions {
    /**
     * Enable Cohere Rerank 5 Context Focus (`relevant_spans`) on `/v2/rerank`.
     * Pass `true` for `{ mode: 'enabled' }` or a `CohereRelevantSpansConfig` object.
     */
    // case-violation-ok-legacy-back-compat: matches RerankParams.options and Cohere v2 SDK keys
    relevantSpans?: boolean | CohereRelevantSpansConfig;
    /** Snake-case alias for `relevantSpans` matching Cohere's `/v2/rerank` payload */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    relevant_spans?: boolean | CohereRelevantSpansConfig;
    /** Alias for `relevantSpans` */
    // case-violation-ok-legacy-back-compat: matches RerankParams.options convention
    contextFocus?: boolean | CohereRelevantSpansConfig;
    /** Maximum tokens per document (`maxTokensPerDoc`) */
    // case-violation-ok-legacy-back-compat: matches Cohere SDK rerank request option
    maxTokensPerDoc?: number;
}

interface RawCohereSpan {
    start: number;
    end: number;
    score: number;
}

interface RawCohereRerankResultItem {
    index: number;
    relevanceScore: number;
    relevant_spans?: RawCohereSpan[];
    relevantSpans?: RawCohereSpan[];
}

/**
 * Normalize a caller-provided Context Focus option into Cohere's `/v2/rerank` `relevant_spans` payload.
 */
export function NormalizeCohereRelevantSpans(
    options?: Record<string, unknown>
): { mode: 'enabled' | 'disabled'; threshold?: number; max_spans?: number } | undefined {
    if (!options) {
        return undefined;
    }
    const raw = (options.relevant_spans ?? options.relevantSpans ?? options.contextFocus) as
        | boolean
        | CohereRelevantSpansConfig
        | undefined;
    if (raw === undefined || raw === false) {
        return undefined;
    }
    if (raw === true) {
        return { mode: 'enabled' };
    }
    if (typeof raw === 'object' && raw !== null) {
        const mode = raw.mode ?? 'enabled';
        if (mode !== 'enabled') {
            return { mode: 'disabled' };
        }
        const normalized: { mode: 'enabled'; threshold?: number; max_spans?: number } = { mode: 'enabled' };
        if (typeof raw.threshold === 'number' && Number.isFinite(raw.threshold)) {
            normalized.threshold = raw.threshold;
        }
        const maxSpans = raw.max_spans ?? raw.maxSpans;
        if (typeof maxSpans === 'number' && Number.isFinite(maxSpans) && maxSpans > 0) {
            normalized.max_spans = maxSpans;
        }
        return normalized;
    }
    return undefined;
}

/**
 * Cohere implementation of the BaseReranker class.
 * Uses Cohere's Rerank API for semantic document reranking. A request's `CancellationToken` is
 * handed to the SDK as its `abortSignal`, so cancelling it tears the HTTP request down.
 *
 * Supported models:
 * - rerank-v5.0-pro: Flagship cross-encoder reranker (~2B params, 32K context, 100+ languages, Context Focus)
 * - rerank-v5.0-fast: High-throughput cross-encoder reranker (~500M params, 32K context, 100+ languages, Context Focus)
 * - rerank-v4.0-pro: Previous-generation flagship reranker (32K context, 100+ languages)
 * - rerank-v4.0-fast: Previous-generation fast reranker (32K context, 100+ languages)
 * - rerank-v3.5: Legacy English reranker (4K context, deprecated upstream)
 * - rerank-multilingual-v3.0: Legacy multilingual reranker (4K context)
 *
 * Driver class:
 * Registered as both `CohereReranker` (the name the Cohere reranker models' model-vendor rows carry, and
 * so the one `AIRerankerRunner` and `RerankerService` resolve) and `CohereLLM`.
 *
 * API Key:
 * The legacy environment-variable fallback is named after the model-vendor row's driver class:
 * AI_VENDOR_API_KEY__COHERERERANKER for the shipped Cohere reranker models. A Cohere credential
 * binding takes precedence over it.
 */
// 'CohereReranker' is the DriverClass on every Cohere reranker model-vendor row; without it the
// ClassFactory falls back to a bare BaseReranker and every rerank fails. 'CohereLLM' is kept for
// callers that resolved it by that name.
@RegisterClass(BaseReranker, 'CohereReranker')
@RegisterClass(BaseReranker, 'CohereLLM')
export class CohereReranker extends BaseReranker {
    private _client: CohereClient;

    /**
     * Create a new CohereReranker instance.
     * @param apiKey - Cohere API key
     * @param modelName - Model to use (default: 'rerank-v3.5')
     */
    constructor(apiKey: string, modelName?: string) {
        super(apiKey, modelName || 'rerank-v3.5');
        // Use inherited protected apiKey getter from BaseModel
        this._client = new CohereClient({ token: this.apiKey });
    }

    /**
     * Rerank documents using Cohere's Rerank API.
     *
     * Passes `params.query` directly to Cohere without instruction wrapping (Cohere Rerank 5 is a
     * calibrated cross-encoder that does not support instructions that alter how relevance is judged).
     * When `relevantSpans` / `relevant_spans` / `contextFocus` is enabled in `params.options`, calls
     * `/v2/rerank` (`client.v2.rerank`) and attaches extracted `CohereRelevantSpan[]` onto
     * `document.metadata.relevantSpans`.
     */
    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const relevantSpansConfig = NormalizeCohereRelevantSpans(params.options);
        const maxTokensPerDoc = typeof params.options?.maxTokensPerDoc === 'number' && Number.isFinite(params.options.maxTokensPerDoc)
            ? params.options.maxTokensPerDoc
            : undefined;

        const responseResults = await this.executeCohereRerank(params, relevantSpansConfig, maxTokensPerDoc);

        const mapped: RerankResult[] = [];
        for (const result of responseResults) {
            const item = this.mapRerankResult(result, mapped.length, params);
            if (item) {
                mapped.push(item);
            }
        }
        return mapped;
    }

    /**
     * Dispatch the rerank call to `/v2/rerank` when Context Focus (`relevant_spans`) is enabled,
     * or `/v1/rerank` otherwise.
     */
    private async executeCohereRerank(
        params: RerankParams,
        relevantSpansConfig: ReturnType<typeof NormalizeCohereRelevantSpans>,
        maxTokensPerDoc: number | undefined
    ): Promise<RawCohereRerankResultItem[]> {
        const topN = params.topK || params.documents.length;
        const documentTexts = params.documents.map(d => d.text);
        const v2Client = (this._client as unknown as {
            v2?: {
                rerank?: (
                    req: Record<string, unknown>,
                    opts?: { abortSignal?: AbortSignal }
                ) => Promise<{ results: RawCohereRerankResultItem[] }>;
            };
        }).v2;

        if (relevantSpansConfig?.mode === 'enabled' && typeof v2Client?.rerank === 'function') {
            const v2Payload: Record<string, unknown> = {
                model: this._modelName,
                query: params.query,
                documents: documentTexts,
                topN,
                relevant_spans: relevantSpansConfig,
            };
            if (maxTokensPerDoc !== undefined) {
                v2Payload.maxTokensPerDoc = maxTokensPerDoc;
            }
            const response = await v2Client.rerank(v2Payload, { abortSignal: params.CancellationToken });
            return response.results;
        }

        const v1Payload: {
            model: string;
            query: string;
            documents: string[];
            topN: number;
            returnDocuments: boolean;
            maxTokensPerDoc?: number;
        } = {
            model: this._modelName,
            query: params.query,
            documents: documentTexts,
            topN,
            returnDocuments: false, // We track documents ourselves to preserve metadata
        };
        if (maxTokensPerDoc !== undefined) {
            v1Payload.maxTokensPerDoc = maxTokensPerDoc;
        }
        const response = await this._client.rerank(v1Payload, { abortSignal: params.CancellationToken });
        return response.results as RawCohereRerankResultItem[];
    }

    /**
     * Map a single Cohere API result item back to a MemberJunction `RerankResult`, attaching any
     * Context Focus `relevantSpans` onto `document.metadata.relevantSpans`.
     */
    private mapRerankResult(
        result: RawCohereRerankResultItem,
        rank: number,
        params: RerankParams
    ): RerankResult | null {
        const originalDoc = params.documents[result.index];
        if (!originalDoc) {
            return null;
        }
        const rawSpans = result.relevant_spans ?? result.relevantSpans;
        if (Array.isArray(rawSpans) && rawSpans.length > 0) {
            const extractedSpans = this.extractRelevantSpans(rawSpans, originalDoc.text);
            return {
                id: originalDoc.id,
                relevanceScore: result.relevanceScore,
                document: {
                    ...originalDoc,
                    metadata: {
                        ...originalDoc.metadata,
                        relevantSpans: extractedSpans,
                    },
                },
                rank,
            };
        }
        return {
            id: originalDoc.id,
            relevanceScore: result.relevanceScore,
            document: originalDoc,
            rank,
        };
    }

    /**
     * Slice each `[start, end)` span from the source document text with safe bounds clamping.
     */
    private extractRelevantSpans(rawSpans: RawCohereSpan[], sourceText: string): CohereRelevantSpan[] {
        return rawSpans.map(span => {
            const safeStart = Math.max(0, Math.min(span.start, sourceText.length));
            const safeEnd = Math.max(safeStart, Math.min(span.end, sourceText.length));
            return {
                start: span.start,
                end: span.end,
                score: span.score,
                text: sourceText.slice(safeStart, safeEnd),
            };
        });
    }
}

/**
 * Factory function to create a CohereReranker with default model.
 * Convenience function for simple usage.
 */
export function CreateCohereReranker(apiKey: string, modelName?: string): CohereReranker {
    return new CohereReranker(apiKey, modelName);
}

/** @deprecated Use {@link CreateCohereReranker}. */
export function createCohereReranker(apiKey: string, modelName?: string): CohereReranker {
    return CreateCohereReranker(apiKey, modelName);
}


