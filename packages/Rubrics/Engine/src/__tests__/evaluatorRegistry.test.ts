import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { BaseRubricEvaluator } from '../RubricEvaluator.js';
import { RubricEngine, type RubricEvaluationStore } from '../RubricEngine.js';
import { CreateRubricEvaluator, ListRubricEvaluators, NormalizeRubricEvaluatorName, ResolveRubricEvaluatorSelection } from '../evaluatorRegistry.js';
import type { RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType } from '../evaluatorServices.js';

/** A custom evaluator, registered the way a host would register one. Scores every leaf High. */
@RegisterClass(BaseRubricEvaluator, 'Test Keyword')
class KeywordRubricEvaluator extends BaseRubricEvaluator {
    public static Seen: RubricEvaluatorContext[] = [];

    public get EvaluatorName(): string {
        return 'Test Keyword';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'External';
    }

    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        KeywordRubricEvaluator.Seen.push(context);
        const word = String(context.Settings.Extensions?.['Test Keyword'] ?? '');
        const hit = (context.Content.text ?? '').includes(word);
        const candidates = context.Version.nodes
            .filter(node => node.nodeType === 'Criterion')
            .map(node => ({ criterionId: node.id, scaleLevelId: hit ? 'high' : 'low', rationale: hit ? `Mentions ${word}.` : `Does not mention ${word}.`, evidence: [] }));
        return { ...this.Evaluate(context.Version, candidates), metadata: { Keyword: word } };
    }
}

