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
    if (submissionSuppressedBecause) return null;
    const submitter = MJGlobal.Instance.ClassFactory.CreateInstance<TaskGraphSubmitter>(
        TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY,
    );
    return typeof submitter?.Submit === 'function' ? submitter : null;
}

/** Set while this host has deliberately turned graph submission off. */
let submissionSuppressedBecause: string | null = null;

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
    submissionSuppressedBecause = reason;
}

/** Why submission is suppressed here, or null when it is not. For diagnostics. */
export function TaskGraphSubmissionSuppressedBecause(): string | null {
    return submissionSuppressedBecause;
}

/**
 * What a sanitization pass kept, and what it refused to keep.
 *
 * `DroppedPaths` is the point: a value that silently vanished from a condition's reach is a
 * wrong branch nobody can explain later, so the caller gets the list and logs it.
 */
export type SanitizedInvocation = {
    Envelope: TaskGraphInvocationEnvelope | undefined;
    DroppedPaths: string[];
};

/** How deep the walk goes before it stops trusting the shape. */
const MAX_INVOCATION_DEPTH = 8;

/** How many values one envelope may contribute, so a graph row cannot be a memory dump. */
const MAX_INVOCATION_NODES = 2_000;

/**
 * Reduces an invocation envelope to what is safe to persist and read back later.
 *
 * **Why this exists.** `ExecuteAgentParams.context` is documented as possibly being a CLASS INSTANCE
 * carrying "external service credentials or connection information" — Skip's `SkipAgentContext` is
 * the named example. R3-3 carried that object into the parent task's `InputPayload` verbatim, which
 * fails two ways at once: `JSON.stringify` throws `Converting circular structure to JSON` the moment
 * the context holds a socket, a pool, or a provider (killing the agent run at submit time), and if
 * it had NOT thrown, the credentials in it would have been written to a database row that outlives
 * the run and is readable by anything with task access.
 *
 * **What survives.** JSON data: primitives, arrays, plain objects, `Date` (as ISO), and anything
 * exposing `toJSON()`. That is deliberately the same set `JSON.stringify` would have kept, minus the
 * ways it explodes — conditions reference `data.approved` and `context.tier`, not live handles.
 *
 * **What does not, and why dropping beats guessing.** Class instances, functions, `Map`/`Set`,
 * sockets, streams, anything circular, anything past the depth or node cap. Walking a socket's own
 * enumerable properties instead would "work" — and would persist its internals, which is the leak
 * this is here to prevent. Every drop is reported by path so the operator sees `context.db` left the
 * envelope rather than discovering it as a branch that quietly took the wrong edge.
 */
export function SanitizeInvocationEnvelope(
    envelope: TaskGraphInvocationEnvelope | undefined,
): SanitizedInvocation {
    if (!envelope) return { Envelope: undefined, DroppedPaths: [] };

    const dropped: string[] = [];
    let nodes = 0;
    // Identity-based, and scoped to the CURRENT PATH rather than the whole walk: an object legitimately
    // referenced twice by siblings is not a cycle, and treating it as one would drop real data.
    const walk = (value: unknown, path: string, depth: number, ancestors: Set<object>): unknown => {
        if (value === null) return null;
        const kind = typeof value;
        if (kind === 'string' || kind === 'number' || kind === 'boolean') {
            if (kind === 'number' && !Number.isFinite(value as number)) {
                // NaN/Infinity serialize as null, which reads as "present and empty" to a condition.
                dropped.push(path);
                return undefined;
            }
            return value;
        }
        if (kind === 'undefined') return undefined;      // absent, not dropped — nothing was lost
        if (kind !== 'object') { dropped.push(path); return undefined; }   // function, symbol, bigint

        if (++nodes > MAX_INVOCATION_NODES) { dropped.push(path); return undefined; }
        if (depth > MAX_INVOCATION_DEPTH) { dropped.push(path); return undefined; }

        const object = value as object;
        if (ancestors.has(object)) { dropped.push(path); return undefined; }

        if (object instanceof Date) return object.toISOString();

        const maybeToJSON = (object as { toJSON?: unknown }).toJSON;
        if (typeof maybeToJSON === 'function') {
            return walk((maybeToJSON as () => unknown).call(object), path, depth + 1, ancestors);
        }

        const nextAncestors = new Set(ancestors).add(object);
        if (Array.isArray(object)) {
            return object.map((entry, index) => {
                const kept = walk(entry, `${path}[${index}]`, depth + 1, nextAncestors);
                // A hole in an array is `null` rather than a shifted index — position carries meaning.
                return kept === undefined ? null : kept;
            });
        }

        const prototype = Object.getPrototypeOf(object);
        if (prototype !== Object.prototype && prototype !== null) {
            // A class instance, a Map, a Set, a Socket. See the doc block: refused, not unwrapped.
            dropped.push(path);
            return undefined;
        }

        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(object)) {
            const kept = walk(entry, path ? `${path}.${key}` : key, depth + 1, nextAncestors);
            if (kept !== undefined) result[key] = kept;
        }
        return result;
    };

    const data = walk(envelope.Data, 'data', 0, new Set());
    const context = walk(envelope.Context, 'context', 0, new Set());
    // An envelope whose every field was dropped is no envelope: writing `{}` would tell the
    // dispatcher a `data.x` condition resolved to absent-data rather than never having been carried.
    if (data === undefined && context === undefined) return { Envelope: undefined, DroppedPaths: dropped };
    return {
        Envelope: {
            ...(data === undefined ? {} : { Data: data }),
            ...(context === undefined ? {} : { Context: context }),
        },
        DroppedPaths: dropped,
    };
}
