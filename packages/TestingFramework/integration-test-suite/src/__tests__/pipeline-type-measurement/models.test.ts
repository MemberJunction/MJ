/**
 * models.test.ts — which model each arm expects, which answered, and the warnings when they differ:
 * the case where a missing key or a failover silently turns "Decision (Jev)" into LLM Decision.
 */
import { describe, expect, it } from 'vitest';
import {
    AssertModelsToRequire, FirstChoiceModel, FormatExpectedModel, ModelNotes, ModelWarnings, ResolveExpectedModels, SameModel, SummarizeArmModels, SummarizeModels,
} from '../../pipeline-type-measurement/models';
import type { PromptModelBinding } from '../../pipeline-type-measurement/models';
import type { ArmPrompt, ExpectedModel, MeasuredPipelineType, MeasurementOptions } from '../../pipeline-type-measurement/types';
import { Answer, EXPECTED_MODELS, RunCost } from './fixtures';

const OPTIONS: MeasurementOptions = {
    EntityName: 'MJ: Actions', TextFields: ['Name'], LabelField: 'Category', Values: ['A', 'B'], SampleSize: 4, Reps: 1, Seed: 7, BatchSize: 10,
    LLMPromptName: 'LLM prompt', DecisionPromptName: 'Default Decision', LLMModelName: null, DecisionModelName: null, RequireModel: false,
    OutDir: '/tmp/out', DryRun: false,
};

const PROMPTS: Record<MeasuredPipelineType, ArmPrompt> = {
    LLM: { PromptID: 'llm-id', FirstChoiceModel: 'Chat Model' },
    Decision: { PromptID: 'decision-id', FirstChoiceModel: 'Jev' },
};

function binding(model: string, priority: number, overrides: Partial<PromptModelBinding> = {}): PromptModelBinding {
    return { Model: model, Priority: priority, Status: 'Active', ConfigurationID: null, ...overrides };
}

describe('FirstChoiceModel', () => {
    it('takes the highest-priority binding, as the runner tries it first', () => {
        expect(FirstChoiceModel([binding('LLM Decision', 5), binding('Jev', 10)])).toBe('Jev');
    });

    it('skips inactive bindings and those tied to a configuration', () => {
        expect(FirstChoiceModel([
            binding('Jev', 10, { Status: 'Inactive' }), binding('Configured', 20, { ConfigurationID: 'config-id' }), binding('LLM Decision', 5, { Status: 'Preview' }),
        ])).toBe('LLM Decision');
    });

    it('is null for a prompt with no selectable binding', () => {
        expect(FirstChoiceModel([])).toBeNull();
        expect(FirstChoiceModel([binding('Jev', 10, { Status: 'Deprecated' })])).toBeNull();
    });
});

describe('ResolveExpectedModels', () => {
    it('takes each arm\'s prompt binding when no flag is given', () => {
        expect(ResolveExpectedModels(OPTIONS, PROMPTS)).toEqual({
            LLM: { Model: 'Chat Model', Source: 'prompt binding', From: 'prompt \'LLM prompt\'' },
            Decision: { Model: 'Jev', Source: 'prompt binding', From: 'prompt \'Default Decision\'' },
        });
    });

    it('lets a flag override the binding', () => {
        const expected = ResolveExpectedModels({ ...OPTIONS, DecisionModelName: 'LLM Decision' }, PROMPTS);
        expect(expected.Decision).toEqual({ Model: 'LLM Decision', Source: 'flag', From: '--decision-model' });
    });

    it('has no model to expect for a prompt with no binding', () => {
        const expected = ResolveExpectedModels(OPTIONS, { ...PROMPTS, LLM: { PromptID: 'llm-id', FirstChoiceModel: null } });
        expect(expected.LLM).toEqual({ Model: null, Source: 'none', From: 'prompt \'LLM prompt\'' });
        expect(FormatExpectedModel(expected.LLM)).toBe('none (prompt \'LLM prompt\' has no model bound)');
    });
});

