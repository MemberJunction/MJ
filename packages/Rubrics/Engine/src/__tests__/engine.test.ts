import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { FallbackContent, ShapeContent, TestRunContent } from '../content.js';
import { DeterministicRubricEvaluator } from '../DeterministicRubricEvaluator.js';
import { RubricEngine, type RubricEvaluationStore, type RubricRecords } from '../RubricEngine.js';
import { GetAgreement, GetConsensus, GetDiagnostics, KrippendorffAlpha, QuadraticKappa } from '../statistics.js';
import { FakePromptService } from './fakePromptService.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.5,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [
            { id: 'a', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0, evaluatorConfig: { Deterministic: { path: 'score', equals: 1, level: 'High' } } },
            { id: 'b', key: 'accuracy', name: 'Accuracy', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ],
        scales: [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }] }],
        bands: [],
    };
}

describe('DeterministicRubricEvaluator', () => {
    it('reads Path, Operator, Values, and the true, false, and missing results', () => {
        const tree = version();
        tree.nodes = [
            { ...tree.nodes[0], id: 'true', key: 'true', evaluatorConfig: { Deterministic: { Path: 'status', Operator: 'equals', Values: ['shipped'], LevelWhenTrue: 'High', LevelWhenFalse: 'Low' } } },
            { ...tree.nodes[0], id: 'false', key: 'false', evaluatorConfig: { Deterministic: { Path: 'status', Operator: 'equals', Values: ['held'], LevelWhenTrue: 'High', LevelWhenFalse: 'Low' } } },
            { ...tree.nodes[0], id: 'missing', key: 'missing', evaluatorConfig: { Deterministic: { Path: 'gone', Operator: 'exists', NotApplicableWhenMissing: true, LevelWhenTrue: 'High' } } },
            { ...tree.nodes[0], id: 'open', key: 'open', evaluatorConfig: { Deterministic: { Path: 'status' } } },
        ];
        tree.scales[0].levels.push({ id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 1 });
        const output = new DeterministicRubricEvaluator().EvaluateData(tree, { data: { status: 'shipped' } });
        const byId = new Map(output.answers.map(answer => [answer.criterionId, answer]));
        expect(byId.get('true')?.scaleLevelId).toBe('high');
        expect(byId.get('false')?.scaleLevelId).toBe('low');
        expect(byId.get('missing')?.isNotApplicable).toBe(true);
        expect(byId.has('open')).toBe(false);
    });

    it('leaves a leaf with no rule unanswered and does not call a model', () => {
        const output = new DeterministicRubricEvaluator().EvaluateData(version(), { data: { score: 1 } });
        expect(output.answers).toHaveLength(1);
        expect(output.answers[0].criterionId).toBe('a');
        expect(output.normalizedScore).toBe(1);
        expect(output.result.completeness).toBe(0.5);
    });
});

describe('content providers', () => {
    it('maps the columns the tables actually have and keeps fields a read already returned', () => {
        expect(TestRunContent({ input: 'q', expectedOutcomes: 'yes', actualOutput: 'no', trace: 'ran' }).data).toEqual({
            input: 'q', expectedOutcomes: 'yes', actualOutput: 'no',
        });
        expect(ShapeContent('MJ: Test Runs', {
            Input: 'wrong', ExpectedOutcomes: 'wrong', ActualOutput: 'wrong', Trace: 'wrong',
        }).data).toEqual({ input: undefined, expectedOutcomes: undefined, actualOutput: undefined });
        expect(ShapeContent('MJ: Test Runs', {
            InputData: 'q', ExpectedOutputData: 'yes', ActualOutputData: 'shipped', ResultDetails: 'trace line',
        })).toMatchObject({ text: 'trace line', data: { input: 'q', expectedOutcomes: 'yes', actualOutput: 'shipped' } });
        expect(ShapeContent('MJ: AI Agent Runs', { FinalPayload: { rows: 1 }, Turns: [{ who: 'model' }] }).data).toEqual({ finalPayload: { rows: 1 } });
        expect(ShapeContent('MJ: Conversations', { Name: 'Standup', Description: 'Shipped it', Transcript: 'fake' })).toEqual({
            text: 'Standup\nShipped it',
            data: { name: 'Standup', description: 'Shipped it' },
        });
        expect(FallbackContent({ name: 'Ada', secret: 'x' }, field => field !== 'secret').data).toEqual({ name: 'Ada' });
        expect(ShapeContent('MJ: Widgets', { name: 'Ada', secret: 'x' }).data).toEqual({ name: 'Ada', secret: 'x' });
        expect(ShapeContent('MJ: Widgets', { name: 'Ada', secret: 'x' }, field => field !== 'secret').data).toEqual({ name: 'Ada' });
        expect(ShapeContent('MJ: AI Agent Runs', { FinalPayload: { rows: 1 }, Steps: [{ StepNumber: 1 }] }).data).toEqual({ finalPayload: { rows: 1 }, steps: [{ StepNumber: 1 }] });
        expect(ShapeContent('MJ: Conversations', { Name: 'Standup', Description: 'Shipped', Details: [{ Text: 'hello' }] }).data.details).toEqual([{ Text: 'hello' }]);
    });
});

