/**
 * @fileoverview Dependency-injected orchestrator that drives a `BaseRealtimeModel` session for
 * the {@link RealtimeAgentType} (Voice Co-Agent).
 *
 * The {@link RealtimeSessionRunner} owns the lifecycle of a single full-duplex
 * {@link IRealtimeSession}: it opens the session, registers a **stable, target-independent** tool
 * set (always including `invoke-target-agent`), wires the provider event handlers, routes tool
 * calls (invoke-target → delegate to the target agent; others → an injected tool executor),
 * persists each transcript turn as a conversation detail, accumulates usage and checkpoints it on
 * a debounced cadence, and aborts any in-flight delegated run on barge-in.
 *
 * **Why dependency injection.** Every collaborator that would otherwise pull in `BaseAgent`,
 * metadata, or the database is injected via {@link RealtimeSessionRunnerDeps}. That keeps the
 * runner fully unit-testable against a mock realtime model and mock collaborators (this is the
 * P2b-i deliverable). In P2b-ii, `BaseAgent` supplies the real implementations (model resolution
 * from agent metadata, the `ExecuteSubAgent`-backed delegate, `ConversationDetail` persistence,
 * and the `AIPromptRun` usage checkpoint).
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeToolDefinition,
    JSONObject
} from '@memberjunction/ai';

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
     * Abort signal owned by the runner for this specific delegated call. On barge-in
     * ({@link IRealtimeSession.OnInterruption}), the runner aborts the controller behind this
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
}

/**
 * A non-target tool call routed to the injected {@link RealtimeSessionRunnerDeps.ExecuteTool}
 * handler. This is any tool other than `invoke-target-agent` (e.g. a UI/control tool such as
 * `ShowChart`, or a fast server/client tool the co-agent was given directly).
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
 * The injected collaborators that drive a realtime session.
 *
 * Each member is a seam that decouples the runner from `BaseAgent`/metadata/DB so it can be
 * exercised with mocks. `BaseAgent` supplies the production implementations in P2b-ii.
 */
export interface RealtimeSessionRunnerDeps {
    /**
     * The resolved realtime model whose {@link BaseRealtimeModel.StartSession} opens the duplex
     * session. In production, resolved from the agent's `MJ: AI Models` metadata via the
     * ClassFactory; in tests, a mock model.
     */
    Model: BaseRealtimeModel;

    /**
     * The session parameters (system prompt with companion/"voice for" framing + assembled
     * memory/context, model API name, and optional provider config). The runner adds the stable
     * tool set itself — callers should not pre-populate {@link RealtimeSessionParams.Tools} with
     * the `invoke-target-agent` tool.
     */
    SessionParams: RealtimeSessionParams;

    /**
     * Extra realtime tools to register *in addition to* the always-present `invoke-target-agent`
     * tool — e.g. fixed UI/control tools. These stay target-independent (see
     * {@link INVOKE_TARGET_AGENT_TOOL_NAME}). Optional.
     */
    ExtraTools?: RealtimeToolDefinition[];

    /**
     * Runs the target agent for an `invoke-target-agent` tool call. The runner creates and owns a
     * fresh `AbortController` per delegated call and passes its signal in via
     * {@link DelegateToTargetRequest.AbortSignal}; barge-in aborts it. In production this is
     * backed by `BaseAgent.ExecuteSubAgent` (top-level target only — sub-agents are not exposed).
     */
    DelegateToTarget: (request: DelegateToTargetRequest) => Promise<DelegatedResult>;

    /**
     * Executes a non-target tool call (any tool other than `invoke-target-agent`). In production
     * this routes to the co-agent's server/client/UI tool execution under the session's context
     * user.
     */
    ExecuteTool: (call: RealtimeToolCall) => Promise<ToolExecutionResult>;

    /**
     * Persists a transcript turn as a `ConversationDetail` stamped with the session ID. In
     * production this writes the durable transcript; in tests, a spy.
     */
    PersistTranscript: (transcript: RealtimeTranscript) => Promise<void>;

