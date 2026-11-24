import { MJAIAgentHarnessEntity } from '@memberjunction/core-entities';
import { SandboxExecutor } from './sandbox/SandboxExecutor.js';

/** Sandbox execution provider kind. */
export type HarnessSandboxProviderType = 'local' | 'docker' | 'cloud';

/**
 * Authentication mode for local CLI harness sessions.
 * - `'auto'` — prefer local CLI subscription login on local CLI adapters when no explicit API-key grant is bound.
 * - `'cli-login'` — strictly use the user's logged-in local CLI subscription (strips all API-key env vars).
 * - `'api-key'` — use granted `MJ: AI Agent Credentials` or server fallback API keys.
 */
export type HarnessAuthMode = 'auto' | 'cli-login' | 'api-key';

/** Outbound network posture inside a cloud agent sandbox. */
export type CloudNetworkAccess = 'none' | 'restricted' | 'egress';

/** Waiting strategy while a remote cloud agent turn is executing. */
export type CloudWaitMode = 'bounded-poll' | 'adaptive-wake';

/** Normalized execution state of a remote cloud agent session or interaction. */
export type CloudExecutionState = 'completed' | 'running' | 'failed' | 'cancelled';

/**
 * Cloud-specific runtime options when `sandbox.provider === 'cloud'`.
 */
export interface CloudSandboxOptions {
    endpointUrl?: string;
    region?: string;
    projectId?: string;
    environmentId?: string;
    repositoryUrl?: string;
    gitRef?: string;
    gitBranch?: string;
    networkAccess?: CloudNetworkAccess;
    waitMode?: CloudWaitMode;
    turnWaitBudgetMs?: number;
    pollIntervalMs?: number;
    mcpExternalServerUrl?: string;
    extraHeaders?: Record<string, string>;
}

/**
 * Normalized cloud workspace and execution settings attached to a provisioned `SandboxHandle`.
 */
export interface CloudSandboxMetadata {
    Provider: 'cloud';
    SessionKey: string;
    EndpointUrl?: string;
    Region?: string;
    ProjectId?: string;
    EnvironmentId?: string;
    RepositoryUrl?: string;
    GitRef?: string;
    GitBranch?: string;
    NetworkAccess: CloudNetworkAccess;
    WaitMode: CloudWaitMode;
    TurnWaitBudgetMs: number;
    PollIntervalMs: number;
    McpExternalServerUrl?: string;
    ExtraHeaders?: Record<string, string>;
}

/**
 * Additive cloud execution capability flags layered onto `AIAgentHarness.CapabilitySettings`.
 */
export interface HarnessCloudCapabilities {
    /** Whether the adapter executes remotely over HTTP against a cloud agent service rather than spawning a local/container CLI process. */
    SupportsCloudExecution?: boolean;
    /** Whether the adapter supports detaching cleanly from an in-flight cloud session (`adaptive-wake`) and re-attaching on the next `AgentWake`. */
    SupportsAsyncWakeHandoff?: boolean;
}

/**
 * What a harness adapter can do, mirrored from `AIAgentHarness.CapabilitySettings`.
 *
 * Derived from the entity's generated JSONType accessor rather than restated here, so this stays in
 * lockstep with the interface CodeGen emits from `IHarnessCapabilitySettings.ts`. Restating the
 * shape by hand is the value-list drift trap in a different costume.
 */
export type HarnessCapabilities = NonNullable<MJAIAgentHarnessEntity['CapabilitySettingsObject']> &
    HarnessCloudCapabilities;

/**
 * Everything an adapter needs to launch a harness session.
 *
 * Assembled once per run by {@link HarnessAgentBase} and handed to
 * {@link BaseHarnessAdapter.StartSession}. Nothing here is re-derived per turn — a session's
 * identity, workspace and credentials are fixed for its lifetime.
 */
