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
import { GetGlobalObjectStore, MJGlobal } from '@memberjunction/global';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { TaskGraphSpec } from './task-graph-spec';
import type { TaskSecurityEnvelope } from './task-security-envelope';
import { SanitizeForPersistence } from '../safe-persist';

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
    /**
     * The invocation's own runtime parameters, as the flow dialect's `data` and `context` roots.
     *
     * **These are NOT the origin step's output** — that is what `payload` means — and conflating the
     * two is the defect this field exists to fix (R3-3). In the engine being replaced,
     * `FlowAgentType.buildConditionContext` sets `data: params.data` and `context: params.context`
     * from `ExecuteAgentParams`, and `data.userApproval === true` is that class's own documented
     * pattern. The compiled path carried neither, so every documented `data.x`/`context.x` condition
     * evaluated against the origin's output, found nothing, and read a clean `false` — silently
     * taking a branch the walker never took, on every invocation, with the validator blessing the
     * condition at the door.
     *
     * Persisted on the graph's parent so it survives the submitting run, for the same reason
     * everything else in that bag is: the instance that evaluates a condition is routinely not the
     * process that accepted the graph.
     */
    Invocation?: TaskGraphInvocationEnvelope;
    /**
     * Root-first ancestor agent hierarchy (`[...parentAgentHierarchy, submittingAgentName]`) of the
     * run that emitted this graph, carried onto the parent task so dispatched agent steps inherit
     * the hierarchy directly without walking ancestor runs in a loop.
     */
    ParentAgentHierarchy?: string[];
    /**
     * The submitting run's security envelope (bound action parameters, audience, run scope, caller
     * tenant context and taint). Written to `MJ: Tasks.SecurityEnvelope` on the parent and every child
     * row and enforced by the dispatcher on every node. Absent when the run carries no constraint.
     */
    SecurityEnvelope?: TaskSecurityEnvelope;
    /**
     * Seed `$.debug` on the parent row at insert. `paused: true` is start-paused — the dispatcher
     * must not claim until Resume/Step. Written with the row because Pause-after-submit races the
     * first poll.
     */
    Debug?: TaskGraphStartDebug;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/** What a Debug-workflow start may seed on the graph. Breakpoints need task IDs, which do not exist
 *  until children persist — so Submit honors `paused` only. */
export type TaskGraphStartDebug = {
    paused?: boolean;
};

/**
 * What an invocation contributes to condition evaluation, beyond the steps' own outputs.
 *
 * Deliberately just the two documented roots rather than the whole `ExecuteAgentParams`: this is a
 * durable record read by another process later, so it carries what conditions may reference and
 * nothing that would go stale or leak.
 */
export type TaskGraphInvocationEnvelope = {
    /** The invocation's `data` — the flow dialect's `data.*` root. */
    Data?: unknown;
    /** The invocation's `context` — the flow dialect's `context.*` root. */
    Context?: unknown;
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
    /**
     * Whether this submitter persists {@link TaskSecurityEnvelope} on every row it writes and its
     * dispatcher enforces it on every node (`DurableTaskGraphSubmitter` overrides to `true`). The only
     * thing that lets a run with an audience, a scope, a tenant or bound parameters submit a graph:
     * `BaseAgent` withholds graphs from such a run whenever this is false.
     */
    public readonly SupportsSecurityEnvelope: boolean = false;

    public abstract Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome>;
}

/** ClassFactory key under which the durable implementation registers itself. */
export const TASK_GRAPH_SUBMITTER_KEY = 'TaskGraphSubmitter';

/**
 * Where an explicitly registered submitter lives: the global object store, not a module variable, so a bundle
 * that loads this module twice still sees one registration (as `BaseSingleton` guarantees for singletons).
 */
const EXPLICIT_SUBMITTER_KEY = '___TaskGraphSubmitter_Explicit';

/**
 * Registers or clears an explicit {@link TaskGraphSubmitter} instance for this process (tests, custom hosts).
 * Pass `null` to reset to default `ClassFactory` resolution.
 */
export function RegisterTaskGraphSubmitter(submitter: TaskGraphSubmitter | null): void {
    const store = GetGlobalObjectStore();
    if (!store) return;
    if (submitter) store[EXPLICIT_SUBMITTER_KEY] = submitter;
    else delete store[EXPLICIT_SUBMITTER_KEY];
}

