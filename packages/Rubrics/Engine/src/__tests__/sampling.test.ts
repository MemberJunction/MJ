import { describe, expect, it } from 'vitest';
import { AGENT_RUN_SUBJECT, EvaluateSampledAgentRuns, driftDeltas, driftSeries, keepSample, periodMeans, productionSamplingJob, sampleBucket, selectSampledRuns } from '../sampling.js';

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
        expect(evaluated).toEqual([{ rubricId: 'rubric', subjectRecordId: 'open', subjectEntityName: AGENT_RUN_SUBJECT }]);
        expect(new EvaluateSampledAgentRuns({ async load() { return { links: [], runs: [], evaluated: [] }; } }, { async evaluateRecord() {} }).plan({
            links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
            runs: [{ id: 'open', agentId: 'agent' }],
            evaluated: [],
        }).map(row => row.runId)).toEqual(['open']);
    });

    it('does not sample a link whose purpose is Evaluation', async () => {
        const evaluated: { rubricId: string; subjectRecordId: string; subjectEntityName: string }[] = [];
        const job = productionSamplingJob({
            async links() {
                return [
                    { agentId: 'agent', rubricId: 'eval-rubric', sampleRate: 1, status: 'Active', purpose: 'Evaluation' },
                    { agentId: 'agent', rubricId: 'sample-rubric', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling' },
                ];
            },
            async runs() {
                return [{ id: 'open', agentId: 'agent', status: 'Completed' }, { id: 'live', agentId: 'agent', status: 'Running' }];
            },
            async evaluated() { return []; },
        }, {
            async evaluateRecord(input) { evaluated.push(input); },
        });
        expect((await job.run()).map(row => row.rubricId)).toEqual(['sample-rubric']);
        expect(evaluated).toEqual([{ rubricId: 'sample-rubric', subjectRecordId: 'open', subjectEntityName: AGENT_RUN_SUBJECT }]);
    });

    it('keeps two agents that scored the same criterion as two series', () => {
        const at = '2026-10-01T00:00:00.000Z';
        const rows = driftSeries({
            scores: [
                { evaluationId: 'e1', criterionId: 'facts', normalizedScore: 0.2 },
                { evaluationId: 'e2', criterionId: 'facts', normalizedScore: 0.8 },
            ],
            evaluations: [
                { id: 'e1', subjectRecordId: 'run-a', rubricId: 'rubric', at },
                { id: 'e2', subjectRecordId: 'run-b', rubricId: 'rubric', at },
            ],
            runs: [
                { id: 'run-a', agentId: 'agent-a' },
                { id: 'run-b', agentId: 'agent-b' },
            ],
        });
        const means = periodMeans(rows, '2026-09-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
        expect(means.map(row => row.key).sort()).toEqual(['agent-a|rubric|facts', 'agent-b|rubric|facts']);
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
