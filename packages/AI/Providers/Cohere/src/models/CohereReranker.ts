import { RegisterClass } from '@memberjunction/global';
import { BaseReranker, RerankParams, RerankResult } from '@memberjunction/ai';
import { CohereClient } from 'cohere-ai';

/**
 * A passage span returned by Cohere Rerank 5 Context Focus: `[Start, End)` in Unicode code points
 * of the document text, its calibrated score, and the text it covers.
 */
export interface CohereRelevantSpan {
    Start: number;
    End: number;
    Score: number;
    Text: string;
}

/** Context Focus settings (Cohere's `relevant_spans`). Unset fields take Cohere's defaults. */
export interface CohereRelevantSpansOptions {
    /** Minimum span score, 0-1. */
    Threshold?: number;
    /** Maximum spans returned per document. */
    MaxSpans?: number;
}

/** Options `CohereReranker` reads from `RerankParams.options`. */
export interface CohereRerankOptions {
    /**
     * Ask Rerank 5 for Context Focus spans. Each result's spans land on
     * `document.metadata.RelevantSpans` as `CohereRelevantSpan[]`.
     */
    RelevantSpans?: boolean | CohereRelevantSpansOptions;
}

/** A result item as `/v2/rerank` returns it. `relevant_spans` is not in the SDK's type yet. */
type CohereRerankResultItem = {
    index: number;
    relevanceScore: number;
    relevant_spans?: Array<{ start: number; end: number; score: number }>;
};

/**
 * Cohere implementation of the BaseReranker class, on Cohere's `/v2/rerank`. A request's
 * `CancellationToken` is handed to the SDK as its `abortSignal`, so cancelling it tears the HTTP
 * request down. The query is sent as written: Rerank 5 is a calibrated cross-encoder and does not
 * take instructions that change how relevance is judged.
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
 * so the one `AIRerankerRunner`, `RerankerService` and SearchEngine's `CohereReRanker` resolve) and `CohereLLM`.
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
     * @param modelName - Model to use (default: 'rerank-v5.0-fast')
     */
    constructor(apiKey: string, modelName?: string) {
        super(apiKey, modelName || 'rerank-v5.0-fast');
        // Use inherited protected apiKey getter from BaseModel
        this._client = new CohereClient({ token: this.apiKey });
    }

    /**
     * Rerank documents with Cohere's `/v2/rerank`. With `RelevantSpans` set in `params.options`
     * (see {@link CohereRerankOptions}), each result carries its Context Focus spans on
     * `document.metadata.RelevantSpans`.
     */
    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const relevantSpans = toWireRelevantSpans((params.options as CohereRerankOptions | undefined)?.RelevantSpans);
        const request = {
            model: this._modelName,
            query: params.query,
            documents: params.documents.map(d => d.text),
            topN: params.topK || params.documents.length,
            // Not in the SDK's request type yet; its serializer passes the key through unchanged.
            ...(relevantSpans ? { relevant_spans: relevantSpans } : {}),
        };
        const response = await this._client.v2.rerank(request, { abortSignal: params.CancellationToken });

        const results: RerankResult[] = [];
        for (const item of response.results as CohereRerankResultItem[]) {
            const doc = params.documents[item.index];
            if (!doc) {
                continue;
            }
            const spans = item.relevant_spans?.length ? extractSpans(item.relevant_spans, doc.text) : undefined;
            results.push({
                id: doc.id,
                relevanceScore: item.relevanceScore,
                document: spans ? { ...doc, metadata: { ...doc.metadata, RelevantSpans: spans } } : doc,
                rank: results.length,
            });
        }
        return results;
    }
}

/** The `relevant_spans` request body for a `RelevantSpans` option, or undefined when it is off. */
function toWireRelevantSpans(
    option: CohereRerankOptions['RelevantSpans']
): { mode: 'enabled'; threshold?: number; max_spans?: number } | undefined {
    if (!option) {
        return undefined;
    }
    if (option === true) {
        return { mode: 'enabled' };
    }
    return { mode: 'enabled', threshold: option.Threshold, max_spans: option.MaxSpans };
}

/** Attach each span's text. Cohere's offsets count Unicode code points, not UTF-16 units. */
function extractSpans(spans: NonNullable<CohereRerankResultItem['relevant_spans']>, text: string): CohereRelevantSpan[] {
    const codePoints = Array.from(text);
    return spans.map(s => ({
        Start: s.start,
        End: s.end,
        Score: s.score,
        Text: codePoints.slice(Math.max(0, s.start), Math.max(0, s.end)).join(''),
    }));
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
