/**
 * @fileoverview Shared transformers.js runtime for `BGEReRanker` (runs inside the worker thread
 * when available, or in-process as fallback when worker execution is disabled/unavailable).
 *
 * @module @memberjunction/search-engine
 */

/** Transformers.js pipeline call shape for cross-encoder text classification. */
export type RerankPipeline = (
    inputs: string | Array<string | string[]>,
    options?: Record<string, unknown>,
) => Promise<unknown>;

export interface TransformersModule {
    pipeline: (
        task: string,
        model: string,
        options?: { dtype?: string; cache_dir?: string },
    ) => Promise<RerankPipeline>;
    env: { allowLocalModels: boolean; cacheDir: string; allowRemoteModels?: boolean };
}

/** Default mini-batch size for ONNX cross-encoder inference to bound tensor memory and latency. */
export const DEFAULT_BGE_BATCH_SIZE = 32;

let transformersPromise: Promise<TransformersModule> | null = null;

function loadTransformers(): Promise<TransformersModule> {
    if (!transformersPromise) {
        transformersPromise = (async () => {
            try {
                // SearchEngine is ESM ("type": "module"); dynamic import is justified here by
                // CLAUDE.md Rule 8 #2 because '@huggingface/transformers' is an optionalDependency.
                const mod = (await import('@huggingface/transformers' as string)) as unknown as TransformersModule;
                return mod;
            } catch (err) {
                throw new Error(
                    `BGEReRanker: could not load '@huggingface/transformers', an optional dependency of @memberjunction/search-engine. It is skipped when its install fails or optional dependencies are omitted (--no-optional, --omit=optional); reinstall with optional dependencies to use the BGE local reranker. Underlying error: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        })();
    }
    return transformersPromise;
}

const pipelineCache = new Map<string, Promise<RerankPipeline>>();

/**
 * Loads (and caches) a quantized `text-classification` pipeline for `modelId`.
 * Clears failed promises from cache so transient load errors can recover on retry.
 */
export async function GetBGEPipeline(modelId: string, cacheDir: string | undefined): Promise<RerankPipeline> {
    const key = `${modelId}|${cacheDir ?? ''}`;
    let cached = pipelineCache.get(key);
    if (!cached) {
        cached = (async () => {
            const transformers = await loadTransformers();
            if (cacheDir) {
                transformers.env.cacheDir = cacheDir;
            }
            return transformers.pipeline('text-classification', modelId, { dtype: 'q8' });
        })();
        pipelineCache.set(key, cached);
        cached.catch(() => {
            if (pipelineCache.get(key) === cached) {
                pipelineCache.delete(key);
            }
        });
    }
    return cached;
}

/**
 * Normalizes transformers.js text-classification pipeline output into a flat `number[]`
 * with one relevance score per input pair.
 */
export function ExtractBGEScores(raw: unknown, expectedLength: number): number[] {
    if (!Array.isArray(raw)) {
        throw new Error('BGEReRanker: pipeline did not return an array');
    }
    const out: number[] = [];
    for (const entry of raw) {
        if (entry && typeof entry === 'object' && 'score' in entry && typeof (entry as { score: unknown }).score === 'number') {
            out.push((entry as { score: number }).score);
        } else if (Array.isArray(entry)) {
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

/**
 * Scores `[query, document]` pairs in bounded mini-batches against the cached BGE ONNX pipeline.
 */
export async function ScorePairsWithBGEModel(
    modelId: string,
    cacheDir: string | undefined,
    pairs: Array<[string, string]>,
    batchSize: number = DEFAULT_BGE_BATCH_SIZE,
): Promise<number[]> {
    if (pairs.length === 0) {
        return [];
    }
    const effectiveBatchSize = Math.max(1, Math.floor(batchSize));
    const scoreFor = await GetBGEPipeline(modelId, cacheDir);

    if (pairs.length <= effectiveBatchSize) {
        const raw = await scoreFor(pairs as unknown as string[][]);
        return ExtractBGEScores(raw, pairs.length);
    }

    const scores: number[] = [];
    for (let offset = 0; offset < pairs.length; offset += effectiveBatchSize) {
        const batch = pairs.slice(offset, offset + effectiveBatchSize);
        const raw = await scoreFor(batch as unknown as string[][]);
        const batchScores = ExtractBGEScores(raw, batch.length);
        for (const score of batchScores) {
            scores.push(score);
        }
    }
    return scores;
}

/** Clears cached pipelines and the memoized `@huggingface/transformers` module promise. */
export function ClearBGEPipelines(): void {
    pipelineCache.clear();
    transformersPromise = null;
}