describe('RubricEngine', () => {
    it('saves a draft and submits the deterministic result', async () => {
        const calls: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft() { calls.push('draft'); return { id: 'eval-1', status: 'Draft' }; },
            async submit(_id, answers) {
                calls.push('submit');
                expect(answers).toHaveLength(1);
                return { normalizedScore: 1, completeness: 0.5, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, scoredCriteriaCount: 0, applicableCriteriaCount: 0, totalCriteriaCount: 0, nodes: [], scoringEngineVersion: '1.0' };
            },
            async fail() { throw new Error('should not fail'); },
        };
        const engine = new RubricEngine(store);
        const done = await engine.Evaluate({
            version: version(),
            subject: { entityName: 'MJ: Test Runs', recordId: '1', entityId: 'entity' },
            content: { data: { score: 1 } },
            evaluator: 'Deterministic',
        });
        expect(calls).toEqual(['draft', 'submit']);
        expect(done.evaluation.status).toBe('Submitted');
        expect(done.output?.normalizedScore).toBe(1);
    });

    it('loads a test run when content is omitted and the rule sees the actual output', async () => {
        const tree = version();
        tree.nodes[0].evaluatorConfig = { Deterministic: { path: 'actualOutput', equals: 'shipped', level: 'High' } };
        const store: RubricEvaluationStore = {
            async createDraft() { return { id: 'eval-3', status: 'Draft' }; },
            async submit() { return { normalizedScore: 1, completeness: 0.5, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, scoredCriteriaCount: 0, applicableCriteriaCount: 0, totalCriteriaCount: 0, nodes: [], scoringEngineVersion: '1.0' }; },
            async fail() { throw new Error('should not fail'); },
        };
        const done = await new RubricEngine(store).Evaluate({
            version: tree,
            subject: { entityName: 'MJ: Test Runs', recordId: 'run-1', entityId: 'entity' },
            loadRecord: async () => ({ ActualOutputData: 'shipped', InputData: 'q' }),
            evaluator: 'Deterministic',
        });
        expect(done.output?.answers[0].scaleLevelId).toBe('high');
        expect(done.output?.normalizedScore).toBe(1);
    });

    it('records a Failed evaluation when the evaluator throws', async () => {
        const failed: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft() { return { id: 'eval-2', status: 'Draft' }; },
            async submit() { throw new Error('scale missing'); },
            async fail(id, message) { failed.push(`${id}:${message}`); return { id, status: 'Failed', errorMessage: message }; },
        };
        const engine = new RubricEngine(store);
        const done = await engine.Evaluate({
            version: version(),
            subject: { entityName: 'MJ: Test Runs', recordId: '1', entityId: 'entity' },
            content: { data: { score: 1 } },
            evaluator: 'AI',
        });
        expect(done.evaluation.status).toBe('Failed');
        expect(done.evaluation.errorMessage).toMatch(/agent/);
        expect(failed[0]).toMatch(/eval-2:An Agent evaluation requires an agent runner/);
    });

    it('runs LLM SinglePass once, submits, and returns the scored draft', async () => {
        const calls: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft() { calls.push('draft'); return { id: 'eval-llm', status: 'Draft' }; },
            async submit() { calls.push('submit'); return { normalizedScore: 1, completeness: 1, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, scoredCriteriaCount: 0, applicableCriteriaCount: 0, totalCriteriaCount: 0, nodes: [], scoringEngineVersion: '1.0' }; },
            async fail() { throw new Error('should not fail'); },
        };
        const tree = version();
        tree.nodes = [tree.nodes[0]];
        const done = await new RubricEngine(store).Evaluate({
            version: tree,
            subject: { entityName: 'MJ: Documents', recordId: '1', entityId: 'entity' },
            content: { text: 'Easy to read.' },
            evaluator: 'LLM',
            settings: { Mode: 'SinglePass' },
            services: { Prompts: FakePromptService(async () => { calls.push('prompt'); return { Text: JSON.stringify({ decisions: [{ key: 'clarity', level: 'High', rationale: 'Clear.', evidence: [{ quote: 'Easy' }] }] }), PromptRunID: 'prompt-run-1' }; }) },
        });
        expect(calls.filter(call => call === 'prompt')).toHaveLength(1);
        expect(calls).toContain('submit');
        expect(done.evaluation.status).toBe('Submitted');
        expect(done.output?.normalizedScore).toBe(1);
        expect(done.output?.aiPromptRunId).toBe('prompt-run-1');
    });

    it('defaults a missing evaluator to LLM SinglePass and runs an Agent config', async () => {
        const tree = version();
        const prompts: string[] = [];
        const drafted: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft(input) {
                drafted.push(`${input.evaluatorName}:${input.evaluatorType}`);
                return { id: 'eval-choice', status: 'Draft' };
            },
            async submit() {
                return { normalizedScore: 1, completeness: 1, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, scoredCriteriaCount: 0, applicableCriteriaCount: 0, totalCriteriaCount: 0, nodes: [], scoringEngineVersion: '1.0' };
            },
            async fail() { throw new Error('should not fail'); },
        };
        const records = {
            async rows(entityName: string) {
                if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
                if (entityName === 'MJ: Rubric Versions') return [{
                    ID: 'version', RubricID: 'rubric', Status: 'Published', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0,
                    NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100, PassThreshold: 0.5,
                }];
                if (entityName === 'MJ: Entities') return [{ ID: 'entity' }];
                if (entityName === 'MJ: Rubric Criteria') return tree.nodes.map(node => ({
                    ID: node.id, Key: node.key, Name: node.name, NodeType: node.nodeType, ScaleID: node.scaleId,
                    Weight: node.weight, IsAdvisory: false, IsGate: false, Sequence: node.sequence,
                }));
                if (entityName === 'MJ: Rubric Scales') return [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }];
                if (entityName === 'MJ: Rubric Scale Levels') return [{ ID: 'high', ScaleID: 'scale', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 }];
                return [];
            },
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
        };
        const engine = new RubricEngine(store, records, {
            Prompts: FakePromptService(async input => {
                prompts.push(input.Prompt.Name ?? '');
                return { Text: JSON.stringify({ decisions: [{ key: 'clarity', level: 'High', rationale: 'Clear.', evidence: [] }] }) };
            }),
        });
        await engine.EvaluateRecord({
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
            content: { text: 'Easy to read.' },
        });
        expect(drafted).toEqual(['LLM:AIPrompt']);
        expect(prompts).toEqual(['Rubric Evaluator']);

        const agentCalls: string[] = [];
        await engine.EvaluateRecord({
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
            content: { text: 'Easy to read.' },
            evaluator: 'AI',
            agent: {
                async Run() {
                    agentCalls.push('agent');
                    return { decisions: [{ key: 'clarity', level: 'High', rationale: 'Clear.', evidence: [] }] };
                },
            },
        });
        expect(agentCalls).toEqual(['agent']);
        expect(drafted).toEqual(['LLM:AIPrompt', 'Agent:Agent']);
    });
});

    it('keeps a per-user store when another engine is constructed', async () => {
        const calls: string[] = [];
        const store = (name: string): RubricEvaluationStore => ({
            async createDraft() { calls.push(name); return { id: name, status: 'Draft' }; },
            async submit() {
                return { normalizedScore: 1, completeness: 1, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, scoredCriteriaCount: 0, applicableCriteriaCount: 0, totalCriteriaCount: 0, nodes: [], scoringEngineVersion: '1.0' };
            },
            async fail() { throw new Error('should not fail'); },
        });
        const first = new RubricEngine(store('first'));
        const second = new RubricEngine(store('second'));
        await first.Evaluate({
            version: version(),
            subject: { entityName: 'MJ: Documents', recordId: '1', entityId: 'entity' },
            content: { data: { score: 1 } },
            evaluator: 'Deterministic',
        });
        expect(calls).toEqual(['first']);
        expect(second).not.toBe(first);
        expect(RubricEngine.Instance).not.toBe(first);
    });

