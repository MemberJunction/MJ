/**
 * @fileoverview TaskGraph execution isolation contracts, boundary guarantees, default in-process
 * runner, and configuration resolution helpers.
 *
 * Concrete Node runtime isolation runners (`WorkerIsolationRunner`, `ProcessIsolationRunner`,
 * `ContainerIsolationRunner`) live in `@memberjunction/server` (`packages/MJServer/src/services/isolation/`),
 * keeping `@memberjunction/task-graph` cleanly structured while wiring directly into
 * `TaskGraphDispatcher` via `TaskGraphDispatcherConfig.IsolationRunners`.
 *
 * @module @memberjunction/task-graph
 */
import {
    IsTaskGraphIsolationLevel,
    LimitsConfigResolver,
    TASK_GRAPH_ISOLATION_LEVELS,
    type MJLimitsIsolationConfig,
    type MJLimitsOverride,
    type TaskGraphIsolationLevel,
} from '@memberjunction/core';

export {
    IsTaskGraphIsolationLevel,
    TASK_GRAPH_ISOLATION_LEVELS,
    type MJLimitsIsolationConfig,
    type TaskGraphIsolationLevel,
};

/**
 * Reason an isolated execution attempt ended.
 */
export type TaskGraphIsolationTerminationReason =
    | 'Completed'
    | 'OutOfMemory'
    | 'Timeout'
    | 'StartupFailed'
    | 'ExitFailure'
    | 'Error';

/**
 * Fault-boundary guarantees, limitations, and host prerequisites per isolation mode.
 */
export interface TaskGraphIsolationBoundaryGuarantee {
    readonly Level: TaskGraphIsolationLevel;
    readonly ExecutionSubstrate: string;
    readonly Guarantees: readonly string[];
    readonly Limitations: readonly string[];
    readonly Prerequisites: readonly string[];
}

/**
 * Documented runtime fault-boundary guarantees and container prerequisites for every
 * {@link TaskGraphIsolationLevel}.
 *
 * Key invariant for `Worker` mode:
 * - `Worker` mode executes untrusted/isolated JS inside a Node `worker_threads.Worker` with V8
 *   `resourceLimits` (`maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`), guaranteeing clean
 *   worker termination (`ERR_WORKER_OUT_OF_MEMORY`) without crashing or destabilizing the host
 *   MJAPI process for unbounded V8 JavaScript heap allocations.
 * - **Native / Buffer bypass**: C++ native addons and off-heap `Buffer` / `ArrayBuffer` /
 *   `SharedArrayBuffer` / WebAssembly linear memory allocations bypass V8 heap limits; workloads
 *   requiring OS-level containment of native or off-heap memory MUST select `Process` or
 *   `Container` isolation.
 */
export const TASK_GRAPH_ISOLATION_GUARANTEES: Readonly<
    Record<TaskGraphIsolationLevel, TaskGraphIsolationBoundaryGuarantee>
