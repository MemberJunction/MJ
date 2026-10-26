/**
 * @fileoverview Cohere Rerank API integration (P2D.2 + Rerank 5 Context Focus).
 *
 * Wraps Cohere's Rerank 5 (`rerank-v5.0-fast`, `rerank-v5.0-pro`), Rerank 4
 * (`rerank-v4.0-fast`, `rerank-v4.0-pro`), `rerank-v3.5`, and
 * `rerank-multilingual-v3.0` endpoints for use as a SearchEngine re-ranker.
 *
 * Supports **Context Focus** (`relevant_spans` on `/v2/rerank` in Rerank 5): when
 * `config.contextFocus` (or `config.relevantSpans` / `config.relevant_spans`) is
 * enabled on `ScopeConfig.reRanker.config`, `CohereReRanker` requests passage-level
 * relevant spans from Cohere's v2 endpoint, attaches the scored spans to
 * `SearchResultItem.RelevantSpans`, and (unless `config.focusSnippet === false`) narrows
 * each item's `Snippet` to the matched spans so downstream RAG / LLM consumers
 * read less context while retaining answer quality.
 *
 * **Cost model.** Cohere bills per "search," where one search reranks up to 100
 * documents. Above 100 docs, larger requests count as multiple searches.
 * Pricing as of 2026-04: $2.00 per 1k searches → 0.2¢ / search.
 *
 * **API key resolution.** Checks `GetAIAPIKey('CohereReranker')` first (matching
 * `metadata/ai-models/.cohere-reranker-models.json` → `AI_VENDOR_API_KEY__COHERERERANKER`)
 * and falls back to `GetAIAPIKey('CohereLLM')` (`AI_VENDOR_API_KEY__COHERELLM`).
 *
 * **Optional peer dependency.** `cohere-ai` is declared in `optionalDependencies`
 * so SearchEngine consumers who don't use Cohere don't pay the bundle cost.
 * Loaded via a dynamic import per CLAUDE.md rule #8 case 2 (optional peer).
 *
 * @module @memberjunction/search-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import {
    BaseReranker as AIBaseReranker,
    RerankDocument,
    RerankParams,
    RerankResult,
    GetAIAPIKey,
} from '@memberjunction/ai';
import { BaseReRanker } from '../generic/BaseReRanker';
import { SearchResultItem } from '../generic/search.types';

/**
 * A passage span returned by Cohere Rerank 5 Context Focus (`relevant_spans`).
 */
