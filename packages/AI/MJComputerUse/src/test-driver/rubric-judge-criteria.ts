import { RubricJudgeCriterion } from '@memberjunction/computer-use';
import type { RubricCriterionPromptData } from '@memberjunction/rubrics';

/** A rubric's leaves as the in-run judge reads them: key, the rendered criterion text, level labels lowest first. */
export function RubricCriteriaForJudge(criteria: RubricCriterionPromptData[]): RubricJudgeCriterion[] {
    return criteria.map(item => {
        const criterion = new RubricJudgeCriterion();
        criterion.Key = item.Key;
        criterion.Text = item.Text ?? item.Name;
        criterion.Levels = item.Levels.map(level => level.Label);
        return criterion;
    });
}
