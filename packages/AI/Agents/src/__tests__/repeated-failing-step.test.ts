/**
 * The repeated-failing-step guard's pure parts (#4832): what makes two decisions "the same", what
 * counts as a failure, and how the count moves.
 */
import { describe, it, expect } from 'vitest';
import type { BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import {
    FailingStepError,
    FailingStepSignature,
    IsFailingStepOutcome,
    IsPromptTurnStep,
    MAX_REPEATED_FAILING_STEP,
    RepeatedFailingStepTracker,
} from '../repeated-failing-step';

const actions = (params: Record<string, unknown>, toolCallId?: string): BaseAgentNextStep => ({
    step: 'Actions',
    terminate: false,
    actions: [{ name: 'Lookup', params, toolCallId }],
    reasoning: `reasoning ${toolCallId ?? ''}`,
});
const failed: BaseAgentNextStep = { step: 'Failed', terminate: false, errorMessage: 'bad condition' };
const succeeded: BaseAgentNextStep = { step: 'Retry', terminate: false, priorStepResult: [{ actionName: 'Lookup', success: true, message: 'ok' }] };
const blocked: BaseAgentNextStep = {
    step: 'Retry',
    terminate: false,
    priorStepResult: [{ actionName: 'Lookup', success: false, message: 'disabled for these inputs', breakerReason: 'identical-arguments' }],
};

describe('FailingStepSignature', () => {
    it('ignores key order, tool-call IDs and reasoning', () => {
        expect(FailingStepSignature(actions({ a: 1, b: { c: 2, d: 3 } }, 'call-1')))
            .toBe(FailingStepSignature(actions({ b: { d: 3, c: 2 }, a: 1 }, 'call-2')));
    });

    it('tells apart different inputs and different step types', () => {
        expect(FailingStepSignature(actions({ a: 1 }))).not.toBe(FailingStepSignature(actions({ a: 2 })));
        expect(FailingStepSignature({ step: 'While', terminate: false })).not.toBe(FailingStepSignature({ step: 'ForEach', terminate: false }));
    });
});

describe('IsFailingStepOutcome', () => {
    it('counts a Failed step and an Actions step the breaker fully blocked', () => {
        expect(IsFailingStepOutcome({ step: 'While', terminate: false }, failed)).toBe(true);
        expect(IsFailingStepOutcome(actions({}), blocked)).toBe(true);
    });

    it('does not count dispatched action results, or a partly blocked step', () => {
        expect(IsFailingStepOutcome(actions({}), succeeded)).toBe(false);
        const partly: BaseAgentNextStep = {
            ...blocked,
            priorStepResult: [...(blocked.priorStepResult as object[]), { actionName: 'Other', success: true, message: 'ok' }],
        };
        expect(IsFailingStepOutcome(actions({}), partly)).toBe(false);
    });
});

describe('FailingStepError', () => {
    it("uses the step's error, else the breaker's messages", () => {
        expect(FailingStepError(failed)).toBe('bad condition');
        expect(FailingStepError(blocked)).toBe('disabled for these inputs');
    });
});

describe('IsPromptTurnStep', () => {
    it('treats Retry, Failed and Success as prompt turns, not decisions', () => {
        expect(IsPromptTurnStep({ step: 'Retry', terminate: false })).toBe(true);
        expect(IsPromptTurnStep({ step: 'Failed', terminate: false })).toBe(true);
        expect(IsPromptTurnStep({ step: 'Success', terminate: false })).toBe(true);
        expect(IsPromptTurnStep(actions({}))).toBe(false);
    });
});

describe('RepeatedFailingStepTracker', () => {
    it('counts the same failing decision up to the limit', () => {
        const tracker = new RepeatedFailingStepTracker();
        const counts = Array.from({ length: MAX_REPEATED_FAILING_STEP }, () => tracker.Observe(actions({ a: 1 }), blocked));
        expect(counts).toEqual([1, 2, 3]);
    });

    it('starts over on a different decision and resets on a success', () => {
        const tracker = new RepeatedFailingStepTracker();
        tracker.Observe(actions({ a: 1 }), blocked);
        tracker.Observe(actions({ a: 1 }), blocked);
        expect(tracker.Observe(actions({ a: 2 }), blocked)).toBe(1);
        expect(tracker.Observe(actions({ a: 2 }), succeeded)).toBe(0);
        expect(tracker.Observe(actions({ a: 2 }), blocked)).toBe(1);
    });
});