describe('consensus cohort', () => {
    it('filters the subject entity, excludes Self, and does not pool every context', async () => {
        const filters: string[] = [];
        const records = {
            async rows(entityName: string, filter: string) {
                filters.push(`${entityName} ${filter}`);
                if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric' }];
                if (entityName === 'MJ: Rubric Versions') return [{ ID: 'version-1', RubricID: 'rubric', Status: 'Published', MajorVersion: 1 }];
                if (entityName === 'MJ: Entities' && filter.includes('Documents')) return [{ ID: 'entity-docs' }];
                if (entityName === 'MJ: Entities' && filter.includes('Tasks')) return [{ ID: 'entity-tasks' }];
                return [];
            },
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
        };
        const engine = new RubricEngine({
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
            async submit() { throw new Error('no'); },
            async fail() { throw new Error('no'); },
        }, records);
        await engine.ConsensusForSubject({
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
        });
        const open = filters.find(filter => filter.startsWith('MJ: Rubric Evaluations'));
        expect(open).toContain("SubjectEntityID='entity-docs'");
        expect(open).toContain("EvaluatorType<>'Self'");
        expect(open).toContain('ContextEntityID IS NULL');
        expect(open).toContain('ContextRecordID IS NULL');
        await engine.ConsensusForSubject({
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
            contextEntityName: 'MJ: Tasks',
            contextRecordId: 'task-1',
        });
        const scoped = filters.filter(filter => filter.startsWith('MJ: Rubric Evaluations')).at(-1);
        expect(scoped).toContain("ContextEntityID='entity-tasks'");
        expect(scoped).toContain("ContextRecordID='task-1'");
        expect(scoped).not.toContain('ContextEntityID IS NULL');
    });
});

