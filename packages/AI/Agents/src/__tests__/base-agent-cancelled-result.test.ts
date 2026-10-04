/**
 * What a user-stopped run leaves behind.
 *
 * The Stop button marks the run's row `Cancelled` / `User Request`; the watchdog's stop relay
 * aborts the run's signal with {@link USER_CANCEL_ABORT_REASON}; `Execute`'s catch routes the
 * abort to `createCancelledResult`. Two things that result has to get right, pinned here:
 *
 * 1. `Save()` writes every column, so the reason must be set from the abort signal, or the
 *    agent's own save would overwrite the `User Request` the UI wrote with null.
 * 2. The run row only learns `FinalPayload` on a normal finish. A stop is meant to keep the
 *    work, so the payload recorded at the end of the last completed step is promoted.
 *
 * These exercise the real static helpers and the real private method on a real `BaseAgent`,
 * following `base-agent-finalize-run.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { AgentRunWatchdog, USER_CANCEL_ABORT_REASON, EXTERNAL_CANCEL_ABORT_REASON } from '../agent-run-watchdog';

interface FakeStep { StepNumber: number; PayloadAtEnd: string | null }

interface FakeRun {
    ID: string;
    Status?: string;
    CompletedAt?: Date;
    Success?: boolean;
    ErrorMessage?: string;
    CancellationReason?: string | null;
    FinalPayload?: string | null;
    Steps: FakeStep[];
    Save: ReturnType<typeof vi.fn>;
}

const RUN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function agentWithRun(run: FakeRun, abortController: AbortController | null = null): BaseAgent {
    const agent = new BaseAgent();
    const a = agent as unknown as {
        _agentRun: FakeRun;
        _runAbortController: AbortController | null;
        applyTokenStatsToRun: () => void;
        calculateTokenStats: () => unknown;
    };
    a._agentRun = run;
    a._runAbortController = abortController;
    a.applyTokenStatsToRun = () => undefined;
    a.calculateTokenStats = () => ({});
    return agent;
}

function cancel(agent: BaseAgent, reason: string) {
    return (agent as unknown as { createCancelledResult(message: string): Promise<{ success: boolean }> })
        .createCancelledResult(reason);
}

describe('BaseAgent.CancellationReasonForAbort', () => {
    it('maps the stop relay\'s user-cancel reason to User Request', () => {
        expect(BaseAgent.CancellationReasonForAbort(USER_CANCEL_ABORT_REASON)).toBe('User Request');
    });
    it('maps the wall-clock guard\'s message to Timeout', () => {
        expect(BaseAgent.CancellationReasonForAbort("Agent 'X' exceeded maxExecutionTimeMs (7200000ms)")).toBe('Timeout');
    });
    it('maps anything else (upstream token, shutdown, external cancel) to System', () => {
        expect(BaseAgent.CancellationReasonForAbort(EXTERNAL_CANCEL_ABORT_REASON)).toBe('System');
        expect(BaseAgent.CancellationReasonForAbort('upstream cancellation')).toBe('System');
        expect(BaseAgent.CancellationReasonForAbort(undefined)).toBe('System');
    });
});

describe('BaseAgent.LastStepPayload', () => {
    it('returns the payload of the highest-numbered step that recorded one', () => {
        const steps: FakeStep[] = [
            { StepNumber: 1, PayloadAtEnd: '{"a":1}' },
            { StepNumber: 3, PayloadAtEnd: null },        // the aborted step never recorded one
            { StepNumber: 2, PayloadAtEnd: '{"a":2}' },   // spawn order can interleave
        ];
        expect(BaseAgent.LastStepPayload(steps)).toBe('{"a":2}');
    });
    it('returns null with no steps or no recorded payloads', () => {
        expect(BaseAgent.LastStepPayload(null)).toBeNull();
        expect(BaseAgent.LastStepPayload([])).toBeNull();
        expect(BaseAgent.LastStepPayload([{ StepNumber: 1, PayloadAtEnd: '' }])).toBeNull();
    });
});

describe('BaseAgent.createCancelledResult', () => {
    it('records User Request and promotes the last step payload on a user stop', async () => {
        const run: FakeRun = {
            ID: RUN_ID,
            Status: 'Running',
            CancellationReason: null,
            FinalPayload: null,
            Steps: [{ StepNumber: 1, PayloadAtEnd: '{"done":["step one"]}' }, { StepNumber: 2, PayloadAtEnd: null }],
            Save: vi.fn(async () => true),
        };
        const untrack = vi.spyOn(AgentRunWatchdog.Instance, 'Untrack');

        const result = await cancel(agentWithRun(run), USER_CANCEL_ABORT_REASON);

        expect(result.success).toBe(false);
        expect(run.Status).toBe('Cancelled');
        expect(run.Success).toBe(false);
        expect(run.CancellationReason).toBe('User Request');
        expect(run.FinalPayload).toBe('{"done":["step one"]}');
        expect(run.ErrorMessage).toBe(USER_CANCEL_ABORT_REASON);
        expect(run.CompletedAt).toBeInstanceOf(Date);
        expect(run.Save).toHaveBeenCalledTimes(1);
        expect(untrack).toHaveBeenCalledWith(RUN_ID);
    });

    it('reads the reason off the run\'s abort signal when the call site passes only a location', async () => {
        // The loop's own checks pass fixed messages ('Cancelled during prompt execution'); the
        // signal the watchdog aborted is what knows it was the user.
        const controller = new AbortController();
        controller.abort(USER_CANCEL_ABORT_REASON);
        const run: FakeRun = { ID: RUN_ID, FinalPayload: null, Steps: [], Save: vi.fn(async () => true) };

        await cancel(agentWithRun(run, controller), 'Cancelled during prompt execution');

        expect(run.CancellationReason).toBe('User Request');
        expect(run.ErrorMessage).toBe('Cancelled during prompt execution');
    });

    it('keeps a FinalPayload the run already had', async () => {
        const run: FakeRun = {
            ID: RUN_ID,
            FinalPayload: '{"kept":true}',
            Steps: [{ StepNumber: 1, PayloadAtEnd: '{"older":true}' }],
            Save: vi.fn(async () => true),
        };
        await cancel(agentWithRun(run), USER_CANCEL_ABORT_REASON);
        expect(run.FinalPayload).toBe('{"kept":true}');
    });

    it('records Timeout for the wall-clock guard and leaves FinalPayload null when no step recorded one', async () => {
        const run: FakeRun = { ID: RUN_ID, FinalPayload: null, Steps: [], Save: vi.fn(async () => true) };
        await cancel(agentWithRun(run), "Agent 'X' exceeded maxExecutionTimeMs (10ms)");
        expect(run.CancellationReason).toBe('Timeout');
        expect(run.FinalPayload).toBeNull();
    });
});
