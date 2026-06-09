/**
 * @fileoverview Topology-agnostic broker that executes a single realtime tool call server-side.
 *
 * The {@link RealtimeToolBroker} owns the *tool-execution* half of a realtime session: given a
 * provider {@link RealtimeToolCall}, it routes the call (the stable `invoke-target-agent` tool →
 * delegate to the target agent; every other tool → an injected tool executor), owns the per-call
 * {@link AbortController} so barge-in can cancel an in-flight delegated run, and serializes the
 * success/error result into the exact JSON the model expects as a `tool_response`.
 *
 * **Why factor this out.** Both audio topologies must execute a realtime tool call *identically*:
 * the **server-bridged** path ({@link RealtimeSessionRunner}, where the provider socket lives on the
 * server) and the **client-direct** path (where the browser owns the socket and relays tool calls
 * back to a server resolver). Keeping one broker guarantees the two paths produce byte-for-byte
 * identical tool results, including structured errors for spoken-error-handling. The broker is the
 * single tool-execution path both topologies share.
 *
 * **Dependency injection.** Every collaborator that would otherwise pull in `BaseAgent`, metadata,
 * or the database is injected via {@link RealtimeToolBrokerDeps}, keeping the broker fully
 * unit-testable against mocks.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { RealtimeToolCall } from '@memberjunction/ai';

/**
 * The stable name of the primary tool every Voice Co-Agent registers with the realtime provider.
 *
 * Per the plan's design rule, the realtime-registered tool set is **target-independent**: the
 * co-agent always exposes this single `invoke-target-agent` tool, and the specific target is a
 * runtime parameter passed *inside* the call — never a different tool per target. This keeps the
 * provider contract identical across targets (and is what lets a pre-provisioned, fixed-tool
 * provider like Eleven Labs fit the same model later).
 */
export const INVOKE_TARGET_AGENT_TOOL_NAME = 'invoke-target-agent';

/**
 * A request to delegate work to the target agent, derived from an `invoke-target-agent` tool call.
 */
export interface DelegateToTargetRequest {
    /** The provider-assigned call ID, used to correlate the eventual tool result. */
    CallID: string;
    /**
     * The raw arguments JSON string the model emitted for the call (e.g. the natural-language
     * request to hand to the target agent). The delegate parses this into the target's expected
     * input shape.
     */
    Arguments: string;
    /**
     * Abort signal owned by the broker for this specific delegated call. On barge-in
     * ({@link RealtimeToolBroker.AbortInFlight}), the broker aborts the controller behind this
     * signal so a stale delegated result is never narrated into a conversation that has moved on.
     */
    AbortSignal: AbortSignal;
}

/**
 * The result of a delegated target-agent run, fed back to the realtime model as a tool response.
 */
export interface DelegatedResult {
    /** The provider call ID this result corresponds to. */
    CallID: string;
    /** Whether the delegated run completed successfully. */
    Success: boolean;
    /**
     * The textual outcome to narrate (on success) or the error to surface (on failure). The
     * driver feeds this back to the model as the `tool_response` so it can speak the outcome.
     */
    Output: string;
    /**
     * When the delegated run paused awaiting user feedback (an interactive target agent, e.g.
     * Query Builder confirming a task graph), this carries the paused run's id so the transport
     * layer can persist it and resume the SAME run on the user's next answer (rather than starting
     * a fresh run). Absent when the run completed (or failed) without pausing. The {@link Output} in
     * this case is the agent's clarifying QUESTION, and {@link Success} is `true` (a valid
     * intermediate outcome).
     */
    PausedRunID?: string;
}

/**
 * A non-target tool call routed to the injected {@link RealtimeToolBrokerDeps.ExecuteTool} handler.
 * This is any tool other than `invoke-target-agent` (e.g. a UI/control tool such as `ShowChart`, or
 * a fast server/client tool the co-agent was given directly).
 */
