import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRubricEvaluator, type RubricEvaluatorContext } from '@memberjunction/rubrics';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { CandidatesFromVerdicts, ComputerUseRubricEvaluator } from '../rubric/ComputerUseRubricEvaluator.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'v', rubricId: 'r', notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.7, scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [
            { id: 'a', key: 'grid', name: 'The grid is visible', nodeType: 'Criterion', scaleId: 's', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
            { id: 'b', key: 'filter', name: 'The filter is applied', nodeType: 'Criterion', scaleId: 's', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ],
        scales: [{ id: 's', scaleType: 'Levels', higherIsBetter: true, levels: [
            { id: 'miss', label: 'Miss', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'partial', label: 'Partial', value: 1, normalizedValue: 0.5, sequence: 1 },
            { id: 'meets', label: 'Meets', value: 2, normalizedValue: 1, sequence: 2 },
        ] }],
        bands: [],
    };
}

describe('CandidatesFromVerdicts', () => {
    it('maps by key with the chosen level, by name without a key, and met to the top or bottom level', () => {
        const { candidates, unmatched } = CandidatesFromVerdicts(version(), [
            { key: 'grid', criterion: 'The grid is visible', met: false, level: 'Partial', evidence: 'half the rows' },
            { criterion: 'The filter is applied', met: true, evidence: 'chip shown' },
            { key: 'nope', criterion: 'Unknown', met: true },
        ]);
        expect(candidates).toEqual([
            { criterionId: 'a', scaleLevelId: 'partial', rationale: 'half the rows', evidence: [] },
            { criterionId: 'b', scaleLevelId: 'meets', rationale: 'chip shown', evidence: [] },
        ]);
        expect(unmatched).toEqual(['nope']);
    });
});

describe('ComputerUseRubricEvaluator', () => {
    it('is registered under ComputerUse and scores the run verdicts through RubricScoring', async () => {
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseRubricEvaluator, 'ComputerUse')).toBeTruthy();
        const evaluator = new ComputerUseRubricEvaluator();
        expect(evaluator.EvaluatorType).toBe('AIPrompt');
        const context = {
            Version: version(),
            Subject: { entityName: 'MJ: Test Runs', recordId: 'run' },
            Settings: {},
            Services: {},
            Content: { data: { finalJudgePromptRunId: 'prompt-run-9', criteriaVerdicts: [
                { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows' },
                { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Miss', evidence: 'none' },
            ] } },
        } as unknown as RubricEvaluatorContext;
        const run = await evaluator.EvaluateRubric(context);
        expect(run.normalizedScore).toBe(0.5);
        expect(run.result.outcome).toBe('BelowThreshold');
        expect(run.aiPromptRunId).toBe('prompt-run-9');
        expect(run.metadata).toEqual({ Source: 'ComputerUseJudge', Unmatched: [] });
    });

    it('fails when the run has no verdicts', async () => {
        const context = { Version: version(), Subject: { entityName: 'MJ: Test Runs', recordId: 'run' }, Settings: {}, Services: {}, Content: { data: {} } } as unknown as RubricEvaluatorContext;
        await expect(new ComputerUseRubricEvaluator().EvaluateRubric(context)).rejects.toThrow('The run produced no rubric verdicts.');
    });
});
