/**
 * @fileoverview The `semantic-search` baseline: what `Find Candidate Agents` would have listed first
 * for a request, which is where Sage's old two-turn discovery started from.
 *
 * The search itself is shared, not copied: the driver runs `DecisionDiscoveryAgentSearch` from
 * `@memberjunction/ai-agents`, the same hybrid search over `MJ: AI Agents` that the action and
 * production's discovery run. What this module adds is the action's reading of the results, which
 * lives inside the action (`@memberjunction/core-actions`, `BaseFindAgentsAction`) and is mirrored
 * here because this package cannot depend on the actions:
 * - a result passes the action's floor when its semantic component reaches the floor, or it has
 *   any lexical component;
 * - its reported score is the larger of the two components, else the blended score;
 * - the action keeps the passing results that are agents the user may run and can discover
 *   directly, in rank order, and lists them.
 *
 * The constants are the ones Sage's prompt passes the action (`MaxResults = 5`,
 * `MinimumSimilarityScore = 0.5`), which are also the action's defaults.
 *
 * @module @memberjunction/testing-engine
 */

import type { EntitySearchResult } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { RankOptionsBySearch, type DecisionDiscoveryOption } from '@memberjunction/ai-agents';
import type { DiscoveryBaselineCandidate, DiscoveryBaselineRecord } from './discovery-types';

/** The similarity floor Sage passes `Find Candidate Agents`, and the action's default. */
export const FIND_CANDIDATE_AGENTS_MIN_SIMILARITY = 0.5;

/** The result count Sage asks `Find Candidate Agents` for, and the action's default. */
export const FIND_CANDIDATE_AGENTS_MAX_RESULTS = 5;

/** How many results the action asks the search for: threefold, for its permission filter. */
export const FIND_CANDIDATE_AGENTS_TOP_K = FIND_CANDIDATE_AGENTS_MAX_RESULTS * 3;

/** An agent the baseline may list: one the user may run and can discover directly. */
export interface DiscoveryBaselineAgent {
    ID: string;
    Name: string | null;
}

/**
 * The score `Find Candidate Agents` reports for a result: the larger of its semantic and lexical
 * components, or its blended score when neither is present or both are zero.
 *
 * @param result A search result.
 */
export function FindCandidateAgentsScore(result: EntitySearchResult): number {
    return Math.max(result.components?.semantic ?? 0, result.components?.lexical ?? 0) || result.score;
}

/**
 * Whether `Find Candidate Agents` keeps a result: its semantic component reaches the floor, or it
 * has any lexical component. (The blended hybrid score is rank-based, so the action never compares
 * it with the floor.)
 *
 * @param result A search result.
 * @param floor The similarity floor.
 */
export function PassesFindCandidateAgentsFloor(result: EntitySearchResult, floor: number = FIND_CANDIDATE_AGENTS_MIN_SIMILARITY): boolean {
    const semantic = result.components?.semantic;
    return (semantic != null && semantic >= floor) || result.components?.lexical != null;
}

/**
 * What the baseline found for one request: the best-ranked candidate, floor or not, and the
 * best-ranked candidate that passes the floor, which is the first row the action returns. A result
 * that is not a candidate (an agent the user may not run, one that cannot be discovered directly,
 * or the conversation manager) is skipped, through `RankOptionsBySearch`.
 *
 * @param results The search's results, best first.
 * @param candidates The agents the action may list.
 * @param topK How many results the search was asked for.
 * @param floor The similarity floor.
 */
export function RankSemanticSearchBaseline(
    results: readonly EntitySearchResult[],
    candidates: ReadonlyArray<DiscoveryBaselineAgent>,
    topK: number = FIND_CANDIDATE_AGENTS_TOP_K,
    floor: number = FIND_CANDIDATE_AGENTS_MIN_SIMILARITY
): DiscoveryBaselineRecord {
    const options: DecisionDiscoveryOption[] = candidates.map(c => ({ ID: c.ID, Name: c.Name ?? '', Description: '' }));
    const byName = new Map(candidates.map(c => [NormalizeUUID(c.ID), c.Name]));
    const firstOf = (kept: readonly EntitySearchResult[]): DiscoveryBaselineCandidate | null => {
        const [top] = RankOptionsBySearch(options, kept.map(r => r.recordId), 1);
        return top ? baselineCandidate(results, top.ID, byName.get(NormalizeUUID(top.ID)) ?? null, floor) : null;
    };
    return {
        Floor: floor,
        TopK: topK,
        Results: results.length,
        TopRanked: firstOf(results),
        TopMatch: firstOf(results.filter(r => PassesFindCandidateAgentsFloor(r, floor)))
    };
}

/** One candidate's record, from its first result. */
function baselineCandidate(results: readonly EntitySearchResult[], agentId: string, agentName: string | null, floor: number): DiscoveryBaselineCandidate {
    const index = results.findIndex(r => NormalizeUUID(r.recordId) === NormalizeUUID(agentId));
    const result = results[index];
    return {
        AgentId: agentId,
        AgentName: agentName,
        Rank: index + 1,
        Score: FindCandidateAgentsScore(result),
        Semantic: result.components?.semantic ?? null,
        Lexical: result.components?.lexical ?? null,
        PassesFloor: PassesFindCandidateAgentsFloor(result, floor)
    };
}
