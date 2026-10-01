import { describe, expect, it } from 'vitest';
import { decideSelfCheck } from '../self-check.js';

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
});
