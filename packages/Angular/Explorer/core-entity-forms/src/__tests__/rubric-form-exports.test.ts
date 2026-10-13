import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const exported = [
    'MJRubricFormComponentExtended',
    'RubricFormPolicy',
    'RubricAuthorPanel',
    'RubricDiffPanel',
    'RubricPublishPanel',
    'RubricVersionsPanel',
    'MJRubricEvaluationFormComponentExtended',
    'RubricEvaluationComparePanel',
    'RubricEvaluationFormPolicy',
    'RubricEvaluationResultPanel',
    'MJRubricScaleFormComponentExtended',
    'RubricScaleFormPolicy',
    'RubricScaleLevelsPanel',
    'MJRubricVersionFormComponentExtended',
    'RubricVersionFormPolicy',
    'RubricVersionSummaryPanel',
    'MJRubricCriterionFormComponentExtended',
    'MJRubricEvaluationScoreFormComponentExtended',
    'MJRubricScaleLevelFormComponentExtended',
    'MJRubricBandFormComponentExtended',
    'MJRubricCategoryFormComponentExtended',
    'MJAIAgentRubricFormComponentExtended',
];

describe('rubric form public API', () => {
    it('exports every registered rubric form class by name', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public-api.ts'), 'utf8');
        for (const name of exported) {
            expect(source, name).toMatch(new RegExp(`\\b${name}\\b`));
        }
    });
});
