import { DriftDeltas, DriftSeries, KeepSample, PeriodMeans, SampleBucket } from '../sampling.js';

describe('browser-safe sampling', () => {
    it('keeps a run only when its bucket falls inside the rate', () => {
        const bucket = SampleBucket('run-1');
        expect(KeepSample('run-1', 0)).toBe(false);
        expect(KeepSample('run-1', 1)).toBe(true);
        expect(KeepSample('run-1', bucket / 10000)).toBe(false);
        expect(KeepSample('run-1', (bucket + 1) / 10000)).toBe(true);
    });

    it('joins a score to its agent and rubric, then measures a drop', () => {
        const rows = DriftSeries({
            scores: [{ evaluationId: 'eval', criterionId: 'accuracy', normalizedScore: 0.4 }],
            evaluations: [{ id: 'eval', subjectRecordId: 'run', rubricVersionId: 'version', at: '2026-10-02T00:00:00Z' }],
            runs: [{ id: 'run', agentId: 'agent' }],
            versions: [{ id: 'version', rubricId: 'rubric' }],
        });
        expect(rows).toEqual([{ key: 'agent|rubric|accuracy', score: 0.4, at: '2026-10-02T00:00:00Z' }]);
        const means = PeriodMeans(rows, '2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z');
        expect(DriftDeltas(means, [{ key: 'agent|rubric|accuracy', mean: 0.9 }], 0.2)).toEqual([
            { key: 'agent|rubric|accuracy', drop: 0.5, alert: true },
        ]);
    });
});
