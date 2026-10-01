import { describe, expect, it } from 'vitest';
import { draftWorld, publishedWorld, RUBRIC_WORLD, rubricWorldCriteria, scorePublishedMet } from '../rubricWorld.js';

describe('rubric world', () => {
    it('names a stable world a person can open in Explorer', () => {
        expect(RUBRIC_WORLD.rubric).toBe('IT World — Agent evaluation');
        expect(rubricWorldCriteria().map(criterion => criterion.key)).toEqual(['accuracy', 'sourcing', 'completeness']);
    });

    it('passes a published tree when every leaf is Met, and the draft is a Major 2.0.0', () => {
        const scored = scorePublishedMet();
        expect(scored.outcome).toBe('Passed');
        expect(scored.normalizedScore).toBe(1);
        expect(scored.bump).toBe('Major');
        expect(scored.nextVersion).toBe('2.0.0');
        expect(publishedWorld().nodes.find(node => node.key === 'accuracy')?.weight).toBe(1);
        expect(draftWorld().nodes.find(node => node.key === 'accuracy')?.weight).toBe(2);
    });
});