export interface ToolExecutionResult {
    /** The provider call ID this result corresponds to. */
    CallID: string;
    /** Whether the tool executed successfully. */
    Success: boolean;
    /** The textual result to feed back to the model as the tool response. */
    Output: string;
}

/**
 * Verbose-aware status logging callback.
 */
export type RealtimeStatusLogger = (message: string, verboseOnly?: boolean) => void;

/**
 * Error logging callback.
 */
export type RealtimeErrorLogger = (error: Error | string) => void;

/**
 * The serialized outcome of executing a realtime tool call.
 *
 * {@link RealtimeToolBroker.ExecuteToolCall} returns this so the *transport* layer (server-bridged
 * session or client-direct resolver) can feed {@link ExecutedToolCall.ResultJson} back to the model
 * (e.g. via `IRealtimeSession.SendToolResult`) without knowing anything about how the result was
 * produced.
 */
export interface ExecutedToolCall {
    /**
     * The JSON-stringified tool result, shaped exactly as the model expects: `{ success, output }`
     * on success or `{ success: false, error }` on failure (consistent structured errors so the
     * model can narrate the failure — spoken-error-handling).
     */
    ResultJson: string;
    /** Whether the tool/delegation completed successfully. */
    Success: boolean;
    /**
     * When the delegated target-agent run paused awaiting user feedback, this surfaces the paused
     * run's id (propagated from {@link DelegatedResult.PausedRunID}) so the transport layer can
     * persist it and resume that run on the user's next answer. Absent for non-delegation tools and
     * for delegated runs that completed without pausing.
     */
    PausedRunID?: string;
}

/**
 * The injected collaborators the broker needs to execute a tool call.
 *
 * Each member is a seam that decouples the broker from `BaseAgent`/metadata/DB so it can be
 * exercised with mocks. In production, the {@link RealtimeSessionRunner} (and, in P5b, the
 * client-direct server resolver) constructs these from `BaseAgent`-backed implementations.
 */
export interface RealtimeToolBrokerDeps {
    /**
     * Runs the target agent for an `invoke-target-agent` tool call. The broker creates and owns a
     * fresh {@link AbortController} per delegated call and passes its signal in via
     * {@link DelegateToTargetRequest.AbortSignal}; barge-in aborts it. In production this is backed
     * by `BaseAgent.ExecuteSubAgent` (top-level target only — sub-agents are not exposed).
     */
    DelegateToTarget: (request: DelegateToTargetRequest) => Promise<DelegatedResult>;

    /**
     * Executes a non-target tool call (any tool other than `invoke-target-agent`). In production
     * this routes to the co-agent's server/client/UI tool execution under the session's context
     * user.
     */
    ExecuteTool: (call: RealtimeToolCall) => Promise<ToolExecutionResult>;

    /** Optional verbose-aware status logger. */
    LogStatus?: RealtimeStatusLogger;

    /** Optional error logger. */
    LogError?: RealtimeErrorLogger;
}

/**
 * Executes a single realtime tool call server-side, identically across both audio topologies.
 *
 * Construct with a {@link RealtimeToolBrokerDeps}, then call {@link ExecuteToolCall} per provider
 * tool call. The broker routes the call, owns the abort controller for an in-flight delegated run,
 * and returns the serialized {@link ExecutedToolCall} the transport layer relays back to the model.
 */
export class RealtimeToolBroker {
    private deps: RealtimeToolBrokerDeps;

    /** The abort controller for the currently in-flight delegated run, if any. */
    private currentDelegationController: AbortController | null = null;

    /**
     * @param deps The injected collaborators that execute tool calls.
     */
    constructor(deps: RealtimeToolBrokerDeps) {
        this.deps = deps;
    }

