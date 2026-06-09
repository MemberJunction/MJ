/**
 * @fileoverview Implementation of the Realtime Agent Type for streaming, full-duplex,
 * tool-calling sessions (voice today, video later).
 *
 * Unlike {@link LoopAgentType} and `FlowAgentType`, the Realtime agent type does **not**
 * drive an iterative request/response reasoning loop. Modern real-time models (Gemini Live,
 * GPT Realtime, and — as a fast-follow — the Eleven Labs stack) own the listen-reason-speak
 * loop themselves. The Realtime agent type therefore wraps a `BaseRealtimeModel` session and
 * delegates the conversation lifecycle to {@link RealtimeSessionRunner}, instead of being
 * pumped turn-by-turn by `BaseAgent`'s loop.
 *
 * This class is built in isolation (P2b-i): it is a registered peer of Loop/Flow, but the
 * wiring inside `BaseAgent` that branches into the session runner is a separate later task.
 * The {@link RealtimeAgentType.IsSessionDriven} getter is the marker `BaseAgent` will use to
 * make that branch.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    AIPromptParams,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    AgentConfiguration
} from '@memberjunction/ai-core-plus';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgentType } from './base-agent-type';

/**
 * Implementation of the Realtime Agent Type pattern.
 *
 * A first-class peer of Loop and Flow that drives a {@link BaseRealtimeModel} session rather
 * than an iterative reasoning loop. Because it is a real MJ agent type, an agent of this type
 * inherits the entire framework for free: server tools (actions), client tools, artifacts,
 * prompts, memory, permissions, and observability. The first agent shipped of this type is the
 * Voice Co-Agent, which voices on behalf of a target agent.
 *
 * **Execution branch.** The realtime path is session-driven: `BaseAgent` (in a later task) will
 * detect {@link IsSessionDriven} (or `instanceof RealtimeAgentType`) and hand control to a
 * {@link RealtimeSessionRunner} rather than entering the loop. As a consequence, the
 * loop-oriented abstract methods below are implemented defensively — they should never be reached
 * in normal operation.
 *
 * @class RealtimeAgentType
 * @extends BaseAgentType
 */
@RegisterClass(BaseAgentType, "RealtimeAgentType")
export class RealtimeAgentType extends BaseAgentType {
    /**
     * Marks this agent type as session-driven rather than loop-driven.
     *
     * `BaseAgent` will use this getter (added on this subclass; `base-agent-type.ts` is left
     * untouched in this task) to branch into a {@link RealtimeSessionRunner} instead of the
     * iterative reasoning loop. Other agent types do not expose this member; `BaseAgent` should
     * treat its absence as `false`, or equivalently detect this type via `instanceof
     * RealtimeAgentType`.
     *
     * @returns Always `true` — realtime agents are driven by a long-lived duplex session.
     */
    public get IsSessionDriven(): boolean {
        return true;
    }

    /**
     * Realtime agents drive their conversation through a live model session, not through
     * agent-level loop prompts. The companion/system prompt is supplied to the realtime model at
     * session start, so the agent-level prompt relationship is not required.
     *
     * @returns Always `false` — agent-level loop prompts are not required for realtime agents.
     */
    public override get RequiresAgentLevelPrompts(): boolean {
        return false;
    }

    /**
     * Initializes agent-type-specific state for a realtime run.
     *
     * The Realtime agent type keeps no iterative loop state — all live state lives inside the
     * {@link RealtimeSessionRunner} and the underlying provider session — so an empty state object
     * is returned, mirroring {@link LoopAgentType.InitializeAgentTypeState}.
     *
     * @param params The agent execution params (unused for realtime state).
     * @returns An empty agent-type state object.
     */
    public async InitializeAgentTypeState<ATS = any, P = any>(params: ExecuteAgentParams<any, P>): Promise<ATS> {
        // Realtime agents do not maintain iterative loop state; the session runner + provider
        // session own all live state. Return an empty object to satisfy the contract.
        return {} as ATS;
    }

