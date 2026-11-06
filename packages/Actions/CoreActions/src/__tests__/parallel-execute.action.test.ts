/**
 * Regression tests for ParallelExecuteAction.executeFirstAction (`WaitForAll: false`) timeout timer cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runActionMock = vi.fn();

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: { Instance: { RunAction: (...args: unknown[]) => runActionMock(...args) } },
}));

import { ParallelExecuteAction } from '../custom/workflow/parallel-execute.action';

type Param = { Name: string; Type: 'Input' | 'Output'; Value: unknown };
type Result = { Success: boolean; ResultCode: string; Message?: string };
type Runnable = { InternalRunAction(params: { Params: Param[]; ContextUser?: unknown }): Promise<Result> };

function runFirstWithTimeout(timeoutMs: number): Promise<Result> {
    const action = new ParallelExecuteAction() as unknown as Runnable;
    return action.InternalRunAction({
        Params: [
            {
                Name: 'Actions',
                Type: 'Input',
                Value: [
                    { ActionName: 'FastAction', Params: {} },
                    { ActionName: 'SecondAction', Params: {} },
                ],
            },
            { Name: 'WaitForAll', Type: 'Input', Value: false },
            { Name: 'Timeout', Type: 'Input', Value: timeoutMs },
        ],
    });
}

describe('ParallelExecuteAction (WaitForAll: false)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        runActionMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('clears the timeout timer when the first action succeeds before the deadline', async () => {
        runActionMock.mockResolvedValue({ Success: true, ResultCode: 'OK', Message: 'done' });

        const result = await runFirstWithTimeout(30_000);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('FIRST_SUCCESS');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the timeout timer when all actions fail before the deadline', async () => {
        runActionMock.mockResolvedValue({ Success: false, ResultCode: 'ERR', Message: 'boom' });

        const result = await runFirstWithTimeout(30_000);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ALL_FAILED');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resolves with TIMEOUT when no action finishes before the deadline and leaves no timer behind', async () => {
        runActionMock.mockImplementation(() => new Promise(() => { /* never settles */ }));

        const pending = runFirstWithTimeout(100);
        await vi.advanceTimersByTimeAsync(100);
        const result = await pending;

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('TIMEOUT');
        expect(vi.getTimerCount()).toBe(0);
    });
});
