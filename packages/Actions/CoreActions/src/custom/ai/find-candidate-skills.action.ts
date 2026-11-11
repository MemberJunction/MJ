import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFindSkillsAction } from "./base-find-skills.action";

/**
 * Finds candidate AI Skills for a given task using hybrid semantic + full-text search
 * (backed by the `"AI Skills Search"` EntityDocument) with automatic lexical fallback.
 *
 * Returns top N matching skills hydrated with their bundled `ActionNames` and
 * `SubAgentNames` so an agent can discover and activate the right skill from catalogs
 * containing hundreds or thousands of skills without loading every skill into the prompt.
 *
 * Inputs:
 * - `TaskDescription` (required): Natural-language description of the task or capability needed.
 * - `MaxResults` (default 10, max 50): Maximum number of candidate skills to return.
 * - `MinimumSimilarityScore` (default 0.35): Minimum similarity threshold in `[0, 1]`.
 * - `Category` (optional): Filter by skill category name.
 * - `AgentID` (optional): Filter to skills eligible for a specific agent.
 * - `IncludeRequestedOnly` (optional, default false): Include `RequestedOnly` skills when `AgentID` is supplied.
 */
@RegisterClass(BaseAction, "Find Candidate Skills")
export class FindCandidateSkillsAction extends BaseFindSkillsAction {
    protected get actionLabel(): string {
        return 'find candidate skills';
    }
}
