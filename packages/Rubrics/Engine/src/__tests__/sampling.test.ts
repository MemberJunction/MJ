import { describe, expect, it } from 'vitest';
import { EvaluateSampledAgentRuns, driftDeltas, keepSample, periodMeans, sampleBucket, selectSampledRuns } from '../sampling.js';

describe('production sampling', () => {
    it('keeps the same run for the same rate', () => {
        const bucket = sampleBucket('run-1');
        expect(keepSample('run-1', 0)).toBe(false);
        expect(keepSample('run-1', 1)).toBe(true);
        expect(keepSample('run-1', bucket / 10000)).toBe(false);
        expect(keepSample('run-1', (bucket + 1) / 10000)).toBe(true);
    });

    it('skips a run that already has an evaluation for that rubric', async () => {
        const chosen = selectSampledRuns({
            links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
            runs: [{ id: 'done', agentId: 'agent' }, { id: 'open', agentId: 'agent' }],
            evaluated: [{ runId: 'done', rubricId: 'rubric' }],
        });
        expect(chosen.map(row => row.runId)).toEqual(['open']);
        const evaluated: { rubricId: string; subjectRecordId: string }[] = [];
        const job = new EvaluateSampledAgentRuns({
            async load() {
                return {
                    links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
                    runs: [{ id: 'done', agentId: 'agent' }, { id: 'open', agentId: 'agent' }],
                    evaluated: [{ runId: 'done', rubricId: 'rubric' }],
                };
            },
        }, {
            async evaluateRecord(input) { evaluated.push(input); },
        });
        expect((await job.run()).map(row => row.runId)).toEqual(['open']);
        expect(evaluated).toEqual([{ rubricId: 'rubric', subjectRecordId: 'open' }]);
        expect(new EvaluateSampledAgentRuns({ async load() { return { links: [], runs: [], evaluated: [] }; } }, { async evaluateRecord() {} }).plan({
            links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
            runs: [{ id: 'open', agentId: 'agent' }],
            evaluated: [],
        }).map(row => row.runId)).toEqual(['open']);
    });

    it('alerts when the current mean drops past the threshold', () => {
        const deltas = driftDeltas(
            [{ key: 'facts', mean: 0.4 }, { key: 'tone', mean: 0.9 }],
            [{ key: 'facts', mean: 0.8 }, { key: 'tone', mean: 0.9 }],
            0.2,
        );
        expect(deltas).toEqual([
            { key: 'facts', drop: 0.4, alert: true },
            { key: 'tone', drop: 0, alert: false },
        ]);
    });
});
