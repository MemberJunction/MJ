/**
 * @fileoverview Server-side detection of task graphs emitted in an agent's payload.
 *
 * **This is a transition shim, and it is meant to die.** Until Phase 3 makes `Tasks` a first-class
 * Loop-agent step type, agents signal a graph by smuggling one into their result payload under a
 * `taskGraph` key. Detection used to live *only* in the Explorer conversation client, which is why
 * Slack/Teams, scheduled routines, and headless API calls silently dropped every graph an agent
 * emitted — the plan's core "verified gap".
 *
 * Moving the sniff server-side is what makes execution invocation-agnostic (D1): every channel now
 * routes through the same detection and the same `TaskGraphService.Submit`, so a multi-step plan
 * emitted over Slack executes exactly as it would in Explorer.
 *
 * Once Phase 3 lands the primitive and migrates the prompts, this file goes away — the graph will
 * arrive as a typed `nextStep`, not as a payload key to be discovered.
 *
 * @module @memberjunction/task-graph
 */
import { LogError, LogStatus } from '@memberjunction/core';
import { TaskGraphSpec, TaskGraphSpecNode } from './TaskGraphSpec';
import { TaskGraphService, TaskGraphSubmitContext, TaskGraphSubmitResult } from './TaskGraphService';

/** The legacy payload key agents use to emit a graph. */
const LEGACY_PAYLOAD_KEY = 'taskGraph';

/**
 * Extracts a task graph from an agent result payload, if one is present.
 *
 * Tolerant by design: a payload is arbitrary agent output, so anything that is not a well-formed
 * graph returns null rather than throwing. Structural *validation* is the service's job — this
 * only answers "did the agent try to emit a graph at all?", and answering it too strictly here
 * would silently drop malformed graphs that the caller should instead see rejected with reasons.
 */
export function DetectTaskGraphInPayload(payload: unknown): TaskGraphSpec | null {
    if (payload == null || typeof payload !== 'object') return null;

    const candidate = (payload as Record<string, unknown>)[LEGACY_PAYLOAD_KEY];
    if (candidate == null || typeof candidate !== 'object') return null;

    const graph = candidate as Partial<TaskGraphSpec>;
    if (!Array.isArray(graph.tasks)) return null;

    return {
        workflowName: typeof graph.workflowName === 'string' ? graph.workflowName : 'Untitled workflow',
        reasoning: typeof graph.reasoning === 'string' ? graph.reasoning : undefined,
        tasks: graph.tasks as TaskGraphSpecNode[],
        continuation: graph.continuation,
        durable: graph.durable,
    };
}

/** Outcome of the detect-and-submit path, so callers can log or surface it. */
export type TaskGraphDetectionOutcome = {
    /** True when a graph was present in the payload, regardless of whether submission succeeded. */
    Detected: boolean;
    Submitted: boolean;
    ParentTaskID?: string;
    ErrorMessage?: string;
};

/**
 * Detects a graph in a completed run's payload and submits it.
 *
 * Deliberately **never throws**: this runs on the completion path of channels whose primary job is
 * something else (replying in Slack, finishing a scheduled routine). A malformed graph must not
 * take down the surrounding operation — it is reported and the channel carries on.
 *
 * Callers get the outcome so they can decide what the user sees. A detected-but-rejected graph is
 * worth surfacing; a payload with no graph at all is entirely normal and not worth mentioning.
 */
export async function DetectAndSubmitTaskGraph(
    payload: unknown,
    context: TaskGraphSubmitContext,
    channelLabel: string,
): Promise<TaskGraphDetectionOutcome> {
    const spec = DetectTaskGraphInPayload(payload);
    if (!spec) return { Detected: false, Submitted: false };

    LogStatus(`[TaskGraphDetection] ${channelLabel}: detected task graph "${spec.workflowName}" (${spec.tasks.length} task(s)).`);

    try {
        const result: TaskGraphSubmitResult = await new TaskGraphService().Submit(spec, context);
        if (!result.Success) {
            LogError(`[TaskGraphDetection] ${channelLabel}: submission rejected — ${result.ErrorMessage}`);
            return { Detected: true, Submitted: false, ErrorMessage: result.ErrorMessage };
        }
        LogStatus(`[TaskGraphDetection] ${channelLabel}: submitted as parent task ${result.ParentTaskID}.`);
        return { Detected: true, Submitted: true, ParentTaskID: result.ParentTaskID };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        LogError(`[TaskGraphDetection] ${channelLabel}: submission threw — ${message}`);
        return { Detected: true, Submitted: false, ErrorMessage: message };
    }
}
