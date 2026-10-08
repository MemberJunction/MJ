import { describe, expect, it } from 'vitest';
import type { RubricCriterionPromptData } from '@memberjunction/rubrics';
import { RubricCriteriaForJudge } from '../test-driver/rubric-judge-criteria.js';

describe('RubricCriteriaForJudge', () => {
    it('keeps the key, uses the rendered text, and lists level labels lowest first', () => {
        const criteria = [
            { Key: 'grid', Name: 'Grid visible', Text: 'Grid visible: the Users grid shows rows.', Levels: [{ Label: 'Miss', NormalizedValue: 0, Anchor: null }, { Label: 'Meets', NormalizedValue: 1, Anchor: null }] },
            { Key: 'count', Name: 'Row count', Text: null, Levels: [] },
        ] as unknown as RubricCriterionPromptData[];
        const result = RubricCriteriaForJudge(criteria);
        expect(result.map(item => ({ Key: item.Key, Text: item.Text, Levels: item.Levels }))).toEqual([
            { Key: 'grid', Text: 'Grid visible: the Users grid shows rows.', Levels: ['Miss', 'Meets'] },
            { Key: 'count', Text: 'Row count', Levels: [] },
        ]);
    });
});
