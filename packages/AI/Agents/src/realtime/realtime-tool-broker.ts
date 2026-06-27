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
import { AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
import { RealtimeDisclosurePolicy } from './realtime-coagent-config';

/**
 * The stable name of the primary tool every Realtime Co-Agent registers with the realtime provider.
 *
 * Per the plan's design rule, the realtime-registered tool set is **target-independent**: the
 * co-agent always exposes this single `invoke-target-agent` tool, and the specific target is a
 * runtime parameter passed *inside* the call — never a different tool per target. This keeps the
 * provider contract identical across targets (and is what lets a pre-provisioned, fixed-tool
 * provider like Eleven Labs fit the same model later).
 */
export const INVOKE_TARGET_AGENT_TOOL_NAME = 'invoke-target-agent';

/**
 * **The single producer of the realtime co-agent's identity framing.** Builds the opening of the companion
 * system prompt that makes the agent speak first-person **AS the target agent** (Sage, Marketing Agent, …),
 * delegating real work through `invoke-target-agent`. EVERY host (native chat, LiveKit, future Zoom/Teams)
 * uses this — so the agent's identity is byte-for-byte the same everywhere. Do NOT inline this framing in a
 * host; that is exactly the drift the convergence removed. See
 * `plans/realtime/realtime-core-host-convergence.md`.
 *
 * @param targetName The LEAD agent's display name (what the co-agent identifies AS — "who the voice is").
 *   Callers pass a clear fallback (e.g. "the configured target agent") when no distinct lead is resolved.
 * @param interactiveSurfaceClause Optional trailing clause for host UX tools the co-agent drives itself
 *   (browser/whiteboard); empty for pure-voice hosts. Appended verbatim (lead with a space).
 * @param colleagues Optional set of OTHER agents the lead may delegate to (the union-accumulated
 *   allowed-agent set; Move 4). When non-empty, a "colleagues" clause is appended naming each and the
 *   per-target disclosure guidance. Empty/omitted ⇒ the classic single-target framing, byte-identical.
 * @returns The identity framing paragraph.
 */
export function BuildRealtimeAgentFraming(
    targetName: string,
    interactiveSurfaceClause = '',
    colleagues: RealtimeColleague[] = []
): string {
    return (
        `You are the real-time voice for the agent "${targetName}". Hold a natural, low-latency ` +
        `conversation with the user, always speaking in the FIRST PERSON as ${targetName} — own the work ` +
        `("I'm pulling that up", "I found three matches"); never refer to ${targetName} or the work in the ` +
        `third person. When actual work is required, call the '${INVOKE_TARGET_AGENT_TOOL_NAME}' ` +
        `tool and narrate progress while it runs — do not attempt to do the work yourself.` +
        BuildColleaguesClause(colleagues) +
        interactiveSurfaceClause
    );
}

/**
 * A colleague agent the lead co-agent may delegate to (a member of the effective allowed-agent
 * union), with the disclosure policy that governs how the handoff is narrated.
 */
export interface RealtimeColleague {
    /** The colleague agent's display name, used to address it in `invoke-target-agent` and in narration. */
    name: string;
    /** Short description of what the colleague does — helps the model decide when to delegate. */
    description?: string;
    /** How to narrate a handoff to THIS colleague (per-target override already resolved). */
    disclosure: RealtimeDisclosurePolicy;
}

/**
 * Builds the trailing "colleagues" clause for {@link BuildRealtimeAgentFraming} from the allowed-agent
 * union. Names each colleague (+ description), tells the model to pass the colleague's name in the
 * `invoke-target-agent` arguments when their expertise fits, and encodes the per-target disclosure:
 * `mention` ⇒ name the handoff aloud; `silent` ⇒ absorb and speak the result as your own;
 * `hand-voice` ⇒ (reserved) hand the mic over. Returns '' when there are no colleagues.
 *
 * @param colleagues The resolved colleague set (empty ⇒ no clause).
 * @returns The clause text (leads with a space so it appends cleanly), or ''.
 */
export function BuildColleaguesClause(colleagues: RealtimeColleague[]): string {
    if (!colleagues || colleagues.length === 0) {
        return '';
    }
    const lines = colleagues.map((c) => {
        const desc = c.description ? ` — ${c.description}` : '';
        let how: string;
        switch (c.disclosure) {
            case 'silent':
                how = 'delegate to them silently and speak their result as your own (do not mention the handoff)';
                break;
            case 'hand-voice':
                how = 'hand the conversation over to them';
                break;
            case 'mention':
            default:
                how = `briefly say you're bringing them in (e.g. "let me get ${c.name} on this") before delegating`;
                break;
        }
        return `  - "${c.name}"${desc}: ${how}.`;
    });
    return (
        ` You can also call on colleagues when their expertise fits — pass the colleague's name in the ` +
        `'${INVOKE_TARGET_AGENT_TOOL_NAME}' arguments. Your colleagues:\n${lines.join('\n')}`
    );
}

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
    /**
     * Optional progress callback the CALLER wants threaded into the delegated agent run's
     * `onProgress` (in addition to any host-level callback the delegate already wires). The
     * server-bridged {@link import('./realtime-session-runner').RealtimeSessionRunner} supplies
     * this so it can narrate the delegated run's progress over the live provider socket
     * (`SendContextNote` / `RequestSpokenUpdate`). Delegates that run agents should invoke it
     * alongside their own progress plumbing; delegates without progress support may ignore it.
     */
    OnProgress?: AgentExecutionProgressCallback;
}

