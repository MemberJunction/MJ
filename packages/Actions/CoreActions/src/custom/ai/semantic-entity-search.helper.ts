import { RunActionParams } from "@memberjunction/actions-base";
import { Metadata } from "@memberjunction/core";
import type { EntitySearchResult, IRunViewProvider, SearchEntityParams } from "@memberjunction/core";

/**
 * Shared helpers for the "find similar by description" actions (Find Best Action,
 * Find Best Agent, Find Candidate Actions/Agents, Search Query Catalog).
 *
 * These actions used to each carry their own in-memory embedding pool (the old
 * `AgentEmbeddingService` / `ActionEmbeddingService` on `AIEngine`). They now
 * delegate ranking to the unified {@link IRunViewProvider.SearchEntity} pipeline,
 * which is backed by daily-synced `EntityDocument` vectors. This module holds the
 * thin glue they share so the wrappers stay small.
 */

/** Outcome of a semantic search attempt — ranked results on success, structured failure otherwise. */
export interface SemanticSearchOutcome {
    /** True when the search ran; false when it could not (e.g., missing provider). */
    ok: boolean;
    /** Ranked results (empty on failure). */
    results: EntitySearchResult[];
    /** Action result code to surface on failure. */
    resultCode?: string;
    /** Human-readable failure message. */
    message?: string;
}

/**
 * Runs a **semantic-only** ranked search over one entity via the invoking
 * provider's {@link IRunViewProvider.SearchEntity}.
 *
 * Semantic mode is used (rather than hybrid) because these actions are drop-in
 * replacements for the old cosine-similarity vector services: in semantic mode
 * `EntitySearchResult.score` is the raw cosine similarity (0–1), so the legacy
 * `MinimumSimilarityScore` threshold maps directly onto `minScore` and the
 * returned scores stay meaningful to existing callers.
 *
 * Prefers the caller's threaded `params.Provider` (multi-server clients,
 * request-scoped server-side providers, transaction-scoped work — e.g. the
 * GraphQL `RunAction` resolver supplies it), and falls back to the global
 * provider when none is threaded. This honors the documented
 * `RunActionParams.Provider` contract (`params.Provider ?? new Metadata()`),
 * which keeps the find-* actions working on the in-process invocation paths
 * that don't thread a provider (agents, MCP, CLI, scheduled jobs) — exactly
 * like every other action.
 */
export async function runSemanticEntitySearch(
    params: RunActionParams,
    entityName: string,
    searchText: string,
    topK: number,
    minScore: number
): Promise<SemanticSearchOutcome> {
    const md = (params.Provider ?? Metadata.Provider) as unknown as IRunViewProvider | undefined;
    if (!md) {
        return {
            ok: false,
            results: [],
            resultCode: 'MISSING_PROVIDER',
            message: 'No metadata provider available — semantic search requires a configured provider (threaded or global).',
        };
    }

    const searchParams: SearchEntityParams = {
        entityName,
        searchText,
        options: {
            mode: 'semantic',
            topK,
            minScore,
            contextUser: params.ContextUser,
        },
    };

    const results = await md.SearchEntity(searchParams);
    return { ok: true, results };
}

/** Case-insensitive lookup of a raw action parameter value. */
export function getActionParamValue(params: RunActionParams, name: string): unknown {
    const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
    return param?.Value;
}

/** Case-insensitive boolean parameter accessor with a default. */
export function getActionBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const value = getActionParamValue(params, name);
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return defaultValue;
}