export interface HarnessSessionConfig {
    /**
     * Runs harness processes inside the sandbox.
     *
     * Adapters MUST go through this rather than calling `spawn` themselves. An adapter that spawns
     * directly always runs on the MJAPI host, which in production means an autonomous agent
     * executing shell commands inside the API container with its network reach and cloud
     * credentials — and, worse, it does so while the agent's config claims `provider: 'docker'`.
     * Routing through the executor is what makes the sandbox choice real rather than decorative.
     */
    Executor: SandboxExecutor;
    /**
     * Workspace path AS THE HARNESS SEES IT — a host path under the local provider, a
     * container-internal path under Docker. Pass it to harness processes; do not open it with `fs`.
     */
    WorkspacePath: string;
    /**
     * Environment variables injected into the harness process — the LLM key and any granted
     * integration tokens resolved from `MJ: AI Agent Credentials`.
     *
     * This is the ONLY channel by which a secret reaches the sandbox, and it carries exactly what
     * the agent was granted. Never DB credentials, never a user token, never a general MJ API key.
     */
    Environment: Record<string, string>;
    /** MCP endpoint for the read-only intra-turn loopback; omitted when the harness has no MCP client. */
    McpServerUrl?: string;
    /** Per-run, read-only, scope-limited MCP credential. Revoked at teardown on every exit path. */
    McpCredential?: string;
    /**
     * A prior session this run MAY continue, when one exists for the same agent and conversation.
     *
     * Offered, not imposed. Only adapters whose harness can genuinely resume should act on it, and
     * they must report the outcome through {@link BaseHarnessAdapter.DidResumeSession} — because the
     * caller sends a DIFFERENT turn input depending on whether the resume took. Guessing wrong in
     * either direction is costly: assume resumed when it was not and the harness has no context;
     * assume fresh when it did resume and it receives the conversation twice.
     */
    ResumeSessionId?: string;
    /**
     * What the agent may do inside the sandbox. Adapters translate this into their own flags via
     * {@link BaseHarnessAdapter.ApplyPermissionPolicy}, or ignore it if they cannot enforce it.
     */
    PermissionPolicy?: HarnessPermissionPolicy;
    /** Model to request, when the harness honours one (`CapabilitySettings.ModelSelection`). */
    Model?: string;
    /** Aborts in-flight work; honoured mid-turn only when `CapabilitySettings.MidTurnCancellation`. */
    CancellationToken?: AbortSignal;
    /** Optional system instructions supplied at session initialization. */
    SystemPrompt?: string;
    /** Cloud runtime configuration when `sandbox.provider === 'cloud'`. */
    CloudOptions?: CloudSandboxOptions;
    /** Normalized cloud metadata produced by `CloudSandboxProvider.Provision`. */
    SandboxMetadata?: CloudSandboxMetadata;
    /** When true, instructs a resumed cloud session to harvest an already-submitted background turn without posting a duplicate turn. */
    ReattachPendingTurn?: boolean;
    /** Extra host directories exposed to CLI harnesses via `--add-dir`. */
    AdditionalDirectories?: string[];
    /** Effective authentication mode resolved for this harness session. */
    AuthMode?: HarnessAuthMode;
}

/** Alias for {@link HarnessSessionConfig} used by cloud session initialization callers. */
export type HarnessSessionInit = HarnessSessionConfig;

/**
 * Events an adapter emits while a turn is in flight.
 *
 * Deliberately a small, closed set. Anything the harness does INSIDE its sandbox that does not
 * cross one of these boundaries is governed by posture policy, not recorded as a run step — the
 * opaque-super-step property of this design, which is intentional and must stay documented rather
 * than quietly widened.
 */
export type HarnessTurnEvent =
    /** Streamed narration, surfaced to `onProgress` and never persisted as a step. */
    | { Type: 'assistant-text'; Text: string }
    /** Streamed model reasoning/thinking tokens for live observability. */
    | { Type: 'thinking-delta'; Text: string }
    /** Structured tool invocation start emitted by CLI or cloud harnesses for live observability. */
    | { Type: 'tool-use-start'; ToolCallId: string; ToolName: string; ArgumentsJson?: string }
    /** Structured tool execution result emitted by CLI or cloud harnesses for live observability. */
    | { Type: 'tool-result'; ToolCallId: string; ToolName?: string; Output: string; IsError?: boolean }
    /** Informational in-sandbox activity (file edit, shell command) for live view only. */
    | { Type: 'sandbox-activity'; Description: string }
    /** Throttled liveness pulse emitted on raw stdout/stderr or unmapped adapter activity. */
    | { Type: 'liveness-heartbeat'; Source?: 'stdout' | 'stderr' | 'event'; Timestamp?: string }
    /** The harness wants to do something the posture gates; becomes an `MJ: AI Agent Requests` row. */
    | { Type: 'permission-request'; RequestId: string; Description: string; Command?: string }
    /** Token/cost usage for the turn. Without this the run cannot be accounted for — see below. */
    | {
          Type: 'usage';
          InputTokens: number;
          OutputTokens: number;
          PromptTokens?: number;
          CompletionTokens?: number;
          ThinkingTokens?: number;
          CostUsd?: number;
      }
    /** The turn ended. `RawText` is expected to carry the Loop next-step JSON envelope. */
    | {
          Type: 'turn-complete';
          RawText: string;
          CloudExecutionState?: CloudExecutionState;
          AsyncWakePending?: boolean;
          SessionId?: string;
          ArtifactUrls?: string[];
          PullRequestUrl?: string;
      }
    /** The session failed. Terminal for the turn; the run decides whether to retry. */
    | { Type: 'session-error'; Error: string; CloudExecutionState?: CloudExecutionState };

