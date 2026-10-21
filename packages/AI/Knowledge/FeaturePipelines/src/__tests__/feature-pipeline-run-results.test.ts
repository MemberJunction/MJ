import { describe, it, expect } from 'vitest';
import { FeaturePipelineRunResults, type FeaturePipelineRecordResult } from '../versions/feature-pipeline-run-results.js';

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

describe('FeaturePipelineRunResults.Build', () => {
    const PIN = { PipelineVersion: 4, PromptVersionHash: 'pv', AIModelID: 'm', ParametersHash: 'ph' };

    it('tallies upserted, unchanged, rejectedInvalid, belowConfidence, and humanValuesPreserved', () => {
        const results: FeaturePipelineRecordResult[] = [
            { Status: 'Failed', ErrorMessage: 'Constraint violation', FailureKind: 'RejectedInvalid' },
            { Status: 'Succeeded', Outcome: 'Unchanged', HumanValuesPreserved: 1 },
            { Status: 'Succeeded', Outcome: 'Upserted', BelowConfidenceOutputs: ['S'], PipelinePin: PIN },
        ];
        const built = FeaturePipelineRunResults.Build(
            'RP-1',
            { Processed: 3, Success: 2, Error: 1, Skipped: 0 },
            results,
            'Failed',
            null,
            null,
            false,
        );
        expect(built.ResultSummary).toEqual({
            RecordProcessID: 'RP-1',
            Pin: PIN,
            Attempted: 3,
            Upserted: 1,
            Unchanged: 1,
            Previewed: 0,
            RejectedInvalid: 1,
            BelowConfidence: 1,
            Failed: 0,
            Skipped: 0,
            HumanValuesPreserved: 1,
            Status: 'failed',
        });
    });

    it('uses runPin when all records are watermark-skipped and includes WouldRefuse on dryRun', () => {
        const results: FeaturePipelineRecordResult[] = [
            { Status: 'Skipped', DurationMs: 0 },
            { Status: 'Skipped', DurationMs: 0 },
        ];
        const built = FeaturePipelineRunResults.Build(
            'RP-1',
            { Processed: 2, Success: 0, Error: 0, Skipped: 2 },
            results,
            'Completed',
            PIN,
            'v2 not activated',
            true,
        );
        expect(built.WouldRefuse).toBe('v2 not activated');
        expect(built.ResultSummary).toMatchObject({
            RecordProcessID: 'RP-1',
            Pin: PIN,
            Attempted: 0,
            Skipped: 2,
            Status: 'completed',
            WouldRefuse: 'v2 not activated',
        });
    });
});
