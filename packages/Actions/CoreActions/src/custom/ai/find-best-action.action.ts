import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFindActionsAction } from "./base-find-actions.action";

/**
 * Finds the best-matching actions for a given task using semantic search.
 *
 * @deprecated Prefer the generic **Search Entity** action
 * (`SearchEntity({ entityName: 'MJ: Actions', searchText, options })`). This action
 * is retained as a thin, backward-compatible wrapper around `Provider.SearchEntity`
 * (semantic mode, backed by the daily-synced "Actions Search" EntityDocument).
 *
 * Inputs: `TaskDescription` (required), `MaxResults` (default 10), `MinimumSimilarityScore`
 * (cosine 0-1, default 0.5), `ExcludeAgentManagement` (default true).
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Find Best Action',
 *   Params: [{ Name: 'TaskDescription', Value: 'Search the internet for information' }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Best Action")
export class FindBestActionAction extends BaseFindActionsAction {
    protected get actionLabel(): string { return 'find best action'; }
}