    /**
     * Checkpoints the *accumulated* usage onto the single long-lived `AIPromptRun`. The runner
     * accumulates `OnUsage` deltas and invokes this on a debounced cadence and on close, so a
     * crash-driven janitor close finalizes from the last-persisted values and loses nothing.
     */
    CheckpointUsage: (usage: RealtimeUsage) => Promise<void>;

    /** Optional debounce window (ms) for usage checkpoints. Defaults to 5000ms. */
    UsageCheckpointDebounceMs?: number;

    /** Optional verbose-aware status logger. */
    LogStatus?: RealtimeStatusLogger;

    /** Optional error logger. */
    LogError?: RealtimeErrorLogger;
}

/**
 * The outcome of a completed realtime session run.
 */
export interface RealtimeSessionResult {
    /** Whether the session ran to a clean close. */
    Success: boolean;
    /** The final accumulated usage that was checkpointed at close. */
    FinalUsage: RealtimeUsage;
    /** Total transcript turns persisted during the session. */
    TranscriptTurnCount: number;
    /** An error message if the session failed to start or finalize. */
    ErrorMessage?: string;
}

/**
 * Orchestrates a single `BaseRealtimeModel` duplex session for the Realtime agent type.
 *
 * Construct with a fully-populated {@link RealtimeSessionRunnerDeps}, then call {@link Run} to
 * drive the session to completion, or {@link Start}/{@link Stop} to control it explicitly.
 */
export class RealtimeSessionRunner {
    private deps: RealtimeSessionRunnerDeps;
    private session: IRealtimeSession | null = null;

    /** Accumulated usage across all `OnUsage` deltas, flushed to the checkpoint on debounce/close. */
    private accumulatedUsage: RealtimeUsage = { InputTokens: 0, OutputTokens: 0 };
    /** Whether there is accumulated usage that has not yet been checkpointed. */
    private usageDirty = false;
    /** Pending debounce timer handle for usage checkpoints. */
    private usageDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** The abort controller for the currently in-flight delegated run, if any. */
    private currentDelegationController: AbortController | null = null;

    /** Count of transcript turns persisted, surfaced in the result. */
    private transcriptTurnCount = 0;

    /** Whether {@link Stop} has been initiated, to make finalization idempotent. */
    private stopped = false;

    /**
     * @param deps The injected collaborators that drive the session.
     */
    constructor(deps: RealtimeSessionRunnerDeps) {
        this.deps = deps;
    }

    /**
     * The debounce window (ms) for usage checkpoints, defaulting to 5000ms.
     */
    private get debounceMs(): number {
        return this.deps.UsageCheckpointDebounceMs ?? 5000;
    }

    /**
     * Builds the realtime tool set registered with the provider.
     *
     * Always includes the stable, target-independent {@link INVOKE_TARGET_AGENT_TOOL_NAME} tool,
     * followed by any {@link RealtimeSessionRunnerDeps.ExtraTools}. This is the full set the
     * provider sees — everything target-specific runs *inside* the delegated agent's own run and
     * is never registered on the realtime socket.
     *
     * @returns The ordered tool definitions to register.
     */
    public BuildToolSet(): RealtimeToolDefinition[] {
        const invokeTargetSchema: JSONObject = {
            type: 'object',
            properties: {
                request: {
                    type: 'string',
                    description: 'The natural-language request to hand to the target agent to perform real work.'
                }
            },
            required: ['request']
        };

        const invokeTargetTool: RealtimeToolDefinition = {
            Name: INVOKE_TARGET_AGENT_TOOL_NAME,
            Description:
                'Invoke the target agent to perform real work (seconds to minutes). Use this whenever ' +
                'actual work is needed beyond conversation; narrate while it runs.',
            ParametersSchema: invokeTargetSchema
        };

        return [invokeTargetTool, ...(this.deps.ExtraTools ?? [])];
    }

