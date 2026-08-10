/**
 * Reuses a judge verdict across attempts on an identical (goal hash, normalized
 * URL, perceptual state hash) key, avoiding re-scoring unchanged behavior at full
 * vision price and full verdict variance. A cached `Impossible` short-circuits a
 * retry to a deterministic re-check.
 *
 * Cross-attempt persistence is the driver's responsibility — it injects a shared
 * instance via {@link ComputerUseEngine.SetJudgeCache}.
 */

import { JudgeVerdict } from '../types/judge.js';
import { normalizeTraceUrl } from './trace-url.js';

/** Build a stable cache key from the goal hash, current URL, and state hash. */
export function makeJudgeCacheKey(
    goalHash: string,
    url: string,
    stateHash: string,
    volatileParams: string[] = []
): string {
    return `${goalHash}|${normalizeTraceUrl(url, volatileParams)}|${stateHash}`;
}

/** An in-memory verdict cache keyed by {@link makeJudgeCacheKey}. */
export class JudgeVerdictCache {
    private store = new Map<string, JudgeVerdict>();

    public get(key: string): JudgeVerdict | undefined {
        return this.store.get(key);
    }
    public set(key: string, verdict: JudgeVerdict): void {
        this.store.set(key, verdict);
    }
    public has(key: string): boolean {
        return this.store.has(key);
    }
    public get size(): number {
        return this.store.size;
    }
    public clear(): void {
        this.store.clear();
    }
}
