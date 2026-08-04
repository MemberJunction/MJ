import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFindAgentsAction } from "./base-find-agents.action";

/**
 * Finds the best-matching AI agents for a given task using semantic search.
 *
 * @deprecated Prefer the generic **Search Entity** action
 * (`SearchEntity({ entityName: 'MJ: AI Agents', searchText, options })`). This action
 * is retained as a thin, backward-compatible wrapper around `Provider.SearchEntity`
 * (semantic mode, backed by the daily-synced "AI Agents Search" EntityDocument),
 * with run-permission filtering and Sub-Agent exclusion preserved.
 *
 * Inputs: `TaskDescription` (required), `MaxResults` (default 5), `MinimumSimilarityScore`
 * (cosine 0-1, default 0.5), `IncludeInactive` (default false).
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Find Best Agent',
 *   Params: [{ Name: 'TaskDescription', Value: 'Research market trends' }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Best Agent")
export class FindBestAgentAction extends BaseFindAgentsAction {
    protected get actionLabel(): string { return 'find best agent'; }
}