    /**
     * Opens the session, registers tools, and wires all provider event handlers.
     *
     * Idempotent guard: throws if the session is already started. After this resolves, the session
     * is live and streaming; call {@link Stop} (or {@link Run}, which awaits closure) to finalize.
     *
     * @throws If the model fails to start a session.
     */
    public async Start(): Promise<void> {
        if (this.session) {
            throw new Error('RealtimeSessionRunner.Start called but a session is already active.');
        }

        const tools = this.BuildToolSet();
        const params: RealtimeSessionParams = { ...this.deps.SessionParams, Tools: tools };

        this.session = await this.deps.Model.StartSession(params);
        await this.session.RegisterTools(tools);
        this.wireHandlers(this.session);

        this.deps.LogStatus?.(
            `🎙️ Realtime session started with ${tools.length} tool(s) (target-independent set).`,
            true
        );
    }

    /**
     * Registers the provider event handlers on the live session.
     *
     * @param session The active session to wire.
     */
    private wireHandlers(session: IRealtimeSession): void {
        session.OnTranscript((t) => void this.handleTranscript(t));
        session.OnToolCall((call) => void this.handleToolCall(call));
        session.OnUsage((u) => this.handleUsage(u));
        session.OnInterruption(() => this.handleInterruption());
    }

    /**
     * Persists a transcript turn via the injected persistence collaborator.
     *
     * @param transcript The transcript event (partial or final) emitted by the model.
     */
    private async handleTranscript(transcript: RealtimeTranscript): Promise<void> {
        try {
            await this.deps.PersistTranscript(transcript);
            this.transcriptTurnCount++;
        } catch (error) {
            this.logError(error, 'persisting transcript');
        }
    }

    /**
     * Routes a tool call by name: `invoke-target-agent` delegates to the target agent (with a
     * fresh abort controller), every other tool routes to the injected tool executor.
     *
     * @param call The tool-call request emitted by the model.
     */
    private async handleToolCall(call: RealtimeToolCall): Promise<void> {
        if (call.ToolName === INVOKE_TARGET_AGENT_TOOL_NAME) {
            await this.handleInvokeTarget(call);
        } else {
            await this.handleOtherTool(call);
        }
    }

