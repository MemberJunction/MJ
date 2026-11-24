/**
 * @fileoverview Shared usage extraction helpers for TaskGraph server runners.
 * @module @memberjunction/server
 */

/**
 * Picks the first positive finite metric from priority-ordered candidates, falling back to `0`
 * when at least one candidate was explicitly `0`, or `undefined` when all candidates are absent.
 */
export function PickUsageMetric(candidates: ReadonlyArray<number | null | undefined>): number | undefined {
    let sawZero = false;
    for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            if (value > 0) {
                return value;
            }
            sawZero = true;
        }
    }
    return sawZero ? 0 : undefined;
}

/**
 * Sums a pair of optional non-negative prompt/completion token counters, returning `undefined`
 * when both inputs are absent or non-finite.
 */
export function SumUsageTokenPair(
    promptTokens: number | null | undefined,
    completionTokens: number | null | undefined,
): number | undefined {
    const hasPrompt = typeof promptTokens === 'number' && Number.isFinite(promptTokens) && promptTokens >= 0;
    const hasCompletion = typeof completionTokens === 'number' && Number.isFinite(completionTokens) && completionTokens >= 0;
    if (!hasPrompt && !hasCompletion) {
        return undefined;
    }
    return (hasPrompt ? promptTokens : 0) + (hasCompletion ? completionTokens : 0);
}