describe('agreement and consensus', () => {
    it('matches a hand-computed quadratic kappa of 0.4 and withholds below 20 subjects', () => {
        const pairs: [number, number][] = [
            ...Array.from({ length: 20 }, () => [0, 0] as [number, number]),
            ...Array.from({ length: 5 }, () => [0, 1] as [number, number]),
            ...Array.from({ length: 10 }, () => [1, 0] as [number, number]),
            ...Array.from({ length: 15 }, () => [1, 1] as [number, number]),
        ];
        expect(QuadraticKappa(pairs)).toBeCloseTo(0.4, 6);
        const raw: [number, number][] = [
            ...Array.from({ length: 10 }, () => [0, 0] as [number, number]),
            ...Array.from({ length: 10 }, () => [1, 1] as [number, number]),
            ...Array.from({ length: 10 }, () => [3, 3] as [number, number]),
            ...Array.from({ length: 4 }, () => [0, 1] as [number, number]),
            ...Array.from({ length: 4 }, () => [0, 3] as [number, number]),
            ...Array.from({ length: 4 }, () => [1, 3] as [number, number]),
        ];
        const remapped = raw.map(([left, right]) => [left === 3 ? 2 : left, right === 3 ? 2 : right] as [number, number]);
        expect(QuadraticKappa(raw)).not.toBeCloseTo(QuadraticKappa(remapped), 5);
        expect(QuadraticKappa(raw, 4)).toBeCloseTo(QuadraticKappa(raw), 6);
        const small = GetAgreement([[1, 1], [1, 2], [2, 2]]);
        expect(small.Withheld).toBe(true);
        expect(small.Kappa).toBeUndefined();
        expect(small.SampleSize).toBe(3);
        const enough = GetAgreement(pairs, 20);
        expect(enough.Withheld).toBe(false);
        expect(enough.Kappa).toBeCloseTo(0.4, 6);
        expect(QuadraticKappa(Array.from({ length: 20 }, () => [1, 1] as [number, number]), 2)).toBeNull();
        const singles = Array.from({ length: 18 }, () => [1]);
        const five = Array.from({ length: 5 }, () => [0, 1]);
        const gated = GetAgreement([...singles, ...five], 20);
        expect(gated.SampleSize).toBe(5);
        expect(gated.Withheld).toBe(true);
        expect(gated.Kappa).toBeUndefined();
        const described = GetAgreement([
            ...Array.from({ length: 10 }, () => [0, 0] as [number, number]),
            ...Array.from({ length: 10 }, () => [0, 1] as [number, number]),
        ], 20);
        expect(described.Withheld).toBe(false);
        expect(described.ExactAgreement).toBe(0.5);
        expect(described.MeanAbsoluteError).toBe(0.5);
        expect(described.Bias).toBe(0.5);
    });

    it('matches a hand-computed ordinal alpha of 4/9', () => {
        expect(KrippendorffAlpha([[1, 1], [1, 2], [2, 2]])).toBeCloseTo(4 / 9, 6);
    });

    it('averages scores for the mean consensus', () => {
        const result = GetConsensus([0.2, 0.4, 0.6], 'Mean');
        expect(result.Overall).toBeCloseTo(0.4, 6);
        expect(result.Range).toBeCloseTo(0.4, 6);
        expect(result.SampleSize).toBe(3);
        const perCriterion = GetConsensus([], 'Mean', 0.1, [
            { key: 'a', scores: [0.2, 0.4] },
            { key: 'b', scores: [0.8, 1] },
        ]);
        expect(perCriterion.Criteria?.[0].Mean).toBeCloseTo(0.3, 6);
        expect(perCriterion.Criteria?.[1].Mean).toBeCloseTo(0.9, 6);
        expect(perCriterion.Criteria?.[0].Range).toBeCloseTo(0.2, 6);
    });

    it('flags noise against the other criteria, and names both keys in a high correlation', () => {
        const flags = GetDiagnostics([
            { key: 'noise', scores: [0, 1, 0, 1], notApplicable: 0 },
            { key: 'a', scores: [0, 0, 1, 1], notApplicable: 0 },
            { key: 'b', scores: [0, 0, 1, 1], notApplicable: 0 },
        ]);
        expect(flags.filter(flag => flag.Flag === 'NoDiscrimination').map(flag => flag.CriterionKey)).toEqual(['noise']);
        expect(flags.filter(flag => flag.Flag === 'HighCorrelation').map(flag => `${flag.CriterionKey}:${flag.OtherKey}`).sort()).toEqual(['a:b', 'b:a']);
    });
});

describe('conversation subject scope', () => {
    function records(conversationScope?: RubricRecords['conversationScope']): RubricRecords & { reads: string[] } {
        const reads: string[] = [];
        return {
            reads,
            async rows(entityName: string) {
                reads.push(entityName);
                return entityName === 'MJ: Conversations' ? [{ ID: 'conv-1', Name: 'Standup' }] : [];
            },
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
            conversationScope,
        };
    }

    it('throws when the records cannot read the conversation scope', async () => {
        const failing = records(async () => { throw new Error('Conversation conv-1 not found'); });
        await expect(new RubricEngine(undefined, failing).SubjectContent({ subjectEntityName: 'MJ: Conversations', subjectRecordId: 'conv-1' }))
            .rejects.toThrow('subject conversation not readable');
        expect(failing.reads).not.toContain('MJ: Conversation Details');
    });

    it('throws when the records have no conversation scope reader', async () => {
        const without = records();
        await expect(new RubricEngine(undefined, without).SubjectContent({ subjectEntityName: 'MJ: Conversations', subjectRecordId: 'conv-1' }))
            .rejects.toThrow('subject conversation not readable');
        expect(without.reads).not.toContain('MJ: Conversation Details');
    });
});
