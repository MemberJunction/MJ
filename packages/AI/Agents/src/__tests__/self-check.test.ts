import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RubricEngine, type RubricRecords } from '@memberjunction/rubrics';
import type { RubricScoreResult } from '@memberjunction/rubrics-base';
import { DecideSelfCheck, ExecuteSelfCheck, PickSelfCheckLink, type SelfCheckEngine, type SelfCheckValidation } from '../self-check.js';

const link = { Purpose: 'SelfCheck', Status: 'Active', MaxAttempts: 2 };

describe('PickSelfCheckLink', () => {
    it('picks the Active SelfCheck link with the lowest id', () => {
        const picked = PickSelfCheckLink([
            { ID: 'bbbbbbbb-0000-0000-0000-000000000002', Purpose: 'SelfCheck', Status: 'Active', RubricID: 'second' },
            { ID: 'aaaaaaaa-0000-0000-0000-000000000001', Purpose: 'SelfCheck', Status: 'Active', RubricID: 'first' },
            { ID: '00000000-0000-0000-0000-000000000000', Purpose: 'Evaluation', Status: 'Active', RubricID: 'other' },
        ]);
        expect(picked?.RubricID).toBe('first');
    });
});

describe('agent self-check', () => {
    it('does not keep camelCase aliases of the decision helpers', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../self-check.ts'), 'utf8');
        expect(source).not.toContain('export function decideSelfCheck');
        expect(source).not.toContain('export async function executeSelfCheck');
    });

    it('skips when there is no Active SelfCheck link', () => {
        expect(DecideSelfCheck({ agentKind: 'loop', link: null, attempt: 1, passed: false }).Action).toBe('skip');
        expect(DecideSelfCheck({ agentKind: 'loop', link: { Purpose: 'Evaluation', Status: 'Active' }, attempt: 1, passed: false }).Action).toBe('skip');
    });

    it('retries a loop agent once when max attempts is 1, then fails without dropping the reason', () => {
        const failed = [{ Key: 'accuracy', Rationale: 'The figure is wrong.' }];
        const once = { ...link, MaxAttempts: 1 };
        const first = DecideSelfCheck({ agentKind: 'loop', link: once, attempt: 1, passed: false, failedCriteria: failed });
        expect(first.Action).toBe('retry');
        expect(first.Message).toMatch(/accuracy/);
        const second = DecideSelfCheck({ agentKind: 'loop', link: once, attempt: 2, passed: false, failedCriteria: failed });
        expect(second.Action).toBe('fail');
        expect(second.Message).toMatch(/The figure is wrong/);
    });

    it('records a flow-agent failure and does not change Success', () => {
        const decision = DecideSelfCheck({ agentKind: 'flow', link, attempt: 1, passed: false, failedCriteria: [{ Key: 'evidence' }] });
        expect(decision.Action).toBe('record');
    });

    it('accepts a passing score', () => {
        expect(DecideSelfCheck({ agentKind: 'loop', link, attempt: 1, passed: true }).Action).toBe('accept');
    });

    it('records one evaluation and keeps Success when the score passes', async () => {
        const steps: SelfCheckValidation[] = [];
        const seen: unknown[] = [];
        const engine: SelfCheckEngine = {
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval-pass', outcome: 'Passed', criteria: [] };
            },
        };
        const done = await ExecuteSelfCheck({
            engine,
            link: { ...link, rubricId: 'rubric', passThreshold: 0.6 },
            runId: 'run-1',
            agentKind: 'flow',
            attempt: 1,
            record: step => steps.push(step),
        });
        expect(seen).toEqual([{
            rubricId: 'rubric',
            subjectEntityName: 'MJ: AI Agent Runs',
            subjectRecordId: 'run-1',
            evaluator: 'LLM',
            passThreshold: 0.6,
        }]);
        expect(done.step).toBe('Success');
        expect(steps).toEqual([{ StepType: 'Validation', EvaluationId: 'eval-pass', Passed: true, Message: '' }]);
    });

    it('records one failing evaluation and keeps the rationale from the real engine result', async () => {
        const steps: SelfCheckValidation[] = [];
        const score: RubricScoreResult = {
            normalizedScore: 0, completeness: 1, outcome: 'GateFailed', passed: false, gateFailed: true,
            passThresholdApplied: 0.6, bandId: null, confidence: null, scoringEngineVersion: '1.0',
            nodes: [{ id: 'criterion', key: 'accuracy', normalizedScore: 0, effectiveWeight: 1, overallContribution: 0, gateFailed: true, isNotApplicable: false, isAdvisory: false }],
        };
        const records: RubricRecords = {
            async rows(entityName, filter) {
                if (entityName === 'MJ: Rubrics') return [{ ID: 'rubric', Name: 'Writing' }];
                if (entityName === 'MJ: Rubric Versions' && filter.includes("Status='Published'")) return [{
                    ID: 'version', RubricID: 'rubric', MajorVersion: 1, MinorVersion: 0, PatchVersion: 0, Status: 'Published',
                    NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 100, PassThreshold: 0.6,
                }];
                if (entityName === 'MJ: Rubric Criteria') return [{
                    ID: 'criterion', RubricVersionID: 'version', Key: 'accuracy', Name: 'Accuracy', NodeType: 'Criterion',
                    ScaleID: 'scale', Weight: 1, IsGate: 1, GateMinimumScore: 0.6, IsAdvisory: 0, Sequence: 0,
                }];
                if (entityName === 'MJ: Rubric Scales') return [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: 1 }];
                if (entityName === 'MJ: Rubric Scale Levels') return [{ ID: 'miss', ScaleID: 'scale', Label: 'Miss', Value: 0, NormalizedValue: 0, Sequence: 0 }];
                if (entityName === 'MJ: Entities') return [{ ID: 'entity', Name: 'MJ: AI Agent Runs' }];
                if (entityName === 'MJ: AI Agent Runs') return [{ ID: 'run-1' }];
                return [];
            },
            async createDraft() { return { id: 'draft', status: 'Draft' }; },
        };
        const engine = new RubricEngine({
            async createDraft() { return { id: 'eval-fail', status: 'Draft' }; },
            async submit() { return score; },
            async fail() { throw new Error('should not fail the draft'); },
        }, records, { async Run() { return JSON.stringify({ decisions: [{ key: 'accuracy', level: 'Miss', rationale: 'The figure is wrong.' }] }); } });
        const done = await ExecuteSelfCheck({
            engine,
            link: { ...link, rubricId: 'rubric', passThreshold: null },
            runId: 'run-1',
            agentKind: 'flow',
            attempt: 1,
            record: step => steps.push(step),
        });
        expect(done.step).toBe('Success');
        expect(steps[0].Passed).toBe(false);
        expect(steps[0].EvaluationId).toBe('eval-fail');
        expect(steps[0].Message).toBe('accuracy: The figure is wrong.');
        expect(steps[0].Message).not.toMatch(/could not score/i);
    });

    it('sends the in-memory message and payload instead of an empty stored run', async () => {
        const seen: unknown[] = [];
        const engine: SelfCheckEngine = {
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval-live', outcome: 'Passed', criteria: [] };
            },
        };
        await ExecuteSelfCheck({
            engine,
            link: { ...link, MaxAttempts: 1, rubricId: 'rubric', passThreshold: null },
            runId: 'run-1',
            agentKind: 'loop',
            attempt: 1,
            candidate: { message: 'The answer is 4.', payload: { rows: [1] } },
            record: () => undefined,
        });
        expect(seen).toEqual([{
            rubricId: 'rubric',
            subjectEntityName: 'MJ: AI Agent Runs',
            subjectRecordId: 'run-1',
            evaluator: 'LLM',
            passThreshold: null,
            content: {
                text: 'The answer is 4.',
                data: { message: 'The answer is 4.', finalPayload: { rows: [1] } },
            },
        }]);
    });
});
