/**
 * A finished run must leave the AgentRunWatchdog's tracked set the moment it leaves `Running`.
 *
 * The watchdog heart-beats every tracked run on a timer and keeps its sweep scheduled while any run
 * is tracked, so a run that stays tracked after it finishes keeps the database busy for the life of
 * the process (one heartbeat statement every interval, each updating zero rows). These pin every
 * terminal path of the real `BaseAgent` methods: the normal finalize (Completed, Failed,
 * AwaitingFeedback, Paused), the failure and cancellation results, and `Execute`'s own teardown,
 * which must untrack even when a subclass's `finalizeRun` hook throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';
import { AgentRunWatchdog } from '../agent-run-watchdog';
import type { BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

const RUN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

interface FakeRun {
    ID: string;
    Status: string;
    Success?: boolean;
    CompletedAt?: Date;
    ErrorMessage?: string | null;
    FinalPayload?: string | null;
    FinalPayloadObject?: object | null;
    Steps: [];
    Save: ReturnType<typeof vi.fn>;
}

/** The private members of a real BaseAgent these tests drive or stub. */
interface AgentInternals {
    _agentRun: FakeRun;
    _awaitingWorkflowTaskID: string | null;
    applyTokenStatsToRun: () => void;
    calculateTokenStats: () => object;
    cachePriorTurnToolResults: () => void;
    startPostTurnCompaction: () => void;
    finalizeRun: (outcome: string) => Promise<void>;
    finalizeAgentRun: (finalStep: BaseAgentNextStep) => Promise<{ success: boolean }>;
    createFailureResult: (message: string) => Promise<{ success: boolean }>;
    endRun: (params: ExecuteAgentParams) => Promise<void>;
}

/** A provider whose agent-run reads always report the run still Running, so only an Untrack can drop it. */
const mockProviderShape = {
    Dialect: {
        ProcedureCallSyntax: (schema: string, name: string, args: string[]) => `EXEC [${schema}].[${name}] ${args.join(', ')}`,
        QuoteStringLiteral: (v: string) => `'${v}'`,
    },
    EntityByName: () => ({ SchemaName: '__mj' }),
    ExecuteSQL: vi.fn().mockResolvedValue([]),
    RunView: vi.fn(async (params: { ExtraFilter: string }) =>
        ({ Success: true, Results: /Status='Running'/.test(params.ExtraFilter) ? [{ ID: RUN_ID }] : [] })),
};
const mockProvider = mockProviderShape as unknown as DatabaseProviderBase;
const mockUser = {} as UserInfo;

function resetWatchdog(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__AgentRunWatchdog'];
    delete g['___SINGLETON__ShutdownRegistry'];
}

/** A real BaseAgent holding a run that the watchdog is guarding, with persistence stubbed out. */
function trackedAgent(): { agent: BaseAgent; internals: AgentInternals; run: FakeRun } {
    const agent = new BaseAgent();
    const internals = agent as unknown as AgentInternals;
    const run: FakeRun = { ID: RUN_ID, Status: 'Running', Steps: [], Save: vi.fn(async () => true) };
    internals._agentRun = run;
    internals._awaitingWorkflowTaskID = null;
    internals.applyTokenStatsToRun = () => undefined;
    internals.calculateTokenStats = () => ({});
    internals.cachePriorTurnToolResults = () => undefined;
    internals.startPostTurnCompaction = () => undefined;
    AgentRunWatchdog.Instance.Track(RUN_ID, mockProvider, mockUser, new AbortController());
    return { agent, internals, run };
}

describe('BaseAgent untracks the run from the watchdog on every terminal path', () => {
    beforeEach(() => {
        resetWatchdog();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it.each([
        { step: 'Success', parked: false, status: 'Completed' },
        { step: 'Failed', parked: false, status: 'Failed' },
        { step: 'Chat', parked: false, status: 'AwaitingFeedback' },
        { step: 'Success', parked: true, status: 'Paused' },
    ] satisfies Array<{ step: BaseAgentNextStep['step']; parked: boolean; status: string }>)('finalizeAgentRun leaving the run $status untracks it and stops the heartbeat', async ({ step, parked, status }) => {
        const { internals, run } = trackedAgent();
        internals._awaitingWorkflowTaskID = parked ? 'dddddddd-dddd-dddd-dddd-dddddddddddd' : null;

        const finalStep: BaseAgentNextStep = { step, terminate: true };
        await internals.finalizeAgentRun(finalStep);

        expect(run.Status).toBe(status);
        expect(run.Save).toHaveBeenCalledTimes(1);
        expect(AgentRunWatchdog.Instance.TrackedCount).toBe(0);
        expect(AgentRunWatchdog.Instance.HasActiveRunTimers).toBe(false);
    });

    it('createFailureResult leaving the run Failed untracks it', async () => {
        const { internals, run } = trackedAgent();

        const result = await internals.createFailureResult('boom');

        expect(result.success).toBe(false);
        expect(run.Status).toBe('Failed');
        expect(AgentRunWatchdog.Instance.TrackedCount).toBe(0);
    });

    it("Execute's teardown untracks the run even when the subclass finalizeRun hook throws", async () => {
        const { internals, run } = trackedAgent();
        run.Status = 'Completed';
        internals.finalizeRun = async () => {
            throw new Error('sandbox teardown failed');
        };

        await expect(internals.endRun({} as ExecuteAgentParams)).rejects.toThrow('sandbox teardown failed');

        expect(AgentRunWatchdog.Instance.TrackedCount).toBe(0);
        expect(AgentRunWatchdog.Instance.HasActiveRunTimers).toBe(false);
    });

    it('once every run has finished, the watchdog stops heart-beating it (and, with the sweep off, issues nothing)', async () => {
        AgentRunWatchdog.Instance.Configure({ sweepIntervalMs: 0 });
        const { internals } = trackedAgent();
        await internals.finalizeAgentRun({ step: 'Success', terminate: true });
        mockProviderShape.ExecuteSQL.mockClear();
        mockProviderShape.RunView.mockClear();

        await vi.advanceTimersByTimeAsync(60 * 60_000);

        expect(mockProviderShape.ExecuteSQL).not.toHaveBeenCalled();
        expect(mockProviderShape.RunView).not.toHaveBeenCalled();
    });
});
