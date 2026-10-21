import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateRecord = vi.hoisted(() => vi.fn(async () => ({ evaluationId: 'new-eval' })));
const views = vi.hoisted(() => [] as { EntityName: string }[]);

vi.mock('@memberjunction/rubrics', () => ({
    ProviderRubricEngine: () => ({ evaluateRecord, EvaluateRecord: evaluateRecord }),
    RegisterRubricAgentRunner: () => undefined,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    let evaluationReads = 0;
    return {
        ...actual,
        RunView: class {
            public static FromMetadataProvider(): InstanceType<typeof this> {
                return new this();
            }
            async RunView(params: { EntityName: string }) {
                views.push(params);
                if (params.EntityName === 'MJ: Rubric Evaluations') {
                    evaluationReads += 1;
                    const human = { ID: 'human', SubjectRecordID: 'subject', RubricVersionID: 'version', EvaluatorType: 'Human', Status: 'Submitted' };
                    const oldAi = { ID: 'old-ai', SubjectRecordID: 'subject', RubricVersionID: 'version', EvaluatorType: 'AIPrompt', Status: 'Submitted' };
                    const created = { ID: 'new-eval', SubjectRecordID: 'subject', RubricVersionID: 'version', EvaluatorType: 'AIPrompt', Status: 'Submitted' };
                    return { Success: true, Results: evaluationReads === 1 ? [human, oldAi] : [human, oldAi, created] };
                }
                if (params.EntityName === 'MJ: Rubric Versions') {
                    return { Success: true, Results: [{ ID: 'version', RubricID: 'rubric', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0, Status: 'Published' }] };
                }
                if (params.EntityName === 'MJ: Rubric Evaluation Scores') {
                    return { Success: true, Results: [
                        { EvaluationID: 'new-eval', CriterionID: 'criterion', NormalizedScore: 0 },
                        { EvaluationID: 'old-ai', CriterionID: 'criterion', NormalizedScore: 1 },
                        { EvaluationID: 'human', CriterionID: 'criterion', NormalizedScore: 1 },
                    ] };
                }
                if (params.EntityName === 'MJ: Rubric Criteria') {
                    return { Success: true, Results: [{ ID: 'criterion', Key: 'facts' }] };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

import { CalibrationEvaluatorConfig, RubricCalibrationTestDriver } from '../drivers/RubricCalibrationTestDriver.js';

describe('RubricCalibrationTestDriver', () => {
    beforeEach(() => {
        evaluateRecord.mockClear();
        views.length = 0;
    });

    it('scores again with the named evaluator and ignores an older AI evaluation', async () => {
        const driver = new RubricCalibrationTestDriver();
        driver.Provider = {} as never;
        const result = await driver.Execute({
            test: {
                ID: 'test-1',
                InputDefinition: JSON.stringify({
                    rubricId: 'rubric',
                    goldSet: { subjects: [{ entity: 'MJ: Documents', recordID: 'subject' }] },
                    evaluator: { type: 'Deterministic' },
                }),
                ExpectedOutcomes: JSON.stringify({ minSampleSize: 1 }),
            },
            contextUser: { ID: 'user' },
        } as never);
        expect(evaluateRecord).toHaveBeenCalledTimes(1);
        expect(evaluateRecord.mock.calls[0][0]).toMatchObject({
            evaluatorConfig: { EvaluatorName: 'Deterministic' },
            contextEntityName: 'MJ: Tests',
            contextRecordId: 'test-1',
            subjectRecordId: 'subject',
        });
        expect(result.oracleResults[0].details).toMatchObject({ meanAbsoluteError: 1, sampleSize: 1 });
    });
});

describe('CalibrationEvaluatorConfig', () => {
    it('reads the older type as the evaluator name and passes a selection through', () => {
        expect(CalibrationEvaluatorConfig(undefined)).toBeUndefined();
        expect(CalibrationEvaluatorConfig({ type: 'AI' })).toEqual({ EvaluatorName: 'AI' });
        expect(CalibrationEvaluatorConfig({ EvaluatorName: 'Decision', ModelID: 'jev' })).toEqual({ EvaluatorName: 'Decision', ModelID: 'jev' });
        expect(CalibrationEvaluatorConfig({ type: 'LLM', EvaluatorType: 'Agent' })).toEqual({ EvaluatorType: 'Agent' });
    });
});