describe('AssertModelsToRequire', () => {
    it('refuses --require-model when an arm has no model, naming the flag to pass', () => {
        const expected = ResolveExpectedModels(OPTIONS, { ...PROMPTS, LLM: { PromptID: 'llm-id', FirstChoiceModel: null } });
        expect(() => AssertModelsToRequire(expected)).toThrow(/pass --llm-model for the LLM arm/);
        expect(() => AssertModelsToRequire(EXPECTED_MODELS)).not.toThrow();
    });
});

describe('SummarizeArmModels', () => {
    const decision: ExpectedModel = EXPECTED_MODELS.Decision;

    it('counts each answering model, most first, and the answers from another model', () => {
        const answers = ['r1', 'r2', 'r3'].map((id) => Answer('Decision', 1, id, 'A'));
        const costs = new Map([
            ['Decision-1-r1', RunCost('Decision-1-r1', 0.02, 500, 'LLM Decision')],
            ['Decision-1-r2', RunCost('Decision-1-r2', 0.02, 500, 'LLM Decision')],
            ['Decision-1-r3', RunCost('Decision-1-r3', 0.001, 100, 'jev')],
        ]);
        expect(SummarizeArmModels(answers, costs, decision)).toEqual({
            Expected: decision, Answered: [{ Model: 'LLM Decision', Answers: 2 }, { Model: 'jev', Answers: 1 }], AnswersWithRun: 3, UnexpectedAnswers: 2, UnknownModelAnswers: 0,
        });
    });

    it('counts a run whose model could not be read as unknown, not as another model, and skips answers with no run', () => {
        const answers = [Answer('Decision', 1, 'r1', 'A'), { ...Answer('Decision', 1, 'r2', null), PromptRunID: null }];
        expect(SummarizeArmModels(answers, new Map(), decision)).toMatchObject({ Answered: [], AnswersWithRun: 1, UnexpectedAnswers: 0, UnknownModelAnswers: 1 });
    });
});

describe('ModelWarnings', () => {
    it('warns once per arm answered by a model other than its expected one', () => {
        const predictions = [Answer('LLM', 1, 'r1', 'A'), Answer('Decision', 1, 'r1', 'A')];
        const costs = new Map([
            ['LLM-1-r1', RunCost('LLM-1-r1', 0.01, 1000, 'Chat Model')],
            ['Decision-1-r1', RunCost('Decision-1-r1', 0.02, 500, 'LLM Decision')],
        ]);
        const warnings = ModelWarnings(SummarizeModels(predictions, costs, EXPECTED_MODELS));
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/^The Decision arm was meant to measure Jev \(from --decision-model\), but 1 of its 1 answers came from another model: LLM Decision \(1\)\./);
    });

    it('warns of an arm with no expected model that mixed models', () => {
        const predictions = [Answer('LLM', 1, 'r1', 'A'), Answer('LLM', 1, 'r2', 'A')];
        const costs = new Map([['LLM-1-r1', RunCost('LLM-1-r1', 0.01, 1000, 'Model A')], ['LLM-1-r2', RunCost('LLM-1-r2', 0.01, 1000, 'Model B')]]);
        const none: ExpectedModel = { Model: null, Source: 'none', From: 'prompt \'LLM prompt\'' };
        const summaries = SummarizeModels(predictions, costs, { ...EXPECTED_MODELS, LLM: none });
        expect(ModelWarnings(summaries)).toEqual(['The LLM arm\'s answers came from more than one model: Model A (1), Model B (1).']);
    });

    it('notes answers whose model is unknown', () => {
        const summaries = SummarizeModels([Answer('LLM', 1, 'r1', 'A')], new Map(), EXPECTED_MODELS);
        expect(ModelWarnings(summaries)).toEqual([]);
        expect(ModelNotes(summaries).join('\n')).toMatch(/LLM: 1 answer\(s\) have a prompt run whose model could not be read/);
    });
});

describe('SameModel', () => {
    it('compares names trimmed and case-insensitively, and never matches a missing name', () => {
        expect(SameModel(' Jev ', 'jev')).toBe(true);
        expect(SameModel('Jev', 'LLM Decision')).toBe(false);
        expect(SameModel(null, null)).toBe(false);
    });
});