/**
 * The explicitly registered submitter, if any. Checked by shape, not `instanceof`: a submitter registered
 * through a second copy of this module is an instance of that copy's class.
 */
function explicitSubmitter(): TaskGraphSubmitter | undefined {
    const registered: unknown = GetGlobalObjectStore()?.[EXPLICIT_SUBMITTER_KEY];
    return isSubmitter(registered) ? registered : undefined;
}

function isSubmitter(value: unknown): value is TaskGraphSubmitter {
    return typeof value === 'object' && value !== null && 'Submit' in value && typeof value.Submit === 'function';
}

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
    if (TaskGraphSubmissionSuppressedBecause()) return null;
    const explicit = explicitSubmitter();
    if (explicit) {
        return explicit;
    }
    const submitter = MJGlobal.Instance.ClassFactory.CreateInstance<TaskGraphSubmitter>(
        TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY,
    );
    return typeof submitter?.Submit === 'function' ? submitter : null;
}

/**
 * Where the reason this host turned graph submission off lives: the global object store, like the explicit
 * submitter, so a bundle that loads this module twice cannot have one copy suppressed and the other not.
 */
const SUBMISSION_SUPPRESSED_KEY = '___TaskGraphSubmitter_SuppressedBecause';

/**
 * Turns graph submission off for this process, so callers take the no-submitter path.
 *
 * **Why a host needs this** (R3-11). The durable submitter registers through the generated
 * ServerBootstrap manifest unconditionally, while the DISPATCHER can be switched off at boot with
 * `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1`. A host in that configuration therefore accepted graphs it
 * had no intention of running: the agent found a submitter, submitted, told the user "I'll follow
 * up when it finishes", and parked its run `Paused`. The graph sat `Pending` and the run sat
 * `Paused` forever, with no per-submission diagnostics anywhere — recoverable only by somebody
 * noticing, unsetting the flag and restarting, after which the stale graph executed hours later.
 *
 * The flag's authors got the sibling seam right: the entity-action submitter is registered INSIDE
 * `StartTaskGraphDispatcher`, with a comment saying exactly why — "a submitter without a dispatcher
 * writes Task rows nobody picks up". This extends the same treatment to the agent seam.
 *
 * Routed through the existing `null` return rather than a throw from `Submit`, because that path is
 * already built to be honest: the agent reports that this host cannot run graphs instead of
 * promising a follow-up that will never come.
 */
export function SuppressTaskGraphSubmission(reason: string): void {
    const store = GetGlobalObjectStore();
    if (!store) return;
    if (reason) store[SUBMISSION_SUPPRESSED_KEY] = reason;
    else delete store[SUBMISSION_SUPPRESSED_KEY];
}

/** Why submission is suppressed here, or null when it is not. For diagnostics. */
export function TaskGraphSubmissionSuppressedBecause(): string | null {
    const reason: unknown = GetGlobalObjectStore()?.[SUBMISSION_SUPPRESSED_KEY];
    return typeof reason === 'string' && reason ? reason : null;
}

/**
 * Reduces an invocation envelope to what is safe to persist and read back later.
 *
 * The rules and the reasoning live in {@link SanitizeForPersistence}; this adds the one thing
 * specific to an envelope: an envelope whose every field was dropped is NO envelope, not an empty
 * one. Writing `{}` would tell the dispatcher the `data`/`context` roots exist and are empty, so a
 * `data.x` condition would read as absent-data and take a branch, where "nothing was carried" is
 * the honest answer.
 */
export function SanitizeInvocationEnvelope(
    envelope: TaskGraphInvocationEnvelope | undefined,
): SanitizedInvocation {
    if (!envelope) return { Envelope: undefined, DroppedPaths: [] };

    const data = SanitizeForPersistence(envelope.Data, 'data');
    const context = SanitizeForPersistence(envelope.Context, 'context');
    const dropped = [...data.DroppedPaths, ...context.DroppedPaths];

    if (data.Value === undefined && context.Value === undefined) {
        return { Envelope: undefined, DroppedPaths: dropped };
    }
    return {
        Envelope: {
            ...(data.Value === undefined ? {} : { Data: data.Value }),
            ...(context.Value === undefined ? {} : { Context: context.Value }),
        },
        DroppedPaths: dropped,
    };
}

/** What a sanitization pass kept for an invocation, and what it refused to keep. */
export type SanitizedInvocation = {
    Envelope: TaskGraphInvocationEnvelope | undefined;
    DroppedPaths: string[];
};