function version(): RubricVersionSnapshot {
    return {
        id: 'version', rubricId: 'rubric', notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.5, scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [{ id: 'a', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        scales: [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels: [
            { id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 1 },
        ] }],
        bands: [],
    };
}

const scored: RubricScoreResult = {
    normalizedScore: 1, completeness: 1, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null,
    scoredCriteriaCount: 1, applicableCriteriaCount: 1, totalCriteriaCount: 1, nodes: [], scoringEngineVersion: '1.0',
};

describe('rubric evaluator registry', () => {
    it('lists the built-ins and a host-registered evaluator, with their types', () => {
        const listed = ListRubricEvaluators();
        expect(listed.map(item => item.Name)).toEqual(expect.arrayContaining(['Agent', 'Decision', 'Deterministic', 'Human', 'LLM', 'Test Keyword']));
        expect(listed.find(item => item.Name === 'Decision')).toEqual({ Name: 'Decision', Type: 'AIPrompt', IsAutomated: true });
        expect(listed.find(item => item.Name === 'Human')?.IsAutomated).toBe(false);
        expect(listed.find(item => item.Name === 'Test Keyword')?.Type).toBe('External');
    });

    it('creates by name or alias, case-insensitively, and names the registered ones when it cannot', () => {
        expect(CreateRubricEvaluator('ai').EvaluatorName).toBe('Agent');
        expect(CreateRubricEvaluator('AIPrompt').EvaluatorName).toBe('LLM');
        expect(CreateRubricEvaluator(' decision ').EvaluatorName).toBe('Decision');
        expect(NormalizeRubricEvaluatorName('AI')).toBe('Agent');
        expect(() => CreateRubricEvaluator('Nope')).toThrow(/No rubric evaluator is registered as "Nope"\. Registered: .*Decision/);
        expect(() => CreateRubricEvaluator(' ')).toThrow('An evaluator name is required.');
    });

    it('resolves an evaluator selection to a name and settings', () => {
        expect(ResolveRubricEvaluatorSelection(undefined)).toEqual({ Name: 'LLM', Settings: {} });
        expect(ResolveRubricEvaluatorSelection({ EvaluatorType: 'Agent', AgentID: 'agent-1' })).toEqual({ Name: 'Agent', Settings: { AgentID: 'agent-1' } });
        expect(ResolveRubricEvaluatorSelection('{"EvaluatorType":"AIPrompt","EvaluatorName":"Decision","PromptID":"p","ModelID":"jev"}'))
            .toEqual({ Name: 'Decision', Settings: { PromptID: 'p', ModelID: 'jev' } });
        expect(ResolveRubricEvaluatorSelection({ EvaluatorType: 'External', EvaluatorName: 'Test Keyword', Extensions: { 'Test Keyword': 'refund' } }))
            .toEqual({ Name: 'Test Keyword', Settings: { Extensions: { 'Test Keyword': 'refund' } } });
        expect(ResolveRubricEvaluatorSelection({ Mode: 'PerCriterion', Samples: 3 }).Settings).toEqual({ Mode: 'PerCriterion', Samples: 3 });
        expect(ResolveRubricEvaluatorSelection({
            EvaluatorType: 'AIPrompt', PromptName: ' Rubric Judge - Sage ', SystemPromptName: 'My Evaluator', CriterionPromptID: 'c-1', ModelSelection: 'Judge',
        })).toEqual({ Name: 'LLM', Settings: { PromptName: 'Rubric Judge - Sage', SystemPromptName: 'My Evaluator', CriterionPromptID: 'c-1', ModelSelection: 'Judge' } });
        expect(() => ResolveRubricEvaluatorSelection({ ModelSelection: 'Cheapest' })).toThrow('ModelSelection must be System or Judge, not Cheapest.');
        expect(() => ResolveRubricEvaluatorSelection({ EvaluatorType: 'Human' })).toThrow('A Human evaluation is not run by the engine.');
        expect(() => ResolveRubricEvaluatorSelection({ Mode: 'Twice' })).toThrow('Mode must be SinglePass or PerCriterion, not Twice.');
        expect(() => ResolveRubricEvaluatorSelection('[]')).toThrow('The evaluator config must be a JSON object.');
    });

    it('runs a custom evaluator end to end and stores its name, type, settings, and metadata', async () => {
        const drafts: Parameters<RubricEvaluationStore['createDraft']>[0][] = [];
        const store: RubricEvaluationStore = {
            async createDraft(input) { drafts.push(input); return { id: 'eval-custom', status: 'Draft' }; },
            async submit(_id, answers) {
                expect(answers[0].scaleLevelId).toBe('high');
                return scored;
            },
            async fail() { throw new Error('should not fail'); },
        };
        const engine = new RubricEngine(store);
        const done = await engine.Evaluate({
            version: version(),
            subject: { entityName: 'MJ: Documents', recordId: '1', entityId: 'entity' },
            content: { text: 'Asks for a refund.' },
            evaluator: 'test keyword',
            settings: { Extensions: { 'Test Keyword': 'refund' } },
        });
        expect(done.evaluation.status).toBe('Submitted');
        expect(KeywordRubricEvaluator.Seen.at(-1)?.Subject).toEqual({ entityName: 'MJ: Documents', recordId: '1' });
        expect(drafts[0]).toMatchObject({
            evaluatorType: 'External',
            evaluatorName: 'Test Keyword',
            aiPromptRunId: null,
            aiAgentRunId: null,
            metadata: { Evaluator: { Name: 'Test Keyword', Settings: { Extensions: { 'Test Keyword': 'refund' } }, Keyword: 'refund' } },
        });
    });

    it('throws before saving for an unknown name or a Human evaluator', async () => {
        const store: RubricEvaluationStore = {
            async createDraft() { throw new Error('should not save'); },
            async submit() { throw new Error('should not save'); },
            async fail() { throw new Error('should not save'); },
        };
        const engine = new RubricEngine(store);
        const params = { version: version(), subject: { entityName: 'MJ: Documents', recordId: '1', entityId: 'entity' }, content: { text: 'x' } };
        await expect(engine.Evaluate({ ...params, evaluator: 'Nope' })).rejects.toThrow('No rubric evaluator is registered as "Nope"');
        await expect(engine.Evaluate({ ...params, evaluator: 'Human' })).rejects.toThrow('The Human evaluator is completed by a person, not run by the engine.');
    });
});
