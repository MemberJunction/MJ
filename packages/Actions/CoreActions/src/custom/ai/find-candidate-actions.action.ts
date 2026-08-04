import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFindActionsAction } from "./base-find-actions.action";

/**
 * Finds candidate actions for a given task using semantic search.
 *
 * Backed by the unified `Provider.SearchEntity` pipeline (semantic mode over the
 * daily-synced "Actions Search" EntityDocument). Shares all behavior with
 * "Find Best Action" — see {@link BaseFindActionsAction}.
 *
 * Inputs: `TaskDescription` (required), `MaxResults` (default 10), `MinimumSimilarityScore`
 * (cosine 0-1, default 0.5), `ExcludeAgentManagement` (default true).
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Find Candidate Actions',
 *   Params: [{ Name: 'TaskDescription', Value: 'Search the internet for information' }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Candidate Actions")
export class FindCandidateActionsAction extends BaseFindActionsAction {
    protected get actionLabel(): string { return 'find candidate actions'; }
}