> = {
    InProcess: {
        Level: 'InProcess',
        ExecutionSubstrate: 'Host Node.js event loop (direct in-process invocation)',
        Guarantees: [
            'Zero IPC serialization overhead; preserves shared metadata providers and connection pools.',
            'Available via explicit opt-in (`isolation: "InProcess"` or `Limits.Isolation.DefaultIsolation`) and preserved on upgraded pre-isolation Flow agents (`AIAgent.Isolation = "InProcess"`).',
        ],
        Limitations: [
            'Shares V8 isolate heap, native memory, event loop, and process crash domain with the host MJAPI process.',
        ],
        Prerequisites: ['None (built-in host execution).'],
    },
    Worker: {
        Level: 'Worker',
        ExecutionSubstrate: 'Node.js worker_threads.Worker with V8 resourceLimits',
        Guarantees: [
            'Executes isolated JavaScript/TypeScript payloads inside a dedicated V8 Isolate bounded by resourceLimits (maxOldGenerationSizeMb, maxYoungGenerationSizeMb).',
            'Guarantees clean worker termination (ERR_WORKER_OUT_OF_MEMORY) without crashing host MJAPI when unbounded V8 JavaScript heap allocations occur.',
            'Enforces wall-clock execution timeouts via worker.terminate().',
            'Default isolation level for submitted task graphs (including model-written graphs) and newly drafted workflows created through Workflow.Draft.',
        ],
        Limitations: [
            'V8 heap resourceLimits do NOT constrain native C++ addon allocations or off-heap Buffer / ArrayBuffer / SharedArrayBuffer / WASM linear memory.',
            'Workloads with unbounded native or off-heap Buffer allocations bypass Worker V8 limits and require Process or Container isolation for OS-level memory containment.',
        ],
        Prerequisites: ['Node.js >= 20 LTS runtime with worker_threads enabled.'],
    },
    Process: {
        Level: 'Process',
        ExecutionSubstrate: 'Dedicated child_process OS subprocess with memory and timeout resource guards',
        Guarantees: [
            'Isolates execution in a separate OS process crash domain with V8 --max-old-space-size and active RSS memory monitoring plus OS resource guards.',
            'Enforces wall-clock execution timeout with SIGTERM followed by SIGKILL escalation.',
            'Propagates non-zero exit codes, OS termination signals, stderr diagnostics, and spawn/startup failures cleanly.',
        ],
        Limitations: [
            'Shares host OS kernel, filesystem ACLs, and network namespace of the MJAPI service user unless wrapped by Container isolation.',
        ],
        Prerequisites: ['Node.js binary reachable at process.execPath with child_process spawn permissions.'],
    },
    Container: {
        Level: 'Container',
        ExecutionSubstrate: 'OCI container runtime (Docker / Podman) with cgroup memory/CPU limits and disabled network',
        Guarantees: [
            'Full kernel namespace (PID, mount, network, IPC) and cgroup memory (--memory, --memory-swap) + CPU (--cpus) containment across both V8 heap and native/Buffer allocations.',
            'Defaults to hardened flags: --rm, --network none, --read-only, and --security-opt no-new-privileges.',
            'Detects cgroup OOM kills (exit code 137 / OOMKilled), timeouts, runtime startup failures, and non-zero exits cleanly.',
        ],
        Limitations: [
            'Higher cold-start latency per execution than InProcess or Worker modes.',
            'Requires an installed, running OCI container runtime (Docker Engine or Podman) and accessible runtime image.',
        ],
        Prerequisites: [
            'Docker Engine >= 20.10 or Podman >= 4.0 CLI binary available on PATH (configured via Isolation.ContainerRuntime).',
            'Container daemon/socket accessible by the MJAPI host user without interactive sudo.',
            'Configured OCI runtime image (default: node:20-alpine, overridable via Isolation.ContainerImage) pulled locally or reachable in registry.',
            'Host cgroup v2 memory/CPU controllers enabled on Linux (or Docker Desktop VM memory bounds on macOS/Windows).',
        ],
    },
};

/**
 * Minimal outcome shape returned by an in-process task step callback when wrapped by an isolation runner.
 */
export interface TaskGraphIsolationStepOutcome {
    Success: boolean;
    Paused?: boolean;
    PauseReason?: string;
    Output?: unknown;
    ErrorMessage?: string;
    AgentRunID?: string | null;
    ChatMessage?: string;
    PromptRunID?: string;
    ActionLogID?: string;
    PayloadAtStart?: Record<string, unknown>;
    ResultCode?: string;
    IsOutputTainted?: boolean;
    CostUsd?: number;
    TokensUsed?: number;
}

/**
 * Workload executed inside an isolation runner.
 */
export type TaskGraphIsolationWorkload =
    | {
          readonly Kind: 'InProcessCallback';
      }
    | {
          readonly Kind: 'InlineScript';
          /**
           * Self-contained JavaScript/CommonJS body executed in the isolated runtime.
           * Receives `input` in scope; its returned object (or Promise resolving to an object)
           * becomes the execution `Output`.
           */
          readonly Script: string;
          readonly Input?: Readonly<Record<string, unknown>>;
      }
    | {
          readonly Kind: 'Module';
          readonly ModulePath: string;
          readonly ExportName?: string;
          readonly Args?: Readonly<Record<string, unknown>>;
      };

/**
 * Input passed to a {@link TaskGraphIsolationRunner}.
 */
export interface TaskGraphIsolationRunRequest<
    TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome,
> {
    readonly Level: TaskGraphIsolationLevel;
    readonly TaskID: string;
    readonly TaskName: string;
    readonly GraphID: string;
    readonly Workload: TaskGraphIsolationWorkload;
    /** Callback executing the standard in-process step pipeline when `Workload.Kind === 'InProcessCallback'`. */
    readonly ExecuteInProcess?: () => Promise<TOutcome>;
    /** Effective isolation limits resolved via `LimitsConfigResolver` (`Limits.Isolation`). */
    readonly Limits?: Partial<MJLimitsIsolationConfig>;
    /** Explicit step-level timeout override in milliseconds. */
    readonly TimeoutMs?: number;
}

/**
 * Normalized outcome produced by a {@link TaskGraphIsolationRunner}.
 */
export interface TaskGraphIsolationExecutionResult<
    TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome,