    /**
     * Executes a realtime tool call and returns its serialized result.
     *
     * Routes `invoke-target-agent` → {@link RealtimeToolBrokerDeps.DelegateToTarget} (creating and
     * owning a per-call {@link AbortController} so {@link AbortInFlight} can cancel it on barge-in),
     * and every other tool → {@link RealtimeToolBrokerDeps.ExecuteTool}. Always resolves with an
     * {@link ExecutedToolCall} — failures are serialized as structured errors rather than thrown, so
     * the model always receives a consistent `tool_response`.
     *
     * @param call The tool-call request emitted by the model.
     * @returns The serialized result the transport layer relays back to the model.
     */
    public async ExecuteToolCall(call: RealtimeToolCall): Promise<ExecutedToolCall> {
        if (call.ToolName === INVOKE_TARGET_AGENT_TOOL_NAME) {
            return this.runInvokeTarget(call);
        }
        return this.runOtherTool(call);
    }

    /**
     * Aborts the in-flight delegated run's controller (if any).
     *
     * Called by the transport layer on barge-in so a stale delegated result is never narrated into a
     * conversation that has moved on. Safe no-op when no delegation is in flight.
     */
    public AbortInFlight(): void {
        if (this.currentDelegationController) {
            this.currentDelegationController.abort();
            this.currentDelegationController = null;
        }
    }

    /**
     * Delegates an `invoke-target-agent` call to the target agent, owning a fresh
     * {@link AbortController} so {@link AbortInFlight} can cancel the in-flight run on barge-in.
     *
     * @param call The `invoke-target-agent` tool call.
     * @returns The serialized delegation result (or structured error).
     */
    private async runInvokeTarget(call: RealtimeToolCall): Promise<ExecutedToolCall> {
        const controller = new AbortController();
        this.currentDelegationController = controller;
        try {
            const result = await this.deps.DelegateToTarget({
                CallID: call.CallID,
                Arguments: call.Arguments,
                AbortSignal: controller.signal
            });
            return this.serializeResult(result.Success, result.Output, result.PausedRunID);
        } catch (error) {
            this.logError(error, 'delegating to target agent');
            return this.serializeError(error);
        } finally {
            // Only clear if this is still the active controller (a later delegation may have replaced it).
            if (this.currentDelegationController === controller) {
                this.currentDelegationController = null;
            }
        }
    }

    /**
     * Routes a non-target tool call to the injected tool executor.
     *
     * @param call The tool call (any tool other than `invoke-target-agent`).
     * @returns The serialized tool result (or structured error).
     */
    private async runOtherTool(call: RealtimeToolCall): Promise<ExecutedToolCall> {
        try {
            const result = await this.deps.ExecuteTool(call);
            return this.serializeResult(result.Success, result.Output);
        } catch (error) {
            this.logError(error, `executing tool '${call.ToolName}'`);
            return this.serializeError(error);
        }
    }

    /**
     * Serializes a successful tool/delegation outcome to the model's expected `tool_response` shape.
     *
     * @param success Whether the tool/delegation completed successfully.
     * @param output The textual outcome (narration on success, error text on failure).
     * @param pausedRunID When the delegated run paused awaiting feedback, the paused run's id to
     *   surface for resumption. Omitted for completed runs and non-delegation tools.
     * @returns The serialized result.
     */
    private serializeResult(success: boolean, output: string, pausedRunID?: string): ExecutedToolCall {
        return { ResultJson: JSON.stringify({ success, output }), Success: success, PausedRunID: pausedRunID };
    }

    /**
     * Serializes a thrown error to a structured error `tool_response` so the model can narrate the
     * failure (consistent with the plan's spoken-error-handling) rather than leaving the call
     * unanswered.
     *
     * @param error The thrown error or message.
     * @returns The serialized error result (always `Success: false`).
     */
    private serializeError(error: unknown): ExecutedToolCall {
        const message = error instanceof Error ? error.message : String(error);
        return { ResultJson: JSON.stringify({ success: false, error: message }), Success: false };
    }

    /**
     * Logs an error via the injected logger (if any), prefixed with the failing operation.
     *
     * @param error The thrown error or message.
     * @param operation A short description of what was being attempted.
     */
    private logError(error: unknown, operation: string): void {
        const message = error instanceof Error ? error.message : String(error);
        this.deps.LogError?.(`RealtimeToolBroker error while ${operation}: ${message}`);
    }
}
