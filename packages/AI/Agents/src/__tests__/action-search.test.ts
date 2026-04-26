/**
 * Unit tests for the semantic action-search meta-tool flow added to BaseAgent.
 *
 * These tests verify the testable pure-functional and threshold-gating logic
 * without standing up the full agent runtime. The BaseAgent methods are
 * private and depend on `ActionEngineServer.Instance` and `AIEngine.Instance`
 * singletons, so we mirror the relevant logic here as standalone helpers
 * (matching the pattern used in `action-changes.test.ts`).
 *
 * Coverage:
 *  1. Threshold gate (≤25 → full dump path; >25 → summary path)
 *  2. Category bucketing (`summarizeActionsByCategory` shape, sorting,
 *     "Uncategorized" fallback)
 *  3. topK clamping (default, max 50, integer truncation, invalid → default)
 *  4. Below-threshold rejection of `_searchActions` in validation
 *  5. Scoping of search results to `effectiveActions` (no leakage)
 */

import { describe, it, expect } from 'vitest';

// ── Mirror the production constants ──────────────────────────────────────────
const ACTION_SEARCH_THRESHOLD = 25;
const ACTION_SEARCH_TOOL_NAME = '_searchActions';
const ACTION_SEARCH_DEFAULT_TOP_K = 10;
const ACTION_SEARCH_MAX_TOP_K = 50;

// ── Test fixture shapes (minimal mirrors of the production entities) ────────
interface FakeAction {
    ID: string;
    Name: string;
    CategoryID?: string | null;
}

interface FakeCategory {
    ID: string;
    Name: string;
}

interface FakeAgentAction {
    name: string;
    params?: Record<string, unknown>;
}

// ── Helpers that mirror the BaseAgent private logic under test ──────────────

function shouldSummarize(actions: FakeAction[]): boolean {
    return actions.length > ACTION_SEARCH_THRESHOLD;
}

