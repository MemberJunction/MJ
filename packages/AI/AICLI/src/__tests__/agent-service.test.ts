/**
 * Unit tests for AgentService.ExecuteAgent — what `mj ai agents run` does with a single prompt:
 * Flow agents run to completion in this process unless asked to run in the background, the result
 * names the agent run, stdout stays free for the result, and `--timeout` is honoured.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

const mocks = vi.hoisted(() => ({
    runAgent: vi.fn(),
    initialize: vi.fn(),
    agents: [] as Array<{ ID: string; Name: string; Description?: string }>,
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = mocks.runAgent;
    },
}));

vi.mock('../lib/mj-provider', () => ({
    InitializeMJProvider: mocks.initialize,
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    RunView: class {
        RunView = vi.fn(async (params: { ExtraFilter?: string }) => {
            const match = /Name = '(.*)'/.exec(params.ExtraFilter ?? '');
            const results = match ? mocks.agents.filter(a => a.Name === match[1].replace(/''/g, "'")) : mocks.agents;
            return { Success: true, Results: results };
        });
    },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Users: [{ ID: 'user-1', Name: 'Builder' }] },
}));

// The real logger writes files under .mj-ai/logs in the working directory.
vi.mock('../lib/execution-logger', () => ({
    ExecutionLogger: class {
        LogStep = vi.fn();
        LogError = vi.fn();
        Finalize = vi.fn();
        GetExecutionId = () => 'exec-1';
        GetLogFilePath = () => '/ws/.mj-ai/logs/exec-1_execution.log';
    },
}));

import { AgentService } from '../services/AgentService';
import { CANCELLATION_GRACE_MS } from '../lib/run-deadline';

const FLOW_AGENT = { ID: 'agent-1', Name: 'Lead Intake Flow' };

/** What the runner returns for a run that finished. */
function finishedRun(status: string, message: string | null, payload?: object): ExecuteAgentResult {
    return {
        success: status === 'Completed' || status === 'Paused',
        payload,
        agentRun: { ID: 'run-1', Status: status, Message: message, ErrorMessage: status === 'Failed' ? 'Step failed' : null },
    } as unknown as ExecuteAgentResult;
}

/** The parameters the service handed the runner on its most recent call. */
function lastRunParams(): ExecuteAgentParams {
    const calls = mocks.runAgent.mock.calls;
    return calls[calls.length - 1][0] as ExecuteAgentParams;
}

