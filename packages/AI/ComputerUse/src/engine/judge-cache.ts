/**
 * Judge-verdict cache (CU-C5.3) — reuse a verdict across attempts on an
 * identical (goal, URL, visible-state) key.
 *
 * The LLM judge re-scores unchanged behavior every run, at full vision price and
 * with full verdict variance (a top flakiness source). Within a run this is
 * already gated by CU-G5 (skip a scheduled judge when the state hash is
 * unchanged). This cache generalizes that ACROSS attempts: keyed by the goal
 * hash + normalized URL + perceptual state hash, an identical state returns the
 * prior verdict — most valuably, a cached `Impossible` short-circuits a retry to
 * a deterministic re-check.
 *
 * Layer 1 provides the pure cache + key. Cross-attempt/cross-process persistence
 * is the driver's responsibility — it injects a shared instance into the engine
 * ({@link ComputerUseEngine.SetJudgeCache}) so verdicts survive attempt
 * boundaries. Pure and app-agnostic.
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
