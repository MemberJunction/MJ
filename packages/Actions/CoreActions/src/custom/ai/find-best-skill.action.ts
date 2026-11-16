import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFindSkillsAction } from "./base-find-skills.action";

/**
 * Finds the best-matching AI Skill(s) for a given task using hybrid semantic + full-text
 * search with automatic lexical fallback.
 *
 * Defaults `MaxResults` to `3` and populates both `BestSkill` (the single highest-scoring
 * skill) and `MatchedSkills` on the action output parameters.
 */
@RegisterClass(BaseAction, "Find Best Skill")
export class FindBestSkillAction extends BaseFindSkillsAction {
    protected get actionLabel(): string {
        return 'find best skill';
    }

    protected override get defaultMaxResults(): number {
        return 3;
    }
}
