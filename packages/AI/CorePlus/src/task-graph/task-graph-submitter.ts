/**
 * @fileoverview The seam that lets an agent run submit a durable task graph without knowing who
 * executes it.
 *
 * **Why a seam rather than a direct call.** The dependency graph runs
 * `@memberjunction/task-graph` → `@memberjunction/ai-core-plus`, and MJServer → both. Having
 * `@memberjunction/ai-agents` import `TaskGraphService` directly would invert that: the agent
 * framework would depend on the durable-execution package, which in turn pulls the entity layer and
 * the dispatcher into every context that merely runs an agent — including unit tests that have no
 * database. The Loop primitive only needs to say *"persist this graph and tell me its handle"*.
 *
 * So the capability is declared here as an interface and resolved at runtime through the
 * ClassFactory, exactly like every other pluggable MJ capability. `@memberjunction/task-graph`
 * registers the real implementation; a host that never loaded it gets `null` from
 * {@link GetTaskGraphSubmitter} and the agent reports an honest failure instead of silently
 * dropping a graph the model believed it had submitted.
 *
 * @module @memberjunction/ai-core-plus
 */
import { MJGlobal } from '@memberjunction/global';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { TaskGraphSpec } from './task-graph-spec';

/** Everything a submitter needs beyond the graph itself. */
export type TaskGraphSubmitRequest = {
    Spec: TaskGraphSpec;
    /** Environment the tasks belong to. */
    EnvironmentID: string;
    /** Conversation this graph answers, when submitted from a conversational channel. */
    ConversationDetailID?: string | null;
    /** The agent run that emitted the graph, for provenance and continuation routing. */
    AgentRunID?: string | null;
    /**
     * How many task-graph continuations led to the run that is submitting this graph.
     *
     * Carried so a `reinvoke` chain is bounded: a graph submitted by an agent that was itself
     * started by a finished graph inherits that graph's depth + 1, and `MAX_REINVOKE_DEPTH` compares
     * against a real number instead of a permanent zero. Omitted means an ordinary submission at
     * depth 0 — which is every submission that is not part of a continuation chain.
     */
    ReinvokeDepth?: number;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/** What the caller learns about a submission. */
export type TaskGraphSubmitOutcome = {
    Success: boolean;
    /** Parent task representing the whole graph — the handle for status, cancel and retry. */
    ParentTaskID?: string;
    /** Every validation failure, not just the first, when the graph was rejected. */
    ErrorMessage?: string;
};

/**
 * Persists a task graph and returns immediately.
 *
 * Implementations must NOT wait for execution. The split between submission and execution is what
 * makes a graph outlive the run that produced it (D2).
 */
export abstract class TaskGraphSubmitter {
    public abstract Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome>;
}

/** ClassFactory key under which the durable implementation registers itself. */
export const TASK_GRAPH_SUBMITTER_KEY = 'TaskGraphSubmitter';

/**
 * Resolves the registered submitter, or `null` when no durable-execution package is loaded.
 *
 * Returning null rather than throwing is deliberate: a host with no dispatcher (a CLI, a test, a
 * browser bundle) is a legitimate configuration, and the caller can turn the absence into a
 * corrective the model can act on. What must never happen is a graph vanishing quietly.
 *
 * **The `Submit` check is not defensive noise.** When nothing has registered under the key,
 * `ClassFactory.CreateInstance` does not return null — it falls back to instantiating the base
 * class it was given, and `TaskGraphSubmitter` is abstract only to TypeScript. The caller therefore
 * receives a real object whose `Submit` is `undefined`, sails past its own null check, and dies on
 * `submitter.Submit is not a function` — a stack trace about a missing method, when the actual fact
 * is "this host has no dispatcher". That is precisely the diagnosis the null return exists to give,
 * so the contract is enforced here rather than trusted.
 */
export function GetTaskGraphSubmitter(): TaskGraphSubmitter | null {
    const submitter = MJGlobal.Instance.ClassFactory.CreateInstance<TaskGraphSubmitter>(
        TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY,
    );
    return typeof submitter?.Submit === 'function' ? submitter : null;
}