/**
 * One artifact a delegated target-agent run produced, surfaced to the transport layer (and into
 * the serialized tool result as `artifacts: [{ artifactId, artifactVersionId, name }]`) so the
 * client call overlay can open it in an artifact tab while the model narrates the outcome.
 */
export interface DelegatedRunArtifact {
    /** The `MJ: Artifacts` row id. */
    ArtifactID: string;
    /** The `MJ: Artifact Versions` row id of the version this run produced. */
    ArtifactVersionID: string;
    /** The artifact's display name (tab title in the call overlay). */
    Name: string;
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
    /**
     * ID of the delegated target-agent run (`MJ: AI Agent Runs`), when one was created. Serialized
     * into the tool result as `runId` so client developer tooling (the call overlay's dev links)
     * can open the underlying run record. Absent when the delegation failed before a run existed.
     */
    RunID?: string;
    /**
     * Artifacts the delegated run produced (when artifact creation is enabled for the target and
     * the run returned a payload). Serialized into the tool result as `artifacts` so the call
     * overlay can auto-open them in artifact tabs. Absent/empty when the run produced none.
     */
    Artifacts?: DelegatedRunArtifact[];
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
    /**
     * ID of the delegated target-agent run (propagated from {@link DelegatedResult.RunID}) — also
     * embedded in {@link ResultJson} as `runId`. Absent for non-delegation tools and for
     * delegations that failed before a run was created.
     */
    RunID?: string;
    /**
     * Artifacts the delegated run produced (propagated from {@link DelegatedResult.Artifacts}) —
     * also embedded in {@link ResultJson} as `artifacts: [{ artifactId, artifactVersionId, name }]`.
     * Absent for non-delegation tools and for delegations that produced no artifacts.
     */
    Artifacts?: DelegatedRunArtifact[];
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
            return this.serializeResult(result.Success, result.Output, result.PausedRunID, result.RunID, result.Artifacts);
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
     * @param runID ID of the delegated agent run, when one was created. Embedded in the JSON as
     *   `runId` so the client overlay's developer tooling can link to the run record. Omitted for
     *   non-delegation tools.
     * @param artifacts Artifacts the delegated run produced. Embedded in the JSON as
     *   `artifacts: [{ artifactId, artifactVersionId, name }]` so the client overlay can open
     *   them in artifact tabs. Omitted when absent or empty.
     * @returns The serialized result.
     */
    private serializeResult(
        success: boolean,
        output: string,
        pausedRunID?: string,
        runID?: string,
        artifacts?: DelegatedRunArtifact[]
    ): ExecutedToolCall {
        const payload: {
            success: boolean;
            output: string;
            runId?: string;
            artifacts?: { artifactId: string; artifactVersionId: string; name: string }[];
        } = { success, output };
        if (runID) {
            payload.runId = runID;
        }
        const hasArtifacts = artifacts != null && artifacts.length > 0;
        if (hasArtifacts) {
            payload.artifacts = artifacts.map(a => ({
                artifactId: a.ArtifactID,
                artifactVersionId: a.ArtifactVersionID,
                name: a.Name
            }));
        }
        return {
            ResultJson: JSON.stringify(payload),
            Success: success,
            PausedRunID: pausedRunID,
            RunID: runID,
            Artifacts: hasArtifacts ? artifacts : undefined
        };
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
