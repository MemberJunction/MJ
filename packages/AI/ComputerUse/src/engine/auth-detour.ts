/**
 * Auth-detour detection (CU-B7) — pure decisions, no browser or engine state.
 *
 * When a run's session is invalidated mid-flight the page bounces to an
 * identity provider's URL. This module answers two questions the engine's
 * watchdog needs: "is the current URL an identity-provider bounce?" and, given
 * how many detours have already happened, "recover or give up?". Kept pure so
 * the matching and the terminate-after-N policy are unit-testable without a
 * live browser.
 *
 * The engine stays app-agnostic: the provider patterns come from the
 * caller's {@link AppProfile}; this module ships no provider list of its own.
 */

/** The outcome of evaluating the current URL against the watchdog config. */
export interface AuthDetourDecision {
    /** The current URL matched an identity-provider pattern. */
    isDetour: boolean;
    /**
     * This detour takes the run's count to/over `maxDetours` — recovery isn't
     * holding, so the run should terminate as an infrastructure AuthDetour
     * rather than be recovered again. Only meaningful when `isDetour` is true.
     */
    shouldTerminate: boolean;
}

/**
 * True when `url` contains any of `patterns` (case-insensitive substring). A
 * substring test (not hostname-only) so path-scoped markers like `/u/consent`
 * work alongside host markers like `auth0.com`. Empty patterns → never a
 * detour (watchdog disabled).
 */
export function isAuthDetourUrl(url: string, patterns: string[]): boolean {
    if (!url || patterns.length === 0) {
        return false;
    }
    const haystack = url.toLowerCase();
    return patterns.some(p => {
        const needle = p.trim().toLowerCase();
        return needle.length > 0 && haystack.includes(needle);
    });
}

/**
 * Evaluate the current URL for the watchdog. `priorDetourCount` is how many
 * detours have already occurred this run (before this one); the caller
 * increments its counter when `isDetour` is true. `shouldTerminate` is set once
 * the count *including this detour* reaches `maxDetours`.
 */
export function evaluateAuthDetour(
    url: string,
    patterns: string[],
    priorDetourCount: number,
    maxDetours: number
): AuthDetourDecision {
    const isDetour = isAuthDetourUrl(url, patterns);
    if (!isDetour) {
        return { isDetour: false, shouldTerminate: false };
    }
    // The count after we record this detour.
    const countAfter = priorDetourCount + 1;
    return { isDetour: true, shouldTerminate: countAfter >= maxDetours };
}