function summarizeActionsByCategory(
    actions: FakeAction[],
    categories: FakeCategory[]
): Array<{ category: string; count: number }> {
    const counts = new Map<string, number>();
    for (const action of actions) {
        const catEntity = action.CategoryID
            ? categories.find(c => c.ID === action.CategoryID)
            : null;
        const category = catEntity?.Name?.trim() || 'Uncategorized';
        counts.set(category, (counts.get(category) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function resolveTopK(rawTopK: unknown): number {
    const requestedTopK = Number(rawTopK);
    return Number.isFinite(requestedTopK) && requestedTopK > 0
        ? Math.min(Math.trunc(requestedTopK), ACTION_SEARCH_MAX_TOP_K)
        : ACTION_SEARCH_DEFAULT_TOP_K;
}

/**
 * Mirrors the relevant branch of validateActionsNextStep:
 * accepts `_searchActions` only when threshold crossed; otherwise treats
 * it as missing.
 */
function isSearchToolValidForAgent(
    action: FakeAgentAction,
    effectiveActions: FakeAction[]
): { valid: boolean; isSearch: boolean } {
    const actionName = action.name.trim().toLowerCase();
    if (actionName === ACTION_SEARCH_TOOL_NAME.toLowerCase()) {
        return {
            valid: effectiveActions.length > ACTION_SEARCH_THRESHOLD,
            isSearch: true,
        };
    }
    return { valid: false, isSearch: false };
}

/**
 * Mirrors the scoping filter applied to FindSimilarActions output:
 * only matches whose actionId is in the agent's effectiveActions are kept.
 */
function scopeMatchesToEffectiveActions(
    rawMatches: Array<{ actionId: string; similarityScore: number }>,
    effectiveActions: FakeAction[]
): Array<{ actionId: string; similarityScore: number; name: string }> {
    const effectiveById = new Map(effectiveActions.map(a => [a.ID, a]));
    return rawMatches
        .map(m => ({ match: m, entity: effectiveById.get(m.actionId) }))
        .filter((x): x is { match: typeof rawMatches[number]; entity: FakeAction } => !!x.entity)
        .map(({ match, entity }) => ({
            actionId: match.actionId,
            similarityScore: match.similarityScore,
            name: entity.Name,
        }));
}

// ── Fixture builders ────────────────────────────────────────────────────────

function makeAction(name: string, categoryId: string | null = null): FakeAction {
    return { ID: `action-${name}`, Name: name, CategoryID: categoryId };
}

function makeActions(count: number, prefix = 'Action'): FakeAction[] {
    return Array.from({ length: count }, (_, i) => makeAction(`${prefix}${i + 1}`));
}

// ────────────────────────────────────────────────────────────────────────────

describe('Semantic Action Search', () => {
    describe('Threshold gate (shouldSummarize)', () => {
        it('returns false at exactly the threshold (25 actions)', () => {
            // Threshold uses `>`, not `>=`, so 25 = full dump still
            expect(shouldSummarize(makeActions(25))).toBe(false);
        });

        it('returns true above the threshold (26 actions)', () => {
            expect(shouldSummarize(makeActions(26))).toBe(true);
        });

        it('returns false below the threshold (24 actions)', () => {
            expect(shouldSummarize(makeActions(24))).toBe(false);
        });

        it('returns false on empty action list', () => {
            expect(shouldSummarize([])).toBe(false);
        });

        it('returns true for very large action sets (200+)', () => {
            expect(shouldSummarize(makeActions(200))).toBe(true);
        });
    });

    describe('summarizeActionsByCategory', () => {
        it('sorts buckets by descending count, then alphabetical', () => {
            const cats: FakeCategory[] = [
                { ID: 'c1', Name: 'Communication' },
                { ID: 'c2', Name: 'Data' },
                { ID: 'c3', Name: 'Utilities' },
            ];
            const actions: FakeAction[] = [
                makeAction('A1', 'c1'),
                makeAction('A2', 'c1'),
                makeAction('A3', 'c1'),
                makeAction('B1', 'c2'),
                makeAction('B2', 'c2'),
                makeAction('C1', 'c3'),
            ];
            const result = summarizeActionsByCategory(actions, cats);
            expect(result).toEqual([
                { category: 'Communication', count: 3 },
                { category: 'Data', count: 2 },
                { category: 'Utilities', count: 1 },
            ]);
        });

        it('breaks ties alphabetically when counts match', () => {
            const cats: FakeCategory[] = [
                { ID: 'c1', Name: 'Zeta' },
                { ID: 'c2', Name: 'Alpha' },
                { ID: 'c3', Name: 'Mike' },
            ];
            const actions: FakeAction[] = [
                makeAction('z', 'c1'),
                makeAction('a', 'c2'),
                makeAction('m', 'c3'),
            ];
            const result = summarizeActionsByCategory(actions, cats);
            // All count=1, alphabetical
            expect(result.map(r => r.category)).toEqual(['Alpha', 'Mike', 'Zeta']);
        });

        it('buckets actions with null/missing categories as "Uncategorized"', () => {
            const actions: FakeAction[] = [
                makeAction('A1', null),
                makeAction('A2'),
                makeAction('A3', null),
            ];
            const result = summarizeActionsByCategory(actions, []);
            expect(result).toEqual([{ category: 'Uncategorized', count: 3 }]);
        });

        it('buckets actions with unknown CategoryID as "Uncategorized"', () => {
            const actions: FakeAction[] = [makeAction('A1', 'nonexistent-cat-id')];
            const result = summarizeActionsByCategory(actions, []);
            expect(result).toEqual([{ category: 'Uncategorized', count: 1 }]);
        });

        it('handles empty action list', () => {
            expect(summarizeActionsByCategory([], [])).toEqual([]);
        });

        it('preserves count for mixed categorized + uncategorized', () => {
            const cats: FakeCategory[] = [{ ID: 'c1', Name: 'Real' }];
            const actions: FakeAction[] = [
                makeAction('A1', 'c1'),
                makeAction('A2', 'c1'),
                makeAction('A3', null),
            ];
            const result = summarizeActionsByCategory(actions, cats);
            expect(result).toEqual([
                { category: 'Real', count: 2 },
                { category: 'Uncategorized', count: 1 },
            ]);
        });
    });

    describe('topK clamping', () => {
        it('returns the default when topK is missing/undefined', () => {
            expect(resolveTopK(undefined)).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('returns the default when topK is null', () => {
            expect(resolveTopK(null)).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('returns the default when topK is non-numeric', () => {
            expect(resolveTopK('foo')).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('returns the default when topK is zero', () => {
            expect(resolveTopK(0)).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('returns the default when topK is negative', () => {
            expect(resolveTopK(-5)).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('returns the default when topK is NaN', () => {
            expect(resolveTopK(NaN)).toBe(ACTION_SEARCH_DEFAULT_TOP_K);
        });

        it('honors a valid integer topK', () => {
            expect(resolveTopK(15)).toBe(15);
        });

        it('truncates a fractional topK', () => {
            expect(resolveTopK(7.9)).toBe(7);
        });

        it('clamps topK at the max (50)', () => {
            expect(resolveTopK(100)).toBe(ACTION_SEARCH_MAX_TOP_K);
            expect(resolveTopK(51)).toBe(ACTION_SEARCH_MAX_TOP_K);
        });

        it('honors a string-encoded numeric topK (LLMs often emit strings)', () => {
            expect(resolveTopK('20')).toBe(20);
        });
    });

    describe('Validation gate for `_searchActions`', () => {
        it('accepts `_searchActions` when above threshold', () => {
            const result = isSearchToolValidForAgent(
                { name: '_searchActions' },
                makeActions(50)
            );
            expect(result).toEqual({ valid: true, isSearch: true });
        });

        it('rejects `_searchActions` when at threshold (25, not > 25)', () => {
            const result = isSearchToolValidForAgent(
                { name: '_searchActions' },
                makeActions(25)
            );
            expect(result).toEqual({ valid: false, isSearch: true });
        });

        it('rejects `_searchActions` when well below threshold', () => {
            const result = isSearchToolValidForAgent(
                { name: '_searchActions' },
                makeActions(5)
            );
            expect(result).toEqual({ valid: false, isSearch: true });
        });

        it('handles case-insensitive match (LLMs may emit `_SearchActions`)', () => {
            const result = isSearchToolValidForAgent(
                { name: '_SearchActions' },
                makeActions(50)
            );
            expect(result).toEqual({ valid: true, isSearch: true });
        });

        it('does not match a similarly-named real action', () => {
            const result = isSearchToolValidForAgent(
                { name: 'searchActions' }, // missing leading underscore
                makeActions(50)
            );
            expect(result).toEqual({ valid: false, isSearch: false });
        });
    });

    describe('Scoping (no leakage of other agents\' actions)', () => {
        it('drops matches not in effectiveActions', () => {
            const effective: FakeAction[] = [
                makeAction('Mine1'),
                makeAction('Mine2'),
            ];
            const rawMatches = [
                { actionId: 'action-Mine1', similarityScore: 0.95 },
                { actionId: 'action-OtherAgentAction', similarityScore: 0.92 },
                { actionId: 'action-Mine2', similarityScore: 0.88 },
                { actionId: 'action-AnotherLeak', similarityScore: 0.85 },
            ];
            const scoped = scopeMatchesToEffectiveActions(rawMatches, effective);
            expect(scoped).toHaveLength(2);
            expect(scoped.map(m => m.name)).toEqual(['Mine1', 'Mine2']);
        });

        it('returns empty when no matches overlap with effectiveActions', () => {
            const effective: FakeAction[] = [makeAction('OnlyMine')];
            const rawMatches = [
                { actionId: 'action-NotMine1', similarityScore: 0.99 },
                { actionId: 'action-NotMine2', similarityScore: 0.97 },
            ];
            const scoped = scopeMatchesToEffectiveActions(rawMatches, effective);
            expect(scoped).toEqual([]);
        });

        it('preserves match order from FindSimilarActions', () => {
            const effective = makeActions(5);
            const rawMatches = [
                { actionId: 'action-Action3', similarityScore: 0.99 },
                { actionId: 'action-Action1', similarityScore: 0.85 },
                { actionId: 'action-Action5', similarityScore: 0.70 },
            ];
            const scoped = scopeMatchesToEffectiveActions(rawMatches, effective);
            expect(scoped.map(m => m.name)).toEqual(['Action3', 'Action1', 'Action5']);
        });

        it('preserves similarityScore on scoped matches', () => {
            const effective = [makeAction('Keep')];
            const rawMatches = [
                { actionId: 'action-Keep', similarityScore: 0.7654 },
            ];
            const scoped = scopeMatchesToEffectiveActions(rawMatches, effective);
            expect(scoped[0].similarityScore).toBe(0.7654);
        });
    });

});
