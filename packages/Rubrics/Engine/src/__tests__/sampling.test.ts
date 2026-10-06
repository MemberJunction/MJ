import { describe, expect, it } from 'vitest';
import { AGENT_RUN_SUBJECT, EvaluateSampledAgentRuns, DriftDeltas, DriftSeries, KeepSample, PeriodMeans, ProductionSamplingJob, SampleBucket, SelectSampledRuns } from '../sampling.js';
import { ResolveRubricEvaluatorSelection } from '../evaluatorRegistry.js';

describe('production sampling', () => {
    it('does not treat a broken evaluator config as missing', () => {
        expect(() => ResolveRubricEvaluatorSelection('{')).toThrow('The evaluator config is not valid JSON.');
        expect(ResolveRubricEvaluatorSelection('{"EvaluatorType":"Deterministic"}').Name).toBe('Deterministic');
    });

    it('keeps the same run for the same rate', () => {
        const bucket = SampleBucket('run-1');
        expect(KeepSample('run-1', 0)).toBe(false);
        expect(KeepSample('run-1', 1)).toBe(true);
        expect(KeepSample('run-1', bucket / 10000)).toBe(false);
        expect(KeepSample('run-1', (bucket + 1) / 10000)).toBe(true);
    });

    it('skips a run that already has an evaluation for that rubric', async () => {
        const chosen = SelectSampledRuns({
            links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
            runs: [{ id: 'done', agentId: 'agent' }, { id: 'open', agentId: 'agent' }],
            evaluated: [{ runId: 'done', rubricId: 'rubric' }],
        });
        expect(chosen.map(row => row.RunId)).toEqual(['open']);
        const evaluated: { rubricId: string; subjectRecordId: string }[] = [];
        const job = new EvaluateSampledAgentRuns({
            async Load() {
                return {
                    links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
                    runs: [{ id: 'done', agentId: 'agent' }, { id: 'open', agentId: 'agent' }],
                    evaluated: [{ runId: 'done', rubricId: 'rubric' }],
                };
            },
        }, {
            async EvaluateRecord(input) { evaluated.push(input); },
        });
        expect((await job.Run()).map(row => row.RunId)).toEqual(['open']);
        expect(evaluated).toEqual([{
            rubricId: 'rubric',
            subjectRecordId: 'open',
            subjectEntityName: AGENT_RUN_SUBJECT,
        }]);
        expect(new EvaluateSampledAgentRuns({ async Load() { return { links: [], runs: [], evaluated: [] }; } }, { async EvaluateRecord() {} }).Plan({
            links: [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active' }],
            runs: [{ id: 'open', agentId: 'agent' }],
            evaluated: [],
        }).map(row => row.RunId)).toEqual(['open']);
    });

    it('does not sample a link whose purpose is Evaluation', async () => {
        const evaluated: { rubricId: string; subjectRecordId: string; subjectEntityName: string }[] = [];
        const job = ProductionSamplingJob({
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
            async versions() { return []; },
        }, {
            async EvaluateRecord(input) { evaluated.push(input); },
        });
        expect((await job.Run()).map(row => row.RubricId)).toEqual(['sample-rubric']);
        expect(evaluated).toEqual([{
            rubricId: 'sample-rubric',
            subjectRecordId: 'open',
            subjectEntityName: AGENT_RUN_SUBJECT,
        }]);
    });

    it('skips a run whose evaluation points at the rubric only through RubricVersionID', async () => {
        const evaluated: unknown[] = [];
        const job = ProductionSamplingJob({
            async links() {
                return [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling' }];
            },
            async runs() {
                return [{ id: 'open', agentId: 'agent', status: 'Completed' }];
            },
            async evaluated() {
                return [{ runId: 'open', rubricVersionId: 'version-1' }];
            },
            async versions() {
                return [{ id: 'version-1', rubricId: 'rubric' }];
            },
        }, {
            async EvaluateRecord(input) { evaluated.push(input); },
        });
        expect(await job.Run()).toEqual([]);
    });

    it('uses the agent rubric evaluator and defaults a missing one to LLM SinglePass', async () => {
        const evaluated: { evaluatorConfig?: unknown; rubricId: string }[] = [];
        const job = ProductionSamplingJob({
            async links() {
                return [
                    { agentId: 'agent', rubricId: 'plain', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling' },
                    { agentId: 'agent', rubricId: 'rules', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling', evaluatorConfig: { EvaluatorType: 'Deterministic' } },
                    { agentId: 'agent', rubricId: 'each', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling', evaluatorConfig: '{"EvaluatorType":"AIPrompt","Mode":"PerCriterion"}' },
                ];
            },
            async runs() { return [{ id: 'open', agentId: 'agent', status: 'Completed' }]; },
            async evaluated() { return []; },
            async versions() { return []; },
        }, {
            async EvaluateRecord(input) { evaluated.push(input); },
        });
        await job.Run();
        expect(evaluated).toEqual([
            { rubricId: 'plain', subjectRecordId: 'open', subjectEntityName: AGENT_RUN_SUBJECT },
            { rubricId: 'rules', subjectRecordId: 'open', subjectEntityName: AGENT_RUN_SUBJECT, evaluatorConfig: { EvaluatorType: 'Deterministic' } },
            { rubricId: 'each', subjectRecordId: 'open', subjectEntityName: AGENT_RUN_SUBJECT, evaluatorConfig: '{"EvaluatorType":"AIPrompt","Mode":"PerCriterion"}' },
        ]);
        expect(evaluated.map(item => ResolveRubricEvaluatorSelection(item.evaluatorConfig))).toEqual([
            { Name: 'LLM', Settings: {} },
            { Name: 'Deterministic', Settings: {} },
            { Name: 'LLM', Settings: { Mode: 'PerCriterion' } },
        ]);
    });

    it('keeps two agents that scored the same criterion as two series', () => {
        const at = '2026-10-01T00:00:00.000Z';
        const rows = DriftSeries({
            scores: [
                { evaluationId: 'e1', criterionId: 'facts', normalizedScore: 0.2 },
                { evaluationId: 'e2', criterionId: 'facts', normalizedScore: 0.8 },
            ],
            evaluations: [
                { id: 'e1', subjectRecordId: 'run-a', rubricVersionId: 'version-1', at },
                { id: 'e2', subjectRecordId: 'run-b', rubricVersionId: 'version-1', at },
            ],
            runs: [
                { id: 'run-a', agentId: 'agent-a' },
                { id: 'run-b', agentId: 'agent-b' },
            ],
            versions: [{ id: 'version-1', rubricId: 'rubric' }],
        });
        const means = PeriodMeans(rows, '2026-09-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
        expect(means.map(row => row.key).sort()).toEqual(['agent-a|rubric|facts', 'agent-b|rubric|facts']);
        const keyed = DriftSeries({
            scores: [{ evaluationId: 'e1', criterionId: '11111111-1111-4111-8111-111111111111', normalizedScore: 0.2 }],
            criteria: [{ id: '11111111-1111-4111-8111-111111111111', key: 'facts' }],
            evaluations: [{ id: 'e1', subjectRecordId: 'run-a', rubricVersionId: 'version-1', at }],
            runs: [{ id: 'run-a', agentId: 'agent-a' }],
            versions: [{ id: 'version-1', rubricId: 'rubric' }],
        });
        expect(keyed.map(row => row.key)).toEqual(['agent-a|rubric|facts']);
    });

    it('keeps a recent agent, caps the volume, batches the lookup, and continues after a failure', async () => {
        const batches: string[][] = [];
        const evaluated: string[] = [];
        const job = ProductionSamplingJob({
            async links() {
                return [
                    { agentId: 'keep', rubricId: 'rubric', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling' },
                    { agentId: 'drop', rubricId: 'rubric', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling' },
                ];
            },
            async runs() {
                return [
                    { id: 'old', agentId: 'keep', status: 'Completed', startedAt: '2026-09-01T00:00:00.000Z' },
                    { id: 'a', agentId: 'keep', status: 'Completed', startedAt: '2026-10-01T00:00:00.000Z' },
                    { id: 'b', agentId: 'keep', status: 'Completed', startedAt: '2026-10-01T12:00:00.000Z' },
                    { id: 'other', agentId: 'drop', status: 'Completed', startedAt: '2026-10-01T00:00:00.000Z' },
                ];
            },
            async evaluated(runIds) { batches.push([...runIds]); return []; },
            async versions() { return []; },
        }, {
            async EvaluateRecord(input) {
                evaluated.push(input.subjectRecordId);
                if (input.subjectRecordId === 'a') throw new Error('boom');
            },
        }, {
            Now: new Date('2026-10-02T00:00:00.000Z'),
            AgentIds: ['keep'],
            VolumeCap: 1,
            EvaluatedBatchSize: 1,
        });
        expect((await job.Run()).map(row => row.RunId)).toEqual(['a']);
        expect(evaluated).toEqual(['a']);
        expect(job.Failures).toEqual([{ runId: 'a', message: 'boom' }]);
        expect(batches).toEqual([['a'], ['b']]);
    });

    it('passes the agent runner when the config is Agent', async () => {
        const agent = { async Run() { return {}; } };
        const seen: unknown[] = [];
        const job = ProductionSamplingJob({
            async links() {
                return [{ agentId: 'agent', rubricId: 'rubric', sampleRate: 1, status: 'Active', purpose: 'ProductionSampling', evaluatorConfig: { EvaluatorType: 'Agent' } }];
            },
            async runs() { return [{ id: 'open', agentId: 'agent', status: 'Completed' }]; },
            async evaluated() { return []; },
            async versions() { return []; },
        }, {
            async EvaluateRecord(input) { seen.push(input.agent); },
        }, { Agent: agent });
        await job.Run();
        expect(seen).toEqual([agent]);
    });

    it('alerts when the current mean drops past the threshold', () => {
        const deltas = DriftDeltas(
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
