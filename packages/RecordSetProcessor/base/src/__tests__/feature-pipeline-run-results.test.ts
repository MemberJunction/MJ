import { describe, it, expect } from 'vitest';
import { FeaturePipelineRunResults } from '../feature-pipeline-run-results';

describe('FeaturePipelineRunResults.Parse', () => {
    const counts = { Attempted: 5, Upserted: 2, Unchanged: 1, Previewed: 0 };

    it('reads a Feature Pipeline result', () => {
        expect(FeaturePipelineRunResults.Parse(JSON.stringify({ ...counts, Status: 'completed' }))).toMatchObject(counts);
    });

    it('is null for empty text, text that is not JSON, and a summary that is not a Feature Pipeline result', () => {
        expect(FeaturePipelineRunResults.Parse(null)).toBeNull();
        expect(FeaturePipelineRunResults.Parse('')).toBeNull();
        expect(FeaturePipelineRunResults.Parse('{not json')).toBeNull();
        expect(FeaturePipelineRunResults.Parse('{"unrelated":true}')).toBeNull();
    });

    it('is null when any of the four run counts is missing', () => {
        for (const missing of Object.keys(counts)) {
            const partial: Record<string, number> = { ...counts };
            delete partial[missing];
            expect(FeaturePipelineRunResults.Parse(JSON.stringify(partial)), `without ${missing}`).toBeNull();
        }
    });
});