> {
    readonly Success: boolean;
    readonly IsolationLevel: TaskGraphIsolationLevel;
    readonly Output?: Record<string, unknown>;
    readonly ErrorMessage?: string;
    readonly ErrorCode?: string;
    readonly TerminationReason: TaskGraphIsolationTerminationReason;
    readonly ExitCode?: number | null;
    readonly Signal?: string | null;
    readonly DurationMs: number;
    readonly Stdout?: string;
    readonly Stderr?: string;
    readonly BodyOutcome?: TOutcome;
}

/**
 * Runtime strategy executing a task workload at one {@link TaskGraphIsolationLevel}.
 */
export interface TaskGraphIsolationRunner {
    readonly Level: TaskGraphIsolationLevel;
    Execute<TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>>;
}

/**
 * Map of registered isolation runners keyed by {@link TaskGraphIsolationLevel}.
 */
export type TaskGraphIsolationRunnerMap = Partial<Record<TaskGraphIsolationLevel, TaskGraphIsolationRunner>>;

/**
 * Resolves the effective isolation level for a workflow or submitted graph.
 * Precedence: explicit runtime override > persisted graph/spec `isolation` > owning workflow entity `Isolation` > `LimitsConfigResolver` default (`'Worker'`).
 */
export function ResolveTaskGraphIsolation(args: {
    OverrideIsolation?: TaskGraphIsolationLevel | null;
    GraphIsolation?: TaskGraphIsolationLevel | null;
    WorkflowIsolation?: TaskGraphIsolationLevel | null;
    LimitsOverride?: MJLimitsOverride | null;
}): TaskGraphIsolationLevel {
    if (IsTaskGraphIsolationLevel(args.OverrideIsolation)) {
        return args.OverrideIsolation;
    }
    if (IsTaskGraphIsolationLevel(args.GraphIsolation)) {
        return args.GraphIsolation;
    }
    if (IsTaskGraphIsolationLevel(args.WorkflowIsolation)) {
        return args.WorkflowIsolation;
    }
    return LimitsConfigResolver.Resolve({
        AgentOrWorkflowMetadata: args.LimitsOverride ?? undefined,
    }).Limits.Isolation.DefaultIsolation;
}

/**
 * Direct host-event-loop runner implementing `'InProcess'` isolation semantics.
 */
export class InProcessIsolationRunner implements TaskGraphIsolationRunner {
    public readonly Level: TaskGraphIsolationLevel = 'InProcess';

    public async Execute<TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
        request: TaskGraphIsolationRunRequest<TOutcome>,
    ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> {
        const startedAt = Date.now();
        try {
            if (request.Workload.Kind === 'InProcessCallback') {
                if (!request.ExecuteInProcess) {
                    return {
                        Success: false,
                        IsolationLevel: this.Level,
                        TerminationReason: 'Error',
                        ErrorCode: 'MISSING_CALLBACK',
                        ErrorMessage: 'InProcessIsolationRunner requires ExecuteInProcess for InProcessCallback workloads.',
                        DurationMs: Date.now() - startedAt,
                    };
                }
                const outcome = await request.ExecuteInProcess();
                const outputObj =
                    outcome.Output && typeof outcome.Output === 'object' && !Array.isArray(outcome.Output)
                        ? (outcome.Output as Record<string, unknown>)
                        : undefined;
                return {
                    Success: outcome.Success,
                    IsolationLevel: this.Level,
                    Output: outputObj,
                    ErrorMessage: outcome.ErrorMessage,
                    TerminationReason: outcome.Success ? 'Completed' : 'Error',
                    DurationMs: Date.now() - startedAt,
                    BodyOutcome: outcome,
                };
            }

            if (request.Workload.Kind === 'InlineScript') {
                const fn = new Function('input', `'use strict'; return (async () => { ${request.Workload.Script} })();`) as (
                    input: Record<string, unknown>,
                ) => Promise<unknown>;
                const rawResult = await fn({ ...(request.Workload.Input ?? {}) });
                const normalized = normalizeOutputRecord(rawResult);
                return {
                    Success: true,
                    IsolationLevel: this.Level,
                    Output: normalized,
                    TerminationReason: 'Completed',
                    DurationMs: Date.now() - startedAt,
                };
            }

            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorCode: 'UNSUPPORTED_INPROCESS_MODULE',
                ErrorMessage: 'InProcessIsolationRunner does not dynamically load arbitrary file modules without a host runner.',
                DurationMs: Date.now() - startedAt,
            };
        } catch (err) {
            return {
                Success: false,
                IsolationLevel: this.Level,
                TerminationReason: 'Error',
                ErrorMessage: err instanceof Error ? err.message : String(err),
                DurationMs: Date.now() - startedAt,
            };
        }
    }
}

function normalizeOutputRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return { value };
}
