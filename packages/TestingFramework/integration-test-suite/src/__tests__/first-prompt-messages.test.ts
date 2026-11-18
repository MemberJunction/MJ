/**
 * first-prompt-messages.test.ts — FirstPromptMessages fails loudly instead of returning [].
 *
 * It returned [] when the run had no Prompt step or the prompt-run read failed, so a caller saw
 * "expected 1, got 0" with no hint that nothing was read. Its two decisions are pure functions,
 * pinned here: each failure throws naming the agent run.
 */
import { describe, it, expect } from 'vitest';
import type { RunViewResult } from '@memberjunction/core';
import { FirstPromptRunId, PromptRunMessagesFromResult } from '../checks/agent-live-shared';

const RUN_ID = 'run-42';

function messagesResult(partial: Partial<RunViewResult<{ Messages: string | null }>>): RunViewResult<{ Messages: string | null }> {
    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', ...partial };
}

describe('FirstPromptRunId', () => {
    it('returns the TargetLogID of the first Prompt step that has one', () => {
        expect(FirstPromptRunId([
            { StepType: 'Actions', TargetLogID: 'log-1' },
            { StepType: 'Prompt', TargetLogID: null },
            { StepType: 'Prompt', TargetLogID: 'pr-1' },
            { StepType: 'Prompt', TargetLogID: 'pr-2' },
        ], RUN_ID)).toBe('pr-1');
    });

    it('throws naming the run when there is no Prompt step', () => {
        expect(() => FirstPromptRunId([{ StepType: 'Actions', TargetLogID: 'log-1' }], RUN_ID)).toThrow(/run-42.*no Prompt step/);
    });

    it('throws when the run has no steps at all', () => {
        expect(() => FirstPromptRunId([], RUN_ID)).toThrow(/run-42/);
    });
});

describe('PromptRunMessagesFromResult', () => {
    it('decodes the prompt run Messages', () => {
        const messages = PromptRunMessagesFromResult(
            messagesResult({ Results: [{ Messages: JSON.stringify([{ role: 'system', content: 'hi' }]) }] }), RUN_ID, 'pr-1');
        expect(messages).toEqual([{ role: 'system', content: 'hi' }]);
    });

    it('throws with the provider error and the run id when the read failed', () => {
        expect(() => PromptRunMessagesFromResult(messagesResult({ Success: false, ErrorMessage: 'Invalid column' }), RUN_ID, 'pr-1'))
            .toThrow(/pr-1.*run-42.*Invalid column/);
    });

    it('throws when the prompt run row is missing', () => {
        expect(() => PromptRunMessagesFromResult(messagesResult({ Results: [] }), RUN_ID, 'pr-1')).toThrow(/pr-1.*run-42.*not found/);
    });
});