    /**
     * Determines the next step from a prompt result.
     *
     * Realtime agents are session-driven and never enter the iterative reasoning loop, so this
     * method should never be reached in normal operation. It is implemented defensively: it logs
     * and returns a terminal `Failed` step rather than throwing, so a mis-wired caller degrades
     * gracefully instead of crashing a live session.
     *
     * @param promptResult Result from prompt execution (unused).
     * @param params The full execution parameters (unused).
     * @param payload The current payload (unused).
     * @param agentTypeState The agent-type state (unused).
     * @returns A terminal `Failed` step describing the misuse.
     */
    public async DetermineNextStep<P = any, ATS = any>(
        promptResult: AIPromptRunResult | null,
        params: ExecuteAgentParams<any, P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P>> {
        const message =
            'RealtimeAgentType.DetermineNextStep was called, but realtime agents are session-driven and ' +
            'do not use the iterative reasoning loop. This indicates the agent was routed through the loop ' +
            'path instead of the RealtimeSessionRunner. Check that BaseAgent branched on IsSessionDriven.';
        LogError(message);
        return this.createNextStep<P>('Failed', { terminate: true, errorMessage: message });
    }

    /**
     * Determines the initial step for a realtime agent.
     *
     * The realtime conversation is owned by the session runner, so there is no loop step to
     * begin. Returning `null` defers to the caller; in practice `BaseAgent` branches on
     * {@link IsSessionDriven} before this would matter.
     *
     * @param params The full execution parameters (unused).
     * @param payload The current payload (unused).
     * @param agentTypeState The agent-type state (unused).
     * @returns Always `null` — there is no loop step to seed.
     */
    public async DetermineInitialStep<P = any, ATS = any>(
        params: ExecuteAgentParams<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null> {
        return null;
    }

    /**
     * Pre-processes a retry step.
     *
     * Realtime agents have no loop retry semantics; `null` is returned to indicate "no custom
     * behavior", consistent with {@link LoopAgentType.PreProcessNextStep}.
     *
     * @param params The full execution parameters (unused).
     * @param step The retry step (unused).
     * @param payload The current payload (unused).
     * @param agentTypeState The agent-type state (unused).
     * @returns Always `null`.
     */
    public async PreProcessNextStep<P = any, ATS = any>(
        params: ExecuteAgentParams<P>,
        step: BaseAgentNextStep<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null> {
        return null;
    }

    /**
     * Gets the prompt to use for a step.
     *
     * Realtime agents do not select per-step loop prompts — the companion/system prompt is handed
     * to the realtime model at session start. The default child prompt (if any) is returned for
     * completeness, but it is not used to drive the conversation.
     *
     * @param params The execution parameters (unused).
     * @param config The loaded agent configuration.
     * @param payload The current payload (unused).
     * @param agentTypeState The agent-type state (unused).
     * @param previousDecision The previous step decision (unused).
     * @returns The configured child prompt, or `null` if none is configured.
     */
    public async GetPromptForStep<P = any, ATS = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        payload: P,
        agentTypeState: ATS,
        previousDecision?: BaseAgentNextStep<P> | null
    ): Promise<MJAIPromptEntityExtended | null> {
        return config.childPrompt || null;
    }

    /**
     * Injects a payload into a prompt.
     *
     * Realtime conversations are not driven by loop prompts, so there is no per-turn payload to
     * inject. This is a no-op (defensive against a mis-wired caller), in contrast to
     * {@link LoopAgentType.InjectPayload} which injects the current payload into the loop prompt.
     *
     * @param payload The payload to inject (unused).
     * @param agentTypeState The agent-type state (unused).
     * @param prompt The prompt parameters (unused).
     * @param agentInfo Agent identification info (unused).
     */
    public async InjectPayload<P = any, ATS = any>(
        payload: P,
        agentTypeState: ATS,
        prompt: AIPromptParams,
        agentInfo: { agentId: string; agentRunId?: string }
    ): Promise<void> {
        // No-op: the realtime session runner owns context injection at session start, not the
        // per-turn loop prompt path. Nothing to inject here.
    }
}
