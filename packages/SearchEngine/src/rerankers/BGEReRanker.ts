/**
 * @fileoverview BGE local-model re-ranker (P2D.5).
 *
 * Self-hosted reranker for deployments that don't want to send candidate documents
 * to a third-party API. Wraps `@xenova/transformers`' `pipeline('text-classification')`
 * loaded with a Xenova-converted BGE reranker model (e.g. `Xenova/bge-reranker-base`,
 * `Xenova/bge-reranker-large`, `Xenova/bge-reranker-v2-m3`).
 *
 * **Cost.** Zero — local model. Reports 0 cents to the budget guard.
 *
 * **Model loading.** Lazy: the model is downloaded on first use into the configured
 * `TRANSFORMERS_CACHE_DIR` (or the transformers.js default). The model is NOT bundled
 * in the npm package. Override the model and cache directory via:
 *   - `ScopeConfig.reRanker.config.model` — HuggingFace ID or local path
 *   - `ScopeConfig.reRanker.config.cacheDir` — override TRANSFORMERS_CACHE_DIR
 *
 * **Optional peer dep.** `@xenova/transformers` is in `optionalDependencies`. Loaded
 * via dynamic import per CLAUDE.md rule #8 case 2 — consumers who don't want a
 * local-model reranker don't pay the bundle cost.
 *
 * @module @memberjunction/search-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { BaseReRanker } from '../generic/BaseReRanker';
import { SearchResultItem } from '../generic/search.types';

/** Transformers.js pipeline call shape for cross-encoder text classification. */
type RerankPipeline = (
    inputs: string | Array<string | string[]>,
    options?: Record<string, unknown>,
) => Promise<unknown>;

interface TransformersModule {
    pipeline: (
        task: string,
        model: string,
        options?: { quantized?: boolean; cache_dir?: string },
    ) => Promise<RerankPipeline>;
    env: { allowLocalModels: boolean; cacheDir: string; allowRemoteModels?: boolean };
}

/**
 * Memoized loader for the transformers.js module. Same pattern as LocalEmbedding —
 * a single dynamic import the first time, reused thereafter.
 */
let transformersPromise: Promise<TransformersModule> | null = null;
function loadTransformers(): Promise<TransformersModule> {
    if (!transformersPromise) {
        transformersPromise = (async () => {
            try {
                // SearchEngine is ESM (`"type": "module"`), so a real dynamic import is
                // safe here — no need for the `eval('import(...)')` workaround that
                // packages-as-CJS use. This is also what allows tests to vi.mock().
                const mod = await import('@xenova/transformers' as string) as unknown as TransformersModule;
                return mod;
            } catch (err) {
                throw new Error(
                    `BGEReRanker: '@xenova/transformers' is not installed. Add it to your project's dependencies if you intend to use the BGE local reranker. Underlying error: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        })();
    }
    return transformersPromise;
}

/**
 * Per-model pipeline cache. Keyed by `${modelId}|${cacheDir}` so the same process can
 * host multiple BGE variants without thrashing.
 */
const pipelineCache = new Map<string, Promise<RerankPipeline>>();

async function getPipeline(modelId: string, cacheDir: string | undefined): Promise<RerankPipeline> {
    const key = `${modelId}|${cacheDir ?? ''}`;
    let cached = pipelineCache.get(key);
    if (!cached) {
        cached = (async () => {
            const transformers = await loadTransformers();
            if (cacheDir) transformers.env.cacheDir = cacheDir;
            return transformers.pipeline('text-classification', modelId, { quantized: true });
        })();
        pipelineCache.set(key, cached);
    }
    return cached;
}

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
     * No hard cap from the model itself, but practical memory limits apply. We cap at
     * 5000 to match what fits comfortably in 16 GB RAM with `bge-reranker-base`.
     */
    public override GetMaxResultCount(): number {
        return 5000;
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

        let scoreFor: RerankPipeline;
        try {
            scoreFor = await getPipeline(modelId, cacheDir);
        } catch (err) {
            LogError(`BGEReRanker: failed to load pipeline for "${modelId}": ${err instanceof Error ? err.message : String(err)}`);
            // Fall back to a top-N slice when the local model can't be loaded.
            return candidates.slice(0, topN);
        }

        try {
            // For cross-encoder reranking we feed each candidate as a [query, doc] pair.
            // transformers.js text-classification accepts an array of pairs — call once
            // with all pairs to get one response per pair.
            const pairs: Array<[string, string]> = candidates.map(c => [query, this.buildText(c)]);
            const raw = await scoreFor(pairs as unknown as string[][]);

            // The pipeline returns either an array of `{label, score}` (one per pair) or
            // an array of arrays when multi-label is enabled. Normalize to a flat array
            // of scores. We treat `score` as relevance directly; for binary cross-encoders
            // the model emits a logit-style score we use as-is for ranking purposes.
            const scores = this.extractScores(raw, candidates.length);

            const ranked = candidates
                .map((c, i) => ({
                    item: c,
                    score: scores[i] ?? 0,
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, topN)
                .map(p => ({
                    ...p.item,
                    Score: p.score,
                    ScoreBreakdown: { ...p.item.ScoreBreakdown, ReRank: p.score },
                }));

            // Local model — no cost reported.
            return ranked;
        } catch (err) {
            LogError(`BGEReRanker: rerank failed for "${modelId}": ${err instanceof Error ? err.message : String(err)}`);
            return candidates.slice(0, topN);
        }
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
        if (!Array.isArray(raw)) {
            throw new Error('BGEReRanker: pipeline did not return an array');
        }
        const out: number[] = [];
        for (const entry of raw) {
            if (entry && typeof entry === 'object' && 'score' in entry && typeof (entry as { score: unknown }).score === 'number') {
                out.push((entry as { score: number }).score);
            } else if (Array.isArray(entry)) {
                // Multi-label form — take the first label's score
                const first = entry[0] as { score?: unknown } | undefined;
                out.push(first && typeof first.score === 'number' ? first.score : 0);
            } else {
                out.push(0);
            }
        }
        if (out.length !== expectedLength) {
            throw new Error(`BGEReRanker: pipeline returned ${out.length} scores for ${expectedLength} inputs`);
        }
        return out;
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
export function __resetBGEPipelineCacheForTests(): void {
    pipelineCache.clear();
    transformersPromise = null;
}
