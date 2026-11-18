/**
 * @fileoverview Worker-side call handler for {@link BGERerankerWorker}.
 * Kept separate from `parentPort` wiring so request handling can be unit-tested in-process.
 *
 * @module @memberjunction/search-engine
 */

import { ClearBGEPipelines, ScorePairsWithBGEModel } from './bgeRuntime.js';
import type { BGEWorkerAnswer, BGEWorkerCall } from './BGERerankerWorkerProtocol.js';

/** Operations used by {@link HandleBGERerankerRequest}; injectable for tests. */
export interface BGERuntimeOperations {
    ScorePairs: typeof ScorePairsWithBGEModel;
    Clear: typeof ClearBGEPipelines;
}

const DEFAULT_OPERATIONS: BGERuntimeOperations = {
    ScorePairs: ScorePairsWithBGEModel,
    Clear: ClearBGEPipelines,
};

/** Executes a single BGE reranker worker request and returns its result wrapper. */
export async function HandleBGERerankerRequest(
    call: BGEWorkerCall,
    operations: BGERuntimeOperations = DEFAULT_OPERATIONS,
): Promise<BGEWorkerAnswer<number[]>> {
    switch (call.Kind) {
        case 'rerank': {
            const scores = await operations.ScorePairs(call.ModelId, call.CacheDir, call.Pairs, call.BatchSize);
            return { Result: scores };
        }
        case 'clear':
            operations.Clear();
            return { Result: [] };
        default:
            throw new Error(`Unknown BGE reranker worker call: ${(call as { Kind: string }).Kind}`);
    }
}