export interface CohereSearchRelevantSpan {
    /** 0-based inclusive start character offset in the rerank input text */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    start: number;
    /** 0-based exclusive end character offset in the rerank input text */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    end: number;
    /** Calibrated relevance score (0.0-1.0) for this span */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    score: number;
    /** Extracted text slice from the rerank input text */
    // case-violation-ok-legacy-back-compat: mirrors Cohere v2 rerank relevant_spans wire payload
    text: string;
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
 * Memoized loader for the Cohere SDK. The dynamic import is the **single** approved
 * use of `import()` in this file (CLAUDE.md #8 case 2 — optional peer dep). Caching
 * the resolved client constructor avoids paying the dynamic import cost on every
 * Rerank call.
 */
let cohereClientCtorPromise: Promise<new (opts: { token: string }) => CohereClientLike> | null = null;
interface CohereClientLike {
    rerank(input: {
        model: string;
        query: string;
        documents: string[];
        topN: number;
        returnDocuments: boolean;
    }): Promise<{ results: RawCohereRerankResultItem[] }>;
    v2?: {
        rerank(input: Record<string, unknown>): Promise<{ results: RawCohereRerankResultItem[] }>;
    };
}

function normalizeRelevantSpansOption(
    options?: Record<string, unknown>
): { mode: 'enabled' | 'disabled'; threshold?: number; max_spans?: number } | undefined {
    if (!options) return undefined;
    const raw = options['relevant_spans'] ?? options['relevantSpans'] ?? options['contextFocus'];
    if (raw === undefined || raw === false) return undefined;
    if (raw === true) return { mode: 'enabled' };
    if (typeof raw === 'object' && raw !== null) {
        const cfg = raw as Record<string, unknown>;
        const mode = (cfg['mode'] as string | undefined) ?? 'enabled';
        if (mode !== 'enabled') return { mode: 'disabled' };
        const out: { mode: 'enabled'; threshold?: number; max_spans?: number } = { mode: 'enabled' };
        if (typeof cfg['threshold'] === 'number' && Number.isFinite(cfg['threshold'])) {
            out.threshold = cfg['threshold'];
        }
        const maxSpans = cfg['max_spans'] ?? cfg['maxSpans'];
        if (typeof maxSpans === 'number' && Number.isFinite(maxSpans) && maxSpans > 0) {
            out.max_spans = maxSpans;
        }
        return out;
    }
    return undefined;
}

async function getCohereClientCtor(): Promise<new (opts: { token: string }) => CohereClientLike> {
    if (!cohereClientCtorPromise) {
        cohereClientCtorPromise = (async () => {
            try {
                const mod = await import('cohere-ai');
                return mod.CohereClient as unknown as new (opts: { token: string }) => CohereClientLike;
            } catch (err) {
                throw new Error(
                    `CohereReRanker: 'cohere-ai' is not installed. Add it to your project's dependencies if you intend to use the Cohere reranker. Underlying error: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        })();
    }
    return cohereClientCtorPromise;
}

/**
 * Inline AI-layer reranker that calls Cohere's `rerank` (or `v2.rerank` when
 * Context Focus `relevant_spans` is enabled) endpoint with the raw query.
 */
class CohereScopeAIReranker extends AIBaseReranker {
    private _clientPromise: Promise<CohereClientLike>;

    constructor(apiKey: string, modelName: string) {
        super(apiKey, modelName);
        this._clientPromise = getCohereClientCtor().then(Ctor => new Ctor({ token: this.apiKey }));
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const client = await this._clientPromise;
        const responseResults = await this.executeSdkRerank(client, params);

        const mapped: RerankResult[] = [];
        for (const r of responseResults) {
            const item = this.mapSdkResult(r, mapped.length, params.documents);
            if (item) {
                mapped.push(item);
            }
        }
        return mapped;
    }

    private async executeSdkRerank(
        client: CohereClientLike,
        params: RerankParams
    ): Promise<RawCohereRerankResultItem[]> {
        const relevantSpans = normalizeRelevantSpansOption(params.options);
        const topN = params.topK ?? params.documents.length;
        const documentTexts = params.documents.map(d => d.text);

        if (relevantSpans?.mode === 'enabled' && typeof client.v2?.rerank === 'function') {
            const response = await client.v2.rerank({
                model: this._modelName,
                query: params.query,
                documents: documentTexts,
                topN,
                relevant_spans: relevantSpans,
            });
            return response.results;
        }

        const response = await client.rerank({
            model: this._modelName,
            query: params.query,
            documents: documentTexts,
            topN,
            returnDocuments: false,
        });
        return response.results;
    }

    private mapSdkResult(
        r: RawCohereRerankResultItem,
        rank: number,
        documents: RerankDocument[]
    ): RerankResult | null {
        const doc = documents[r.index];
        if (!doc) {
            return null;
        }
        const rawSpans = r.relevant_spans ?? r.relevantSpans;
        if (Array.isArray(rawSpans) && rawSpans.length > 0) {
            const spans: CohereSearchRelevantSpan[] = rawSpans.map(s => {
                const safeStart = Math.max(0, Math.min(s.start, doc.text.length));
                const safeEnd = Math.max(safeStart, Math.min(s.end, doc.text.length));
                return {
                    start: s.start,
                    end: s.end,
                    score: s.score,
                    text: doc.text.slice(safeStart, safeEnd),
                };
            });
            return {
                id: doc.id,
                relevanceScore: r.relevanceScore,
                document: {
                    ...doc,
                    metadata: {
                        ...doc.metadata,
                        __mjRelevantSpans: spans,
                    },
                },
                rank,
            };
        }
        return {
            id: doc.id,
            relevanceScore: r.relevanceScore,
            document: doc,
            rank,
        };
    }
}

/**
 * Cohere re-ranker for SearchEngine (defaults to `rerank-v5.0-fast`). Configured per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'CohereReRanker'`.
 *
 * Configuration keys in `ScopeConfig.reRanker.config`:
 * - `model`: Cohere model ID (`'rerank-v5.0-fast'`, `'rerank-v5.0-pro'`, `'rerank-v4.0-pro'`, `'rerank-v3.5'`, etc.)
 * - `contextFocus` / `relevantSpans` / `relevant_spans`: `true` or `{ mode: 'enabled', threshold?: number, max_spans?: number }`
 *   to extract passage-level spans via Cohere Rerank 5 Context Focus.
 * - `focusSnippet`: When Context Focus returns spans, whether to narrow `Snippet` to the matched spans (default: `true`).
 * - `minRelevanceThreshold`: Optional calibrated relevance score cutoff (0.0-1.0) to filter weak results.
 */
@RegisterClass(BaseReRanker, 'CohereReRanker')
export class CohereReRanker extends BaseReRanker {
    public get DriverClass(): string {
        return 'CohereReRanker';
    }
    public override get Name(): string {
        return 'Cohere';
    }
    public override get Version(): string {
        return '1';
    }

    /**
     * Cohere caps a single rerank call at 1000 documents. Above this, the SearchEngine
     * should chunk (not implemented yet — most realistic candidate lists are <100).
     */
    public override GetMaxResultCount(): number {
        return 1000;
    }

    /**
     * Cohere bills per "search". 1 search reranks up to 100 documents; above 100,
     * count as `ceil(N/100)` searches. As of 2026-04, $2.00 per 1k searches = 0.2¢
     * per search. Override via `config.cents_per_search` if Cohere's pricing changes.
     */
    public override EstimateCostCents(resultCount: number): number {
        const searches = Math.max(1, Math.ceil(resultCount / 100));
        return searches * 0.2;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        _contextUser: UserInfo,
    ): AIBaseReranker | null {
        const apiKey = GetAIAPIKey('CohereReranker') || GetAIAPIKey('CohereLLM');
        if (!apiKey) {
            LogError('CohereReRanker: no API key found for driver "CohereReranker" or "CohereLLM" — set AI_VENDOR_API_KEY__COHERERERANKER (or AI_VENDOR_API_KEY__COHERELLM) or register an AIAPIKeys subclass.');
            return null;
        }
        const modelName = (config?.['model'] as string | undefined) ?? 'rerank-v5.0-fast';
        return new CohereScopeAIReranker(apiKey, modelName);
    }

    /**
     * Override `ReRank` to:
     * 1. Record actual cost via the inherited `reportCost` helper after a successful Cohere call.
     * 2. Apply Context Focus span extraction (`RelevantSpans`) onto `SearchResultItem` when returned.
     * 3. Apply optional calibrated `minRelevanceThreshold` filtering when configured.
     */
    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        const aiReranker = this.getAIReranker(config, contextUser);
        if (!aiReranker) {
            return candidates.slice(0, topN);
        }

        const documents = candidates.map(item => ({
            id: item.ID,
            text: this.buildRerankText(item),
            metadata: { __mjSearchItem: item },
            originalScore: item.Score,
        }));

        const response = await aiReranker.Rerank({
            query,
            documents,
            topK: topN,
            options: config,
        });

        if (!response.success) {
            LogError(
                `SearchEngine: AI reranker "${this.DriverClass}" failed (${response.durationMs}ms): ${
                    response.errorMessage ?? 'unknown error'
                }`
            );
            return candidates.slice(0, topN);
        }

        this.reportCost(this.EstimateCostCents(candidates.length));
        return this.mapRerankResults(response.results, config);
    }

    private mapRerankResults(
        results: RerankResult[],
        config?: Record<string, unknown>
    ): SearchResultItem[] {
        const focusSnippet = config?.['focusSnippet'] !== false;
        const minThreshold = typeof config?.['minRelevanceThreshold'] === 'number' && Number.isFinite(config['minRelevanceThreshold'])
            ? (config['minRelevanceThreshold'] as number)
            : undefined;

        return results
            .filter(r => minThreshold === undefined || r.relevanceScore >= minThreshold)
            .map(r => {
                const original = r.document.metadata?.['__mjSearchItem'] as SearchResultItem | undefined;
                if (!original) {
                    throw new Error(
                        'CohereReRanker: rerank result missing original SearchResultItem in metadata.'
                    );
                }
                const spans = r.document.metadata?.['__mjRelevantSpans'] as CohereSearchRelevantSpan[] | undefined;
                if (spans && spans.length > 0) {
                    const focusedText = this.buildFocusedSnippet(original, spans);
                    return {
                        ...original,
                        Score: r.relevanceScore,
                        ScoreBreakdown: { ...original.ScoreBreakdown, ReRank: r.relevanceScore },
                        Snippet: focusSnippet && focusedText.length > 0 ? focusedText : original.Snippet,
                        RelevantSpans: spans,
                    };
                }
                return {
                    ...original,
                    Score: r.relevanceScore,
                    ScoreBreakdown: { ...original.ScoreBreakdown, ReRank: r.relevanceScore },
                };
            });
    }

    /**
     * Join extracted Context Focus spans into a focused snippet, stripping a leading
     * `${Title}\n` prefix if a span starts inside the title line so `Snippet` does not
     * repeat `Title`.
     */
    private buildFocusedSnippet(original: SearchResultItem, spans: CohereSearchRelevantSpan[]): string {
        const titlePrefix = original.Title ? `${original.Title}\n` : '';
        return spans
            .map(s => {
                let text = s.text;
                if (titlePrefix && s.start < titlePrefix.length) {
                    const trimChars = Math.min(text.length, titlePrefix.length - Math.max(0, s.start));
                    text = text.slice(trimChars);
                }
                return text.trim();
            })
            .filter(Boolean)
            .join(' … ');
    }
}

/**
 * Tree-shake prevention helper. Call from a consumer's `public-api.ts` (or from
 * `LoadCohereReRanker()` in a generated registration manifest) to guarantee the
 * `@RegisterClass` side-effect runs.
 */
export function LoadCohereReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = CohereReRanker;
}
