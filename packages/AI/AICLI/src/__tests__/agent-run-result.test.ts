/**
 * Unit tests for agent-run-result: turning what the agent runner returned (or the lack of it, after
 * a timeout) into the CLI's result.
 */

import { describe, it, expect } from 'vitest';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import {
    AgentExecutionFacts,
    BuildAgentRunResult,
    BuildTimedOutResult,
    DescribeTimeout,
    ReadFinalPayload,
} from '../lib/agent-run-result';

const FACTS: AgentExecutionFacts = {
    AgentName: 'Lead Intake Flow',
    Prompt: 'Process the new leads',
    DurationMs: 1234,
    ExecutionID: 'exec-1',
    LogFilePath: '/ws/.mj-ai/logs/exec-1_execution.log',
};

/** The fields of a run record the CLI reads. */
interface FakeRun {
    ID: string;
    Status: string;
    Message?: string | null;
    FinalPayload?: string | null;
    ErrorMessage?: string | null;
}

/** A runner result with only the parts the CLI reads. */
function runnerResult(success: boolean, run: FakeRun, payload?: object): ExecuteAgentResult {
    return { success, payload, agentRun: run } as unknown as ExecuteAgentResult;
}

describe('BuildAgentRunResult', () => {
    it('reports a Loop agent the way it always did: its message is the result', () => {
        const result = BuildAgentRunResult(
            runnerResult(true, { ID: 'run-1', Status: 'Completed', Message: 'Here is your answer.' }),
            FACTS
        );
        expect(result.success).toBe(true);
        expect(result.result).toBe('Here is your answer.');
        expect(result.AgentRunID).toBe('run-1');
        expect(result.AgentRunStatus).toBe('Completed');
        expect(result.duration).toBe(1234);
        expect(result.executionId).toBe('exec-1');
        expect(result.FinalPayload).toBeUndefined();
    });

    // A Flow agent's message is boilerplate; its output is the payload, which used to be dropped.
    it('reports a Flow agent\'s payload beside its message', () => {
        const result = BuildAgentRunResult(
            runnerResult(
                true,
                { ID: 'run-2', Status: 'Completed', Message: 'Flow completed - no more paths to follow' },
                { leads: [{ name: 'Ada', score: 92 }] }
            ),
            FACTS
        );
        expect(result.result).toBe('Flow completed - no more paths to follow');
        expect(result.FinalPayload).toEqual({ leads: [{ name: 'Ada', score: 92 }] });
    });

    it('uses the payload as the result when there is no message', () => {
        const result = BuildAgentRunResult(
            runnerResult(true, { ID: 'run-3', Status: 'Completed', Message: null, FinalPayload: '{"total":7}' }),
            FACTS
        );
        expect(result.result).toEqual({ total: 7 });
        expect(result.FinalPayload).toBeUndefined();
    });

    it('reports a dispatched run as Paused', () => {
        const result = BuildAgentRunResult(
            runnerResult(true, { ID: 'run-4', Status: 'Paused', Message: 'Started **Lead Intake** — 3 task(s) running.' }),
            FACTS
        );
        expect(result.success).toBe(true);
        expect(result.AgentRunStatus).toBe('Paused');
    });

    it('reports a failed run with its error, run ID and status', () => {
        const result = BuildAgentRunResult(
            runnerResult(false, { ID: 'run-5', Status: 'Failed', ErrorMessage: 'Action "Send Email" failed' }),
            FACTS
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Action "Send Email" failed');
        expect(result.AgentRunID).toBe('run-5');
        expect(result.AgentRunStatus).toBe('Failed');
        expect(result.TimedOut).toBeUndefined();
    });

    it('serializes with the run ID ahead of the result', () => {
        const json = JSON.stringify(BuildAgentRunResult(
            runnerResult(true, { ID: 'run-6', Status: 'Completed', Message: 'ok' }),
            FACTS
        ));
        expect(json.indexOf('"AgentRunID"')).toBeLessThan(json.indexOf('"result"'));
        expect(json).not.toContain('FinalPayload');
    });
});

describe('BuildTimedOutResult', () => {
    it('reports a run that stopped after being cancelled, with its final status', () => {
        const result = BuildTimedOutResult(
            { TimeoutMs: 60000, Run: runnerResult(false, { ID: 'run-7', Status: 'Cancelled' }) },
            FACTS
        );
        expect(result.success).toBe(false);
        expect(result.TimedOut).toBe(true);
        expect(result.AgentRunID).toBe('run-7');
        expect(result.AgentRunStatus).toBe('Cancelled');
        expect(result.error).toContain('Timed out after 60000ms');
        expect(result.error).toContain('mj ai audit agent-run run-7');
    });

    it('reports a run that did not stop as possibly still running', () => {
        const result = BuildTimedOutResult({ TimeoutMs: 60000, AgentRunID: 'run-8' }, FACTS);
        expect(result.AgentRunID).toBe('run-8');
        expect(result.AgentRunStatus).toBe('Running');
        expect(result.error).toContain('may still be running');
        expect(result.error).toContain('mj ai audit agent-run run-8');
    });

    it('says so when no run had been recorded yet', () => {
        const result = BuildTimedOutResult({ TimeoutMs: 1000 }, FACTS);
        expect(result.AgentRunID).toBeUndefined();
        expect(result.AgentRunStatus).toBeUndefined();
        expect(result.error).toContain('No agent run had been recorded yet');
    });

    // Passing the deadline is a failure even if the run then finished: the caller's answer was late.
    it('is a failure even when the run completed during the grace period', () => {
        const result = BuildTimedOutResult(
            { TimeoutMs: 1000, Run: runnerResult(true, { ID: 'run-9', Status: 'Completed', Message: 'late' }) },
            FACTS
        );
        expect(result.success).toBe(false);
        expect(result.AgentRunStatus).toBe('Completed');
    });
});

describe('DescribeTimeout', () => {
    it('names the grace period when the run would not stop', () => {
        expect(DescribeTimeout(5000, 'run-1', undefined)).toMatch(/had not stopped 5s later/);
    });
});

describe('ReadFinalPayload', () => {
    it('prefers what the runner returned', () => {
        expect(ReadFinalPayload(runnerResult(true, { ID: 'r', Status: 'Completed', FinalPayload: '{"a":1}' }, { b: 2 }))).toEqual({ b: 2 });
    });

    it('parses the saved payload when the runner returned none', () => {
        expect(ReadFinalPayload(runnerResult(true, { ID: 'r', Status: 'Completed', FinalPayload: '{"a":1}' }))).toEqual({ a: 1 });
    });

    it('returns a saved payload that is not JSON as the raw text', () => {
        expect(ReadFinalPayload(runnerResult(true, { ID: 'r', Status: 'Completed', FinalPayload: 'plain text' }))).toBe('plain text');
    });

    it('returns undefined when there is no payload anywhere', () => {
        expect(ReadFinalPayload(runnerResult(true, { ID: 'r', Status: 'Completed', FinalPayload: null }))).toBeUndefined();
    });
});
