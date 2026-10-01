import { describe, expect, it } from 'vitest';
import { decideSelfCheck, executeSelfCheck, type SelfCheckEngine, type SelfCheckValidation } from '../self-check.js';

const link = { purpose: 'SelfCheck', status: 'Active', maxAttempts: 2 };

describe('agent self-check', () => {
    it('skips when there is no Active SelfCheck link', () => {
        expect(decideSelfCheck({ agentKind: 'loop', link: null, attempt: 1, passed: false }).action).toBe('skip');
        expect(decideSelfCheck({ agentKind: 'loop', link: { purpose: 'Evaluation', status: 'Active' }, attempt: 1, passed: false }).action).toBe('skip');
    });

    it('retries a loop agent once, then fails without dropping the reason', () => {
        const failed = [{ key: 'accuracy', rationale: 'The figure is wrong.' }];
        const first = decideSelfCheck({ agentKind: 'loop', link, attempt: 1, passed: false, failedCriteria: failed });
        expect(first.action).toBe('retry');
        expect(first.message).toMatch(/accuracy/);
        const second = decideSelfCheck({ agentKind: 'loop', link, attempt: 2, passed: false, failedCriteria: failed });
        expect(second.action).toBe('fail');
        expect(second.message).toMatch(/The figure is wrong/);
    });

    it('records a flow-agent failure and does not retry', () => {
        const decision = decideSelfCheck({ agentKind: 'flow', link, attempt: 1, passed: false, failedCriteria: [{ key: 'evidence' }] });
        expect(decision.action).toBe('fail');
    });

    it('accepts a passing score', () => {
        expect(decideSelfCheck({ agentKind: 'loop', link, attempt: 1, passed: true }).action).toBe('accept');
    });

    it('records one evaluation and keeps Success when the score passes', async () => {
        const steps: SelfCheckValidation[] = [];
        const seen: unknown[] = [];
        const engine: SelfCheckEngine = {
            async evaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval-pass', outcome: 'Passed', criteria: [] };
            },
        };
        const done = await executeSelfCheck({
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
        expect(steps).toEqual([{ stepType: 'Validation', evaluationId: 'eval-pass', passed: true, message: '' }]);
    });

    it('records one failing evaluation and does not call the miss a scoring failure', async () => {
        const steps: SelfCheckValidation[] = [];
        const engine: SelfCheckEngine = {
            async evaluateRecord() {
                return { evaluationId: 'eval-fail', outcome: 'GateFailed', criteria: [{ key: 'accuracy', rationale: 'The figure is wrong.' }] };
            },
        };
        const done = await executeSelfCheck({
            engine,
            link: { ...link, rubricId: 'rubric', passThreshold: null },
            runId: 'run-1',
            agentKind: 'flow',
            attempt: 1,
            record: step => steps.push(step),
        });
        expect(done.step).toBe('Failed');
        expect(steps[0].passed).toBe(false);
        expect(steps[0].evaluationId).toBe('eval-fail');
        expect(steps[0].message).toMatch(/accuracy/);
        expect(steps[0].message).not.toMatch(/could not score/i);
    });
});
