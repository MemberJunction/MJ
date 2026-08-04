/**
 * @fileoverview Prompt-cache metric helpers shared across the AI analytics dashboards.
 *
 * Pure functions (no Angular, no I/O) so every surface computes cache hit rate and dollar savings
 * identically. Token inputs follow the AIPromptRun contract: TokensPrompt is UNCACHED ("net-new")
 * input, with TokensCacheRead / TokensCacheWrite as disjoint cache buckets.
 */

/**
 * Per-unit pricing for one model+vendor, normalized so callers can price token buckets directly.
 * Rates are in currency-per-token (i.e. the AIModelCost per-unit rate already divided by its
 * UnitType divisor). When a model has no distinct cache rate, callers should fall back to the
 * input rate (which makes the corresponding savings term zero).
 */
export interface CacheRate {
    /** Currency per uncached input token. */
    inputRate: number;
    /** Currency per cache-read token (≤ inputRate for every provider). */
    cacheReadRate: number;
    /** Currency per cache-write token (≥ inputRate for providers that bill writes, e.g. Anthropic). */
    cacheWriteRate: number;
}

/** Aggregate cache token counts, e.g. summed across a set of runs. */
export interface CacheTokenTotals {
    uncachedInputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

/**
 * Fraction (0..1) of input tokens served from the provider's prompt cache.
 * Denominator is the TOTAL input processed (uncached + cache reads + cache writes), so a run that
 * only wrote to cache (first call) reads as 0% and a fully-cached follow-up approaches 100%.
 */
export function cacheHitRate(totals: CacheTokenTotals): number {
    const totalInput = totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
    return totalInput > 0 ? totals.cacheReadTokens / totalInput : 0;
}

/** True when caching actually engaged (any read or write), so a 0% hit rate can be shown meaningfully. */
export function hasCacheActivity(totals: CacheTokenTotals): boolean {
    return totals.cacheReadTokens > 0 || totals.cacheWriteTokens > 0;
}

/**
 * Net dollars saved by prompt caching versus the no-cache counterfactual, where every input token
 * (including what was read from / written to cache) would have been billed at the full input rate:
 *
 *   savings = cacheRead × (inputRate − cacheReadRate)   [reads are cheaper → positive]
 *           + cacheWrite × (inputRate − cacheWriteRate) [writes cost a premium → negative]
 *
 * So the result is read-savings MINUS write-premium — the honest net, not gross cached tokens.
 * Returns 0 when no rate is supplied (rates unconfigured); combine with {@link hasCacheActivity}
 * to distinguish "no caching happened" from "caching happened but rates aren't configured yet".
 */
export function netCacheSavings(totals: CacheTokenTotals, rate: CacheRate | undefined): number {
    if (!rate) {
        return 0;
    }
    return (
        totals.cacheReadTokens * (rate.inputRate - rate.cacheReadRate) +
        totals.cacheWriteTokens * (rate.inputRate - rate.cacheWriteRate)
    );
}

/** The no-cache counterfactual cost = actual cost + net savings. Useful for "X% cheaper" framing. */
export function uncachedCounterfactualCost(actualCost: number, savings: number): number {
    return actualCost + savings;
}
