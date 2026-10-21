import { describe, expect, it, vi } from 'vitest';
import { RubricScoring, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { AIRubricEvaluator, type RubricAgent } from '../AIRubricEvaluator.js';
import { HumanRubricEvaluator } from '../HumanRubricEvaluator.js';
import { RubricEvaluator } from '../RubricEvaluator.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.5,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [
            { id: 'a', key: 'clarity', name: 'Clarity', guidance: 'Look at the first sentence.', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0, evaluatorConfig: { AI: { Hints: 'Quote the sentence.' } } },
            { id: 'b', key: 'accuracy', name: 'Accuracy', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ],
        scales: [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'low', label: 'Low', value: 1, normalizedValue: 0.25, sequence: 0 },
                { id: 'high', label: 'High', value: 2, normalizedValue: 1, sequence: 1 },
            ],
        }],
        bands: [],
    };
}

describe('RubricEvaluator', () => {
    it('returns the RubricScoring score, the rationale, and the evidence refs', () => {
        const tree = version();
        const output = new RubricEvaluator().Evaluate(tree, [
            { criterionId: 'a', scaleLevelId: 'high', rationale: 'Clear.', evidence: [{ ref: 'doc:1' }] },
            { criterionId: 'b', scaleLevelId: 'low', rationale: 'Thin.', evidence: [{ ref: 'doc:2' }] },
        ]);
        const direct = RubricScoring.Compute({
            version: tree,
            answers: [
                { criterionId: 'a', scaleLevelId: 'high' },
                { criterionId: 'b', scaleLevelId: 'low' },
            ],
        });
        expect(output.normalizedScore).toBe(direct.normalizedScore);
        expect(output.result.outcome).toBe(direct.outcome);
        expect(output.rationale).toBe('Clear.\nThin.');
        expect(output.evidence.map(item => item.ref)).toEqual(['doc:1', 'doc:2']);
    });
});

describe('AIRubricEvaluator', () => {
    it('asks the agent once per criterion and scores through RubricScoring', async () => {
        const calls: string[] = [];
        const agent: RubricAgent = {
            async run(input) {
                calls.push(input.criterionKey);
                if (input.criterionKey === 'clarity') {
                    expect(input.criterionName).toBe('Clarity');
                    expect(input.guidance).toBe('Look at the first sentence.');
                    expect(input.scale?.levels.map(level => level.label)).toEqual(['Low', 'High']);
                    expect(input.subject).toEqual({ entityName: 'MJ: Documents', recordId: '1' });
                    expect(input.hints).toBe('Quote the sentence.');
                }
                return {
                    level: input.criterionKey === 'clarity' ? 'High' : 'Low',
                    rationale: input.criterionKey,
                    evidence: [{ ref: `ev:${input.criterionKey}` }],
                };
            },
        };
        const output = await new AIRubricEvaluator(agent).EvaluateVersion(
            { version: version(), subject: { entityName: 'MJ: Documents', recordId: '1' }, content: { text: 'The text.' } },
        );
        expect(calls).toEqual(['clarity', 'accuracy']);
        const direct = RubricScoring.Compute({
            version: version(),
            answers: [
                { criterionId: 'a', scaleLevelId: 'high' },
                { criterionId: 'b', scaleLevelId: 'low' },
            ],
        });
        expect(output.normalizedScore).toBe(direct.normalizedScore);
        expect(output.evidence.map(item => item.ref)).toEqual(['ev:clarity', 'ev:accuracy']);
    });

    it('refuses an unknown level before scoring', async () => {
        const spy = vi.spyOn(RubricScoring, 'Compute');
        const agent: RubricAgent = {
            async run() {
                return { level: 'Outstanding', rationale: 'No such level.', evidence: [{ ref: 'ev:1', quote: 'text' }] };
            },
        };
        await expect(new AIRubricEvaluator(agent).EvaluateVersion({
            version: version(),
            subject: { entityName: 'MJ: Documents', recordId: '1' },
            content: { text: 'The text.' },
        })).rejects.toThrow(/unknown level/);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('refuses evidence without a quote when the criterion requires one, before scoring', async () => {
        const spy = vi.spyOn(RubricScoring, 'Compute');
        const tree = version();
        tree.nodes[0].evaluatorConfig = { AI: { RequireQuote: true } };
        const agent: RubricAgent = {
            async run() {
                return { level: 'High', rationale: 'Clear.', evidence: [{ ref: 'ev:1' }] };
            },
        };
        await expect(new AIRubricEvaluator(agent).EvaluateVersion({
            version: tree,
            subject: { entityName: 'MJ: Documents', recordId: '1' },
            content: { text: 'The text.' },
        })).rejects.toThrow(/quote/);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('HumanRubricEvaluator', () => {
    it('creates a draft evaluation and a task for the assignee, and does not score', async () => {
        const drafts: unknown[] = [];
        const tasks: unknown[] = [];
        const human = new HumanRubricEvaluator(
            { async createDraft(input) { drafts.push(input); return { id: 'eval-1' }; } },
            { async create(input) { tasks.push(input); return { id: 'task-1' }; } },
        );
        const started = await human.Start({
            versionId: 'version',
            rubricId: 'rubric',
            rubricName: 'Writing',
            subjectEntityId: 'entity',
            subjectRecordId: 'record',
            assigneeId: 'person-1',
        });
        expect(started).toEqual({ evaluationId: 'eval-1', taskId: 'task-1' });
        expect(drafts).toEqual([{
            versionId: 'version',
            rubricId: 'rubric',
            rubricName: 'Writing',
            subjectEntityId: 'entity',
            subjectRecordId: 'record',
            assigneeId: 'person-1',
        }]);
        expect(tasks).toEqual([{ assigneeId: 'person-1', evaluationId: 'eval-1', title: 'Score Writing' }]);
    });
});