/**
 * The accumulated outcome of one harness turn, assembled by {@link HarnessAgentBase} from the
 * adapter's event stream.
 */
export interface HarnessTurnResult {
    /** Raw turn-end text, handed to the Loop JSON parser exactly as a prompt response would be. */
    RawText: string;
    /** Summed usage for the turn. Zeros when the harness reports none — which is itself a finding. */
    InputTokens: number;
    OutputTokens: number;
    ThinkingTokens?: number;
    CostUsd?: number;
    /** Set when the turn failed rather than completed. */
    ErrorMessage?: string;
    /** True when the turn was stopped because it exceeded limits.maxWallClockSeconds. */
    TimedOut?: boolean;
    /** True when the turn was stopped by the inactivity watchdog or repeated tool-loop detector. */
    Stalled?: boolean;
    /** Descriptive diagnostic explaining why the turn was marked stalled. */
    StallReason?: string;
    /** Vendor session id, persisted to `AIAgentRun.ExternalSessionID` for resume and log correlation. */
    SessionId?: string;
    /**
     * The model the harness ACTUALLY used, as it reported it (e.g. `claude-opus-4-6`).
     *
     * Distinct from the model we asked for. A harness free to pick its own model will, and recording
     * the one we assumed instead of the one it used makes cost attribution wrong — Opus and Sonnet
     * are not the same price.
     */
    ReportedModel?: string;
    /** Terminal or detached cloud execution state when driven by a `BaseCloudHarnessAdapter`. */
    CloudExecutionState?: CloudExecutionState;
    /** True when the turn detached cleanly in `adaptive-wake` mode and awaits the next `AgentWake`. */
    AsyncWakePending?: boolean;
    /** Optional artifact URLs reported by a cloud agent run. */
    ArtifactUrls?: string[];
    /** Optional pull request URL created or updated by a cloud agent run. */
    PullRequestUrl?: string;
}

/** Where a harness workspace lives and how long it survives. */
export type HarnessWorkspaceScope = 'run' | 'agent' | 'agent-user';

/** What the sandbox may reach on the network. */
export type HarnessNetworkPolicy = 'none' | 'mcp-only' | 'allowlist' | 'open';

/** How much in-sandbox autonomy the harness gets before MJ interposes a human. */
export type HarnessPosture = 'strict' | 'auto' | 'dangerous';

/**
 * What the agent is permitted to do inside its sandbox, expressed in MJ's vocabulary rather than
 * any harness's.
 *
 * ## Why this exists as an abstraction
 *
 * Every harness has its own permission mechanism and its own spelling — Claude Code has
 * `--permission-mode` with six modes plus `--allowedTools` patterns, others have none at all. Left
 * unabstracted, permissions would be configured per-harness, and switching harnesses would silently
 * change what an agent may do. That is the opposite of the property this whole design exists for:
 * MJ owns authority, the harness supplies reasoning.
 *
 * So the posture and tool patterns are declared ONCE in agent metadata, overridable per run, and
 * each adapter translates them into its own flags — or ignores them and reports that it cannot
 * enforce them.
 *
 * ## The postures
 *
 * - `strict` — nothing mutating without human approval. Honest today only where an adapter can
 *   actually intercept; where it cannot, the harness's own prompts have nowhere to go in headless
 *   mode and every tool call simply denies. That is a real, observed outcome, not a hypothetical:
 *   an agent asked to run `git status` across repos had all 21 calls blocked and correctly stopped
 *   to ask for permission MJ had no way to grant.
 * - `auto` — the harness proceeds on its own for anything inside {@link AllowedTools}, and is
 *   refused anything in {@link DisallowedTools}. The workable default until HITL lands.
 * - `dangerous` — no gating at all. Only defensible inside a contained sandbox; the Docker provider
 *   with a real network policy is the intended pairing, not the local provider.
 */