    /**
     * Delegates an `invoke-target-agent` call to the target agent.
     *
     * Creates and owns a fresh {@link AbortController} for this call so {@link handleInterruption}
     * can cancel the in-flight delegated run on barge-in. Clears the current controller once the
     * delegation settles.
     *
     * @param call The `invoke-target-agent` tool call.
     */
    private async handleInvokeTarget(call: RealtimeToolCall): Promise<void> {
        const controller = new AbortController();
        this.currentDelegationController = controller;
        try {
            await this.deps.DelegateToTarget({
                CallID: call.CallID,
                Arguments: call.Arguments,
                AbortSignal: controller.signal
            });
        } catch (error) {
            this.logError(error, 'delegating to target agent');
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
     */
    private async handleOtherTool(call: RealtimeToolCall): Promise<void> {
        try {
            await this.deps.ExecuteTool(call);
        } catch (error) {
            this.logError(error, `executing tool '${call.ToolName}'`);
        }
    }

    /**
     * Accumulates a usage delta and schedules a debounced checkpoint.
     *
     * @param usage The incremental usage update reported by the provider.
     */
    private handleUsage(usage: RealtimeUsage): void {
        this.accumulatedUsage = {
            InputTokens: this.accumulatedUsage.InputTokens + usage.InputTokens,
            OutputTokens: this.accumulatedUsage.OutputTokens + usage.OutputTokens
        };
        this.usageDirty = true;
        this.scheduleUsageCheckpoint();
    }

    /**
     * Schedules a single debounced usage checkpoint. Repeated calls within the window coalesce
     * into one flush, bounding write frequency during a token-heavy turn.
     */
    private scheduleUsageCheckpoint(): void {
        if (this.usageDebounceTimer) {
            return; // a flush is already pending
        }
        this.usageDebounceTimer = setTimeout(() => {
            this.usageDebounceTimer = null;
            void this.flushUsage();
        }, this.debounceMs);
    }

    /**
     * Flushes the accumulated usage to the checkpoint collaborator if there is anything new.
     *
     * Sends a snapshot of the *cumulative* total (matching the plan's "finalize from the
     * last-persisted values" contract) and clears the dirty flag.
     */
    private async flushUsage(): Promise<void> {
        if (!this.usageDirty) {
            return;
        }
        this.usageDirty = false;
        const snapshot: RealtimeUsage = {
            InputTokens: this.accumulatedUsage.InputTokens,
            OutputTokens: this.accumulatedUsage.OutputTokens
        };
        try {
            await this.deps.CheckpointUsage(snapshot);
        } catch (error) {
            // Re-mark dirty so the next debounce/close attempt retries the flush.
            this.usageDirty = true;
            this.logError(error, 'checkpointing usage');
        }
    }

    /**
     * Handles a provider-detected interruption (barge-in).
     *
     * Aborts the in-flight delegated run's controller (if any) so a stale delegated result is
     * never narrated into a conversation that has moved on. Turn detection / VAD and stopping the
     * model's current turn are owned by the provider; the consequence for delegated work is ours.
     */
    private handleInterruption(): void {
        this.deps.LogStatus?.('✋ Barge-in detected — aborting in-flight delegated run if any.', true);
        if (this.currentDelegationController) {
            this.currentDelegationController.abort();
            this.currentDelegationController = null;
        }
    }

    /**
     * Closes the session and finalizes usage. Idempotent: a second call is a no-op.
     *
     * Cancels any pending debounce timer, performs a final synchronous-cadence usage flush so no
     * partial usage is lost, closes the underlying session, and returns the run result.
     *
     * @returns The final {@link RealtimeSessionResult}.
     */
    public async Stop(): Promise<RealtimeSessionResult> {
        if (this.stopped) {
            return this.buildResult(true);
        }
        this.stopped = true;

        // Cancel any pending debounce and force a final flush so partial usage is never lost.
        if (this.usageDebounceTimer) {
            clearTimeout(this.usageDebounceTimer);
            this.usageDebounceTimer = null;
        }
        await this.flushUsage();

        // Abort any still-in-flight delegation before tearing down.
        if (this.currentDelegationController) {
            this.currentDelegationController.abort();
            this.currentDelegationController = null;
        }

        let errorMessage: string | undefined;
        try {
            await this.session?.Close();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
            this.logError(error, 'closing session');
        } finally {
            this.session = null;
        }

        this.deps.LogStatus?.('🛑 Realtime session finalized.', true);
        return this.buildResult(!errorMessage, errorMessage);
    }

    /**
     * Builds the run result from the current accumulated state.
     *
     * @param success Whether the session is considered successful.
     * @param errorMessage Optional error message to attach.
     * @returns The result object.
     */
    private buildResult(success: boolean, errorMessage?: string): RealtimeSessionResult {
        return {
            Success: success,
            FinalUsage: {
                InputTokens: this.accumulatedUsage.InputTokens,
                OutputTokens: this.accumulatedUsage.OutputTokens
            },
            TranscriptTurnCount: this.transcriptTurnCount,
            ErrorMessage: errorMessage
        };
    }

    /**
     * Convenience lifecycle: starts the session and immediately finalizes it.
     *
     * This is primarily useful for tests and for callers that drive the session entirely through
     * the injected handlers (which fire between {@link Start} and {@link Stop}). Most real callers
     * will use {@link Start} then later {@link Stop} when the user hangs up or the session times
     * out. If start fails, a failed result is returned with the error.
     *
     * @returns The final {@link RealtimeSessionResult}.
     */
    public async Run(): Promise<RealtimeSessionResult> {
        try {
            await this.Start();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logError(error, 'starting session');
            return this.buildResult(false, errorMessage);
        }
        return this.Stop();
    }

    /**
     * Logs an error via the injected logger (if any), prefixed with the failing operation.
     *
     * @param error The thrown error or message.
     * @param operation A short description of what was being attempted.
     */
    private logError(error: unknown, operation: string): void {
        const message = error instanceof Error ? error.message : String(error);
        this.deps.LogError?.(`RealtimeSessionRunner error while ${operation}: ${message}`);
    }
}