describe('AgentService.ExecuteAgent', () => {
    let stdoutWrite: ReturnType<typeof vi.spyOn>;
    let stderrWrite: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mocks.agents = [FLOW_AGENT];
        mocks.initialize.mockReset();
        mocks.initialize.mockResolvedValue({});
        mocks.runAgent.mockReset();
        stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // A top-level Flow run defaults to the dispatcher and returned before any step had run.
    it('asks a Flow agent to run its steps in this process by default', async () => {
        mocks.runAgent.mockResolvedValue(finishedRun('Completed', 'Flow completed - no more paths to follow', { leads: 3 }));

        await new AgentService().ExecuteAgent('Lead Intake Flow', 'Process the new leads');

        const params = lastRunParams();
        expect(params.agentTypeParams).toEqual({ executionMode: 'inRun' });
        expect(params.agent).toMatchObject(FLOW_AGENT);
        expect(params.conversationMessages).toEqual([{ role: 'user', content: 'Process the new leads' }]);
        expect(params.contextUser).toMatchObject({ ID: 'user-1' });
    });

    it('leaves the workflow to the dispatcher with Background', async () => {
        mocks.runAgent.mockResolvedValue(finishedRun('Paused', "Started **Lead Intake** — 3 task(s) running. I'll follow up when it finishes."));

        const result = await new AgentService().ExecuteAgent('Lead Intake Flow', 'Process the new leads', { Background: true });

        expect(lastRunParams().agentTypeParams).toBeUndefined();
        expect(result.success).toBe(true);
        expect(result.AgentRunStatus).toBe('Paused');
    });

    it('reports the run ID, final status and final payload', async () => {
        mocks.runAgent.mockResolvedValue(finishedRun('Completed', 'Flow completed - no more paths to follow', { leads: 3 }));

        const result = await new AgentService().ExecuteAgent('Lead Intake Flow', 'Process the new leads');

        expect(result).toMatchObject({
            success: true,
            entityName: 'Lead Intake Flow',
            AgentRunID: 'run-1',
            AgentRunStatus: 'Completed',
            result: 'Flow completed - no more paths to follow',
            FinalPayload: { leads: 3 },
            executionId: 'exec-1',
        });
    });

    it('reports a failed run as a failed result, not a thrown error', async () => {
        mocks.runAgent.mockResolvedValue(finishedRun('Failed', null));

        const result = await new AgentService().ExecuteAgent('Lead Intake Flow', 'go');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Step failed');
        expect(result.AgentRunID).toBe('run-1');
        expect(result.AgentRunStatus).toBe('Failed');
    });

    // --format json parses stdout, and progress lines ahead of the document made it unparseable.
    it('writes nothing to stdout while the agent runs', async () => {
        mocks.runAgent.mockImplementation(async (params: ExecuteAgentParams) => {
            await params.onAgentRunCreated?.('run-1');
            params.onProgress?.({ step: 'prompt_execution', message: 'Classifying', metadata: { stepCount: 1 } });
            console.log('framework chatter');
            return finishedRun('Completed', 'done');
        });

        await new AgentService().ExecuteAgent('Lead Intake Flow', 'go');

        expect(stdoutWrite).not.toHaveBeenCalled();
        const progress = stderrWrite.mock.calls.map((call: unknown[]) => String(call[0])).join('');
        expect(progress).toContain('Classifying');
        expect(progress).toContain('Agent run run-1 started');
        expect(progress).not.toContain('framework chatter');
    });

    it('sends framework output to stderr, not stdout, when verbose', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.runAgent.mockImplementation(async () => {
            console.log('framework detail');
            return finishedRun('Completed', 'done');
        });

        await new AgentService().ExecuteAgent('Lead Intake Flow', 'go', { verbose: true });

        expect(stdoutWrite).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith('framework detail');
    });

    it('cancels the run when the timeout elapses and reports it as timed out, naming the run', async () => {
        vi.useFakeTimers();
        mocks.runAgent.mockImplementation((params: ExecuteAgentParams) => new Promise<ExecuteAgentResult>((resolve) => {
            void params.onAgentRunCreated?.('run-1');
            params.cancellationToken?.addEventListener('abort', () => resolve(finishedRun('Cancelled', null)));
        }));

        const pending = new AgentService().ExecuteAgent('Lead Intake Flow', 'go', { timeout: 1000 });
        await vi.advanceTimersByTimeAsync(1000);
        const result = await pending;

        const params = lastRunParams();
        expect(params.cancellationToken?.aborted).toBe(true);
        expect(String(params.cancellationToken?.reason)).toContain('--timeout of 1000ms elapsed');
        // The framework's own limit sits just past ours, so ours is the one that fires.
        expect(params.maxExecutionTimeMs).toBe(1000 + CANCELLATION_GRACE_MS);
        expect(result).toMatchObject({ success: false, TimedOut: true, AgentRunID: 'run-1', AgentRunStatus: 'Cancelled' });
        expect(result.error).toContain('Timed out after 1000ms');
    });

    it('stops waiting for a run that ignores cancellation, and says it may still be running', async () => {
        vi.useFakeTimers();
        mocks.runAgent.mockImplementation((params: ExecuteAgentParams) => {
            void params.onAgentRunCreated?.('run-7');
            return new Promise<ExecuteAgentResult>(() => undefined);
        });

        const pending = new AgentService().ExecuteAgent('Lead Intake Flow', 'go', { timeout: 1000 });
        await vi.advanceTimersByTimeAsync(1000 + CANCELLATION_GRACE_MS);
        const result = await pending;

        expect(result).toMatchObject({ success: false, TimedOut: true, AgentRunID: 'run-7', AgentRunStatus: 'Running' });
        expect(result.error).toContain('may still be running');
        expect(result.error).toContain('mj ai audit agent-run run-7');

        // The abandoned run keeps reporting; none of it may appear after the result.
        const writesAtReturn = stderrWrite.mock.calls.length;
        lastRunParams().onProgress?.({ step: 'action_execution', message: 'Still sending email', metadata: { stepCount: 4 } });
        expect(stderrWrite.mock.calls.length).toBe(writesAtReturn);
    });

    it('does not set a deadline when no timeout is given', async () => {
        mocks.runAgent.mockResolvedValue(finishedRun('Completed', 'done'));

        await new AgentService().ExecuteAgent('Lead Intake Flow', 'go');

        expect(lastRunParams().maxExecutionTimeMs).toBeUndefined();
    });

    it('throws a formatted error for an unknown agent', async () => {
        await expect(new AgentService().ExecuteAgent('No Such Agent', 'go')).rejects.toThrow(/^❌ Agent not found: "No Such Agent"/);
        expect(mocks.runAgent).not.toHaveBeenCalled();
    });

    // The missing-settings message says exactly what to set; a second headline buried it.
    it('passes a formatted startup error through without wrapping it again', async () => {
        mocks.initialize.mockRejectedValue(new Error('❌ Database configuration missing\n\nProblem: No database name is configured'));

        await expect(new AgentService().ExecuteAgent('Lead Intake Flow', 'go')).rejects.toThrow(/^❌ Database configuration missing/);
    });
});