export interface HarnessPermissionPolicy {
    /** How much autonomy the harness gets. See the posture notes above. */
    Posture: HarnessPosture;
    /**
     * Tool patterns the agent may use without asking, in the harness's own pattern language
     * (e.g. `Bash(git:*)`, `Read`, `Grep`). Deliberately passed through rather than normalised:
     * inventing an MJ-wide tool taxonomy would be a lossy translation of every harness's model, and
     * the patterns are the part operators actually reason about.
     */
    AllowedTools?: string[];
    /** Tool patterns the agent must never use. Takes precedence over {@link AllowedTools}. */
    DisallowedTools?: string[];
}

/**
 * Runtime bounds and watchdog limits applied to a harness turn.
 */
export interface HarnessTurnLimits {
    /** Hard wall-clock ceiling for a single turn, in seconds. */
    maxWallClockSeconds?: number;
    /**
     * Rolling inactivity timeout in seconds. Reset on every emitted {@link HarnessTurnEvent}
     * (including `liveness-heartbeat` pulses from raw stdout/stderr activity).
     */
    maxIdleSeconds?: number;
    /**
     * Maximum consecutive identical `(ToolName, canonical ArgumentsJson)` tool calls allowed
     * before aborting the turn as stalled.
     */
    maxConsecutiveIdenticalToolCalls?: number;
    /**
     * Minimum interval in seconds between {@link HarnessActivityHeartbeatCallback} invocations
     * while live events are streaming. Defaults to 60 seconds.
     */
    heartbeatIntervalSeconds?: number;
}

/**
 * Activity heartbeat payload delivered to {@link HarnessActivityHeartbeatCallback} during a turn.
 */
export interface HarnessActivityHeartbeatInfo {
    /** Wall-clock milliseconds elapsed since the current turn began. */
    ElapsedMs: number;
    /** Event `Type` of the latest {@link HarnessTurnEvent} observed. */
    LastEventType: string;
}

/**
 * Optional callback invoked periodically on live turn activity so callers can renew external
 * run leases or publish liveness telemetry without polling.
 */
export type HarnessActivityHeartbeatCallback = (
    info: HarnessActivityHeartbeatInfo,
) => void | Promise<void>;

/** Canonical CLI vendor keys supported by the multi-account subscription pool. */
export type HarnessPoolVendor = 'claude' | 'agy' | 'codex' | 'gemini';

/** Balancing strategy used by {@link HarnessAccountPoolService} to select a healthy CLI account slot. */
export type HarnessAccountSelectionStrategy =
    | 'least-in-flight'
    | 'round-robin'
    | 'weighted'
    | 'priority-failover';

/**
 * Per-run multi-account CLI subscription pool options.
 *
 * Enabled automatically whenever effective `authMode` resolves to `'cli-login'` and at least one
 * healthy pool or OS-default slot exists for the harness vendor.
 */
export interface HarnessAccountPoolExecutionOptions {
    /** Explicitly enable (`true`) or disable (`false`) account pooling for this run. */
    enabled?: boolean;
    /** Override the pool's default slot selection strategy for this run. */
    strategy?: HarnessAccountSelectionStrategy;
    /** Pin execution to a specific enrolled or OS-default slot ID. */
    slotId?: string;
    /** Maximum automatic mid-run account failovers on quota/rate-limit errors. Defaults to 3. */
    maxAccountSwitchesPerRun?: number;
    /** Optional lease TTL in milliseconds. */
    leaseTtlMs?: number;
    /** Optional pool directory override (defaults to `MJ_HARNESS_ACCOUNT_POOL_DIR` or `~/.mj/harness-accounts`). */
    poolDir?: string;
}

/**
 * Per-run execution limits, liveness hooks, and multi-account pool controls for a harness turn.
 */
export interface HarnessRunConfig {
    /** Wall-clock, idle watchdog, repeated tool-loop, and heartbeat cadence limits. */
    limits?: HarnessTurnLimits;
    /** Optional hook invoked periodically on live turn activity. */
    onActivityHeartbeat?: HarnessActivityHeartbeatCallback;
    /** Optional multi-account CLI subscription pool controls. */
    accountPool?: HarnessAccountPoolExecutionOptions;
}

/**
 * Execution options accepted by {@link HarnessAgentBase} runs and callers configuring limits,
 * liveness heartbeats, and multi-account CLI subscription pooling.
 */
export type HarnessExecutionOptions = HarnessRunConfig;
