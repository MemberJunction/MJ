import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DriftSeriesInput } from './rubric-drift-series';

describe('drift screen criterion keys', () => {
    it('uses the criterion Key, not the score name and not the id', () => {
        const input = DriftSeriesInput(
            [{ EvaluationID: 'eval', CriterionID: '11111111-1111-4111-8111-111111111111', Criterion: 'Facts name', NormalizedScore: 0.4 }],
            [{ ID: '11111111-1111-4111-8111-111111111111', Key: 'facts', Name: 'Facts name' }],
        );
        expect(input.scores[0].criterionKey).toBe('facts');
        expect(input.scores[0].criterionKey).not.toBe('Facts name');
        expect(input.criteria).toEqual([{ id: '11111111-1111-4111-8111-111111111111', key: 'facts' }]);
    });

    it('loads period means for the drift screen and reports them to the agent', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rubric-drift.component.ts'), 'utf8');
        expect(source).toContain("QueryName: 'RubricDriftPeriodMeans'");
        expect(source).toContain('DriftPeriodRows');
        expect(source).toContain('SetAgentContext');
    });
});
