import type { JSONValue } from '@memberjunction/ai';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import type { ExecutionResult } from './output-formatter';
import { CANCELLATION_GRACE_MS } from './run-deadline';

/** What every agent execution result reports besides the run itself. */
export interface AgentExecutionFacts {
  /** The agent name the caller asked for. */
  AgentName: string;
  /** The prompt the agent was given. */
  Prompt: string;
  /** Wall-clock time the command spent, in milliseconds. */
  DurationMs: number;
  /** The CLI execution log's ID. */
  ExecutionID: string;
  /** Where the CLI execution log was written. */
  LogFilePath: string;
}

/** What is known about a run the command stopped waiting for. */
export interface AbandonedAgentRun {
  /** The `--timeout` that elapsed, in milliseconds. */
  TimeoutMs: number;
  /** What the runner returned after it was cancelled, when it returned within the grace period. */
  Run?: ExecuteAgentResult;
  /** The run's ID as reported when the run record was created, for when the runner never returned. */
  AgentRunID?: string;
}

/**
 * Turns what the agent runner returned into the CLI's result.
 *
 * `result` keeps its long-standing meaning: the agent's message, or its payload when there is no
 * message. When there is a message, the payload is reported beside it as `FinalPayload`, because a
 * Flow agent's message is only "Flow completed" and its real output is the payload.
 */
export function BuildAgentRunResult(run: ExecuteAgentResult, facts: AgentExecutionFacts): ExecutionResult {
  const agentRun = run.agentRun;
  const message = agentRun?.Message || undefined;
  const payload = ReadFinalPayload(run);

  if (run.success) {
    return {
      success: true,
      entityName: facts.AgentName,
      AgentRunID: agentRun?.ID,
      AgentRunStatus: agentRun?.Status,
      prompt: facts.Prompt,
      result: message ?? payload,
      FinalPayload: message ? payload : undefined,
      duration: facts.DurationMs,
      executionId: facts.ExecutionID,
      logFilePath: facts.LogFilePath,
    };
  }

  return {
    success: false,
    entityName: facts.AgentName,
    AgentRunID: agentRun?.ID,
    AgentRunStatus: agentRun?.Status,
    prompt: facts.Prompt,
    error: agentRun?.ErrorMessage || run.errorMessage || 'Unknown execution error',
    FinalPayload: payload,
    duration: facts.DurationMs,
    executionId: facts.ExecutionID,
    logFilePath: facts.LogFilePath,
  };
}

/**
 * The CLI's result for a run that outlived `--timeout`.
 *
 * Always a failure, whatever the run did after the deadline: the deadline is what the caller set,
 * and passing it means the command did not get its answer in time.
 */
export function BuildTimedOutResult(abandoned: AbandonedAgentRun, facts: AgentExecutionFacts): ExecutionResult {
  const agentRunID = abandoned.Run?.agentRun?.ID ?? abandoned.AgentRunID;
  const status = abandoned.Run?.agentRun?.Status ?? (agentRunID ? 'Running' : undefined);

  return {
    success: false,
    entityName: facts.AgentName,
    AgentRunID: agentRunID,
    AgentRunStatus: status,
    prompt: facts.Prompt,
    error: DescribeTimeout(abandoned.TimeoutMs, agentRunID, abandoned.Run ? status : undefined),
    TimedOut: true,
    duration: facts.DurationMs,
    executionId: facts.ExecutionID,
    logFilePath: facts.LogFilePath,
  };
}

/**
 * Explains a timeout and what to do next, naming the run when there is one.
 *
 * @param stoppedStatus - The status the run ended with after being cancelled, or `undefined` when
 *   it did not stop within the grace period.
 */
export function DescribeTimeout(timeoutMs: number, agentRunID: string | undefined, stoppedStatus: string | undefined): string {
  const lead = `Timed out after ${timeoutMs}ms (--timeout).`;
  if (!agentRunID) {
    return `${lead} No agent run had been recorded yet, so there is nothing to inspect. Re-run with a larger --timeout.`;
  }
  if (stoppedStatus) {
    return `${lead} Agent run ${agentRunID} was cancelled and ended with status ${stoppedStatus}. ` +
      `Re-run with a larger --timeout, or see how far it got with: mj ai audit agent-run ${agentRunID}`;
  }
  return `${lead} Agent run ${agentRunID} was asked to stop but had not stopped ${CANCELLATION_GRACE_MS / 1000}s later, ` +
    `so it may still be running. Check on it with: mj ai audit agent-run ${agentRunID}`;
}

/**
 * The run's final payload: what the runner returned, or else the payload saved on the run record.
 * A saved payload that is not valid JSON is returned as the raw string.
 */
export function ReadFinalPayload(run: ExecuteAgentResult): JSONValue | undefined {
  if (run.payload !== undefined && run.payload !== null) {
    return run.payload;
  }
  const saved = run.agentRun?.FinalPayload;
  if (!saved) {
    return undefined;
  }
  try {
    const parsed: JSONValue = JSON.parse(saved);
    return parsed;
  } catch {
    // Not JSON — the raw text is still the payload, and more useful than nothing.
    return saved;
  }
}
