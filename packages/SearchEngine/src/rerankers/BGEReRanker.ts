/**
 * @fileoverview BGE local-model re-ranker (P2D.5).
 *
 * Self-hosted reranker for deployments that don't want to send candidate documents
 * to a third-party API. Wraps `@huggingface/transformers`' `pipeline('text-classification')`
 * loaded with a Xenova-converted BGE reranker model (e.g. `Xenova/bge-reranker-base`,
 * `Xenova/bge-reranker-large`, `Xenova/bge-reranker-v2-m3`).
 *
 * **Event-loop isolation.** When the compiled worker entrypoint is available (production
 * builds), model loading and ONNX cross-encoder inference run on a dedicated reusable
 * `worker_threads` worker ({@link BGERerankerWorkerHost}) with a bounded candidate cap
 * ({@link DEFAULT_BGE_MAX_CANDIDATES}), mini-batch chunking ({@link DEFAULT_BGE_BATCH_SIZE}),
 * and a per-call timeout budget ({@link DEFAULT_BGE_RERANKER_TIMEOUT_MS}) so Node's HTTP/WS
 * event loop never stalls.
 *
 * **Cost.** Zero — local model. Reports 0 cents to the budget guard.
 *
 * **Model loading.** Lazy: the model is downloaded on first use into the configured
 * `TRANSFORMERS_CACHE_DIR` (or the transformers.js default). The model is NOT bundled
 * in the npm package. Override the model and cache directory via:
 *   - `ScopeConfig.reRanker.config.model` — HuggingFace ID or local path
 *   - `ScopeConfig.reRanker.config.cacheDir` — override TRANSFORMERS_CACHE_DIR
 *   - `ScopeConfig.reRanker.config.batchSize` — mini-batch size (1..128, default 32)
 *   - `ScopeConfig.reRanker.config.timeoutMs` — worker call timeout in ms (default 30000)
 *
 * **Optional peer dep.** `@huggingface/transformers` is in `optionalDependencies`. Loaded
 * via dynamic import in `bgeRuntime` per CLAUDE.md rule #8 case 2 — consumers who don't want
 * a local-model reranker don't pay the bundle cost.
 *
 * @module @memberjunction/search-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { BaseReRanker } from '../generic/BaseReRanker.js';
import { SearchResultItem } from '../generic/search.types.js';
import {
    ClearBGEPipelines,
    DEFAULT_BGE_BATCH_SIZE,
    ExtractBGEScores,
    ScorePairsWithBGEModel,
} from './bgeRuntime.js';
import { BGERerankerWorkerHost, DEFAULT_BGE_RERANKER_TIMEOUT_MS } from './BGERerankerWorkerHost.js';

/** Maximum candidates cross-encoded per request to bound CPU latency and memory. */
export const DEFAULT_BGE_MAX_CANDIDATES = 100;

const MAX_CONFIGURED_BATCH_SIZE = 128;

/**
 * Local BGE reranker. Configure per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'BGEReRanker'`.
 */
@RegisterClass(BaseReRanker, 'BGEReRanker')
export class BGEReRanker extends BaseReRanker {
    public get DriverClass(): string {
        return 'BGEReRanker';
    }
    public override get Name(): string {
        return 'BGE';
    }
    public override get Version(): string {
        return '1';
    }

    /**
     * Bounds cross-encoding per call to {@link DEFAULT_BGE_MAX_CANDIDATES} (100) so a
     * single local ONNX pass stays within interactive latency budgets.
     */
    public override GetMaxResultCount(): number {
        return DEFAULT_BGE_MAX_CANDIDATES;
    }

    /** Local model — no per-call charge. */
    public override EstimateCostCents(_resultCount: number): number {
        return 0;
    }

    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        _contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];

        const modelId = (config?.['model'] as string | undefined) ?? 'Xenova/bge-reranker-base';
        const cacheDir = config?.['cacheDir'] as string | undefined;
        const batchSize = this.resolveBatchSize(config?.['batchSize']);
        const timeoutMs = this.resolveTimeoutMs(config?.['timeoutMs']);
        const maxCandidates = this.resolveMaxCandidates(config?.['maxCandidates']);

        const candidatesToScore = candidates.length > maxCandidates
            ? candidates.slice(0, maxCandidates)
            : candidates;

        try {
            const pairs: Array<[string, string]> = candidatesToScore.map(c => [query, this.buildText(c)]);
            const host = BGERerankerWorkerHost.Instance;
            const scores = host.IsAvailable
                ? await host.Run({ Kind: 'rerank', ModelId: modelId, CacheDir: cacheDir, Pairs: pairs, BatchSize: batchSize }, timeoutMs)
                : await ScorePairsWithBGEModel(modelId, cacheDir, pairs, batchSize);

            if (scores.length !== candidatesToScore.length) {
                throw new Error(`BGEReRanker: pipeline returned ${scores.length} scores for ${candidatesToScore.length} inputs`);
            }

            const ranked = candidatesToScore
                .map((c, i) => ({
                    item: c,
                    score: scores[i] ?? 0,
                }))
                .sort((a, b) => b.score - a.score)
                .map(p => ({
                    ...p.item,
                    Score: p.score,
                    ScoreBreakdown: { ...p.item.ScoreBreakdown, ReRank: p.score },
                }));

            if (topN <= ranked.length) {
                return ranked.slice(0, topN);
            }
            // If caller requested more than maxCandidates, append unreranked tail up to topN.
            const tail = candidates.slice(candidatesToScore.length, topN);
            return [...ranked, ...tail];
        } catch (err) {
            LogError(`BGEReRanker: rerank failed for "${modelId}": ${err instanceof Error ? err.message : String(err)}`);
            // Fall back to a top-N slice when the local model or worker fails/times out.
            return candidates.slice(0, topN);
        }
    }

    private resolveBatchSize(raw: unknown): number {
        if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
            return Math.min(MAX_CONFIGURED_BATCH_SIZE, Math.floor(raw));
        }
        return DEFAULT_BGE_BATCH_SIZE;
    }

    private resolveTimeoutMs(raw: unknown): number {
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return Math.floor(raw);
        }
        return DEFAULT_BGE_RERANKER_TIMEOUT_MS;
    }

    private resolveMaxCandidates(raw: unknown): number {
        const cap = this.GetMaxResultCount();
        if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
            return Math.min(cap, Math.floor(raw));
        }
        return cap;
    }

    /** Subclasses can override to customize the candidate's text representation. */
    protected buildText(item: SearchResultItem): string {
        const parts = [item.Title, item.Snippet].filter(p => p != null && p.length > 0);
        return parts.join('\n');
    }

    /**
     * Normalize the various shapes transformers.js may return into a flat number[]
     * with one score per input pair. Throws when the shape doesn't match.
     */
    protected extractScores(raw: unknown, expectedLength: number): number[] {
        return ExtractBGEScores(raw, expectedLength);
    }
}

/** Tree-shake prevention helper. */
export function LoadBGEReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = BGEReRanker;
}

/**
 * Test-only export: clear the per-model pipeline cache. Used by tests so each test
 * can install its own mock pipeline.
 */
export function ResetBGEPipelineCacheForTests(): void {
    ClearBGEPipelines();
    const host = BGERerankerWorkerHost.Instance;
    if (host.IsAvailable) {
        host.Run({ Kind: 'clear' }).catch(() => undefined);
    }
}

/** @deprecated Use {@link ResetBGEPipelineCacheForTests}. */
export function __resetBGEPipelineCacheForTests(): void {
    return ResetBGEPipelineCacheForTests();
}
