/**
 * @fileoverview Cross-turn conversation compaction manager.
 *
 * Implements the durable summary layer from plans/agent-conversation-compaction.md:
 * when a conversation's assembled context window crosses the effective trigger budget,
 * a single summary prompt folds the prior running summary plus the raw message delta
 * into a new summary, persisted on the boundary row's
 * `ConversationDetail.SummaryOfEarlierConversation` (with `SummaryPromptRunID` linking
 * the producing `AIPromptRun` for cost/model audit). Subsequent runs assemble
 * `[summary, boundary row, ...tail]` via `ConversationEngine.GetAgentContextWindow`.
 *
 * This class owns the trigger math, boundary selection, prompt invocation, and the
 * boundary-row write. BaseAgent owns run-step recording and when the check fires
 * (pre-turn fallback / post-turn fire-and-forget).
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, LogError, LogStatusEx, Metadata, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    ConversationContextMessage,
    ConversationEngine,
    MJAIAgentTypeEntity,
    MJConversationDetailEntity
} from '@memberjunction/core-entities';
import { AIPromptParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * The resolved, model-validated working-context budget for a run.
 * Resolution order per field: AIAgent value, else AIAgentType value, else (MaxTokens only)
 * the selected model's MaxInputTokens, else the framework's conservative default.
 */
export interface EffectiveContextBudget {
    /** Effective working-context budget in tokens (already clamped to the model when known) */
    MaxTokens: number;
    /** Token level at which cross-turn compaction fires (MaxTokens × trigger percent) */
    TriggerTokens: number;
    /** Target window size after compaction (MaxTokens × target percent) */
    TargetTokens: number;
    /** True when a configured budget exceeded the model's MaxInputTokens and was clamped down */
    ClampedToModel: boolean;
    /** Which layer supplied MaxTokens */
    BoundedBy: 'Agent' | 'AgentType' | 'Model' | 'Default';
}

/** Inputs to {@link ConversationCompactionManager.CompactIfNeeded}. */
export interface CompactIfNeededInput {
    /** The conversation whose window may need compacting */
    ConversationId: string;
    /** The executing agent (per-agent compaction knobs + summary prompt override) */
    Agent: MJAIAgentEntityExtended;
    /** The agent's type (type-level defaults) — null only for typeless programmatic runs */
    AgentType: MJAIAgentTypeEntity | null;
    /** The resolved budget (see {@link ConversationCompactionManager.ResolveEffectiveBudget}) */
    Budget: EffectiveContextBudget;
    ContextUser: UserInfo;
    /** Provider for the boundary-row entity write (falls back to the global provider) */
    Provider?: IMetadataProvider;
    /**
     * Token estimator for context messages — supplied by the caller so trigger math uses
     * the SAME heuristic BaseAgent uses for in-turn context management (no drift).
     */
    EstimateTokens: (messages: ConversationContextMessage[]) => number;
    /** Verbose diagnostics (LogStatusEx verboseOnly) */
    Verbose?: boolean;
    /** Fires with the summary AIPromptRun ID as soon as the run record exists (step TargetLogID wiring) */
    OnPromptRunCreated?: (promptRunId: string) => void | Promise<void>;
}

/** Result of a {@link ConversationCompactionManager.CompactIfNeeded} call. */
export interface CompactionOutcome {
    /** True when a summary was generated and persisted */
    Fired: boolean;
    /** Why the check was a no-op (only when Fired is false and no error occurred) */
    SkippedReason?: string;
    /** The boundary row's Sequence — the new summary covers everything below it */
    BoundarySequence?: number;
    /** The summary prompt used */
    PromptId?: string;
    /** The AIPromptRun that produced the summary (also written to ConversationDetail.SummaryPromptRunID) */
    PromptRunId?: string;
    /** Estimated window tokens before compaction */
    TokensBefore: number;
    /** Estimated window tokens after compaction (new summary + retained tail) */
    TokensAfter?: number;
    /** The generated summary text (so a pre-turn caller can splice it into live messages without a re-fetch) */
    SummaryText?: string;
    /** Non-fatal notes (e.g. budget clamp) surfaced into the run step's OutputData */
    Warnings: string[];
    /** Set when the attempt failed — the conversation is left untouched */
    ErrorMessage?: string;
}

/** Name of the system-default cross-turn summary prompt (seeded metadata). */
const CONVERSATION_SUMMARY_PROMPT_NAME = 'Conversation Summary';
/** Conservative context default, mirroring BaseAgent.getModelContextLimit's fallback. */
const DEFAULT_CONTEXT_TOKENS = 8000;
/**
 * Safety values for the two percents. The AIAgentType columns are NOT NULL with DB
 * defaults (75/30), so these only apply on typeless programmatic runs — keep in sync
 * with the migration defaults.
 */
const DEFAULT_TRIGGER_PERCENT = 75;
const DEFAULT_TARGET_PERCENT = 30;
/** Tokens reserved for the yet-unwritten new summary when choosing the boundary. */
const SUMMARY_RESERVE_TOKENS = 1500;
/**
 * Minimum projected token relief for a compaction pass to be worth its summary-prompt
 * LLM call. Also exceeds a typical turn's context growth, so a degenerate budget (a
 * trigger at or below the steady-state summary size) stops churning — without this,
 * such a config re-fires a wasted summary call on EVERY turn while advancing the
 * boundary one message at a time (observed live during contour testing).
 */
const MIN_COMPACTION_GAIN_TOKENS = 500;
/** Below this many raw messages a compaction pass is not worth a prompt run. */
const MIN_MESSAGES_TO_COMPACT = 4;
/** Per-message character cap when rendering the delta for the summary prompt. */
const MAX_DELTA_MESSAGE_CHARS = 10_000;

/**
 * Owns cross-turn (Tier A) conversation compaction: budget resolution, trigger math,
 * boundary selection, the summary prompt run, and the durable boundary-row write.
 * Stateless aside from an in-process re-entrancy guard; all entry points are static.
 */
export class ConversationCompactionManager {
    /** Conversations with a compaction currently in flight in this process (re-entrancy guard). */
    private static inFlightConversations = new Set<string>();

    /** Conversations already warned (once per process) about an unsatisfiable trigger budget. */
    private static warnedConversationBudgets = new Set<string>();

    /**
     * Resolves the effective context budget for a run.
     *
     * MaxTokens: `Agent.ContextWindowMaxTokens || AgentType.ContextWindowMaxTokens ||
     * modelMaxInputTokens || 8000`, then clamped to `modelMaxInputTokens` when the
     * configured value exceeds it (never silently exceed the model — the clamp is
     * surfaced via `ClampedToModel` for the caller to log). Percents:
     * `Agent || AgentType || framework default` (`||` by design — zero is not a valid
     * value for any of these knobs, and NULL means inherit).
     *
     * @param agent - The executing agent
     * @param agentType - The agent's type (null for typeless programmatic runs)
     * @param modelMaxInputTokens - The selected model's MaxInputTokens when known, else null
     */
    public static ResolveEffectiveBudget(
        agent: MJAIAgentEntityExtended,
        agentType: MJAIAgentTypeEntity | null,
        modelMaxInputTokens: number | null
    ): EffectiveContextBudget {
        let maxTokens: number;
        let boundedBy: EffectiveContextBudget['BoundedBy'];

        if (agent.ContextWindowMaxTokens) {
            maxTokens = agent.ContextWindowMaxTokens;
            boundedBy = 'Agent';
        } else if (agentType?.ContextWindowMaxTokens) {
            maxTokens = agentType.ContextWindowMaxTokens;
            boundedBy = 'AgentType';
        } else if (modelMaxInputTokens) {
            maxTokens = modelMaxInputTokens;
            boundedBy = 'Model';
        } else {
            maxTokens = DEFAULT_CONTEXT_TOKENS;
            boundedBy = 'Default';
        }

        let clampedToModel = false;
        if (modelMaxInputTokens && maxTokens > modelMaxInputTokens) {
            maxTokens = modelMaxInputTokens;
            boundedBy = 'Model';
            clampedToModel = true;
        }

        const triggerPercent = agent.CompactionTriggerPercent || agentType?.CompactionTriggerPercent || DEFAULT_TRIGGER_PERCENT;
        const targetPercent = agent.CompactionTargetPercent || agentType?.CompactionTargetPercent || DEFAULT_TARGET_PERCENT;

        return {
            MaxTokens: maxTokens,
            TriggerTokens: Math.floor(maxTokens * triggerPercent / 100),
            TargetTokens: Math.floor(maxTokens * targetPercent / 100),
            ClampedToModel: clampedToModel,
            BoundedBy: boundedBy
        };
    }

    /**
     * Checks the conversation's assembled window against the trigger budget and, when
     * crossed, runs the summary prompt (input = prior summary + raw delta only — the
     * recursive pattern) and persists the result on the boundary row. Never throws for
     * business failures — returns an outcome with `ErrorMessage` and leaves the
     * conversation untouched, so a failed compaction simply re-triggers next turn.
     */
    public static async CompactIfNeeded(input: CompactIfNeededInput): Promise<CompactionOutcome> {
        const conversationKey = NormalizeUUID(input.ConversationId);
        if (this.inFlightConversations.has(conversationKey)) {
            return { Fired: false, SkippedReason: 'Compaction already in flight for this conversation', TokensBefore: 0, Warnings: [] };
        }
        this.inFlightConversations.add(conversationKey);
        try {
            return await this.compactIfNeededInternal(input);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Cross-turn compaction failed for conversation ${input.ConversationId}: ${message}`);
            return { Fired: false, TokensBefore: 0, Warnings: [], ErrorMessage: message };
        } finally {
            this.inFlightConversations.delete(conversationKey);
        }
    }

    /** Core pass: window → trigger check → boundary + worth-it guards → prompt → boundary-row write. */
    private static async compactIfNeededInternal(input: CompactIfNeededInput): Promise<CompactionOutcome> {
        const warnings: string[] = [];
        if (input.Budget.ClampedToModel) {
            warnings.push(`Configured ContextWindowMaxTokens exceeded the model's MaxInputTokens — clamped to ${input.Budget.MaxTokens}`);
        }

        const window = await ConversationEngine.Instance.GetAgentContextWindow(input.ConversationId, input.ContextUser);
        const tokensBefore = input.EstimateTokens(window);

        if (tokensBefore < input.Budget.TriggerTokens) {
            this.logVerbose(input, `No compaction needed: ~${tokensBefore} tokens < trigger ${input.Budget.TriggerTokens}`);
            return { Fired: false, SkippedReason: `Window ~${tokensBefore} tokens is under the ${input.Budget.TriggerTokens}-token trigger`, TokensBefore: tokensBefore, Warnings: warnings };
        }

        const { priorSummary, rawMessages } = this.splitWindow(window);
        this.warnOnceIfBudgetUnsatisfiable(input, window, priorSummary, warnings);

        const boundary = this.chooseBoundary(rawMessages, tokensBefore, input);
        if ('skippedReason' in boundary) {
            return { Fired: false, SkippedReason: boundary.skippedReason, TokensBefore: tokensBefore, Warnings: warnings };
        }

        const promptResult = await this.runSummaryPrompt(input, priorSummary, rawMessages.slice(0, boundary.index));
        if (!promptResult.success) {
            return { Fired: false, TokensBefore: tokensBefore, Warnings: warnings, ErrorMessage: promptResult.errorMessage, PromptId: promptResult.promptId };
        }

        const boundaryMessage = rawMessages[boundary.index];
        await this.writeBoundaryRow(input, boundaryMessage.metadata!.conversationDetailId!, promptResult.summaryText, promptResult.promptRunId);

        const tokensAfter = input.EstimateTokens([
            { role: 'user', content: promptResult.summaryText },
            ...rawMessages.slice(boundary.index)
        ]);
        this.logVerbose(input, `Compacted at sequence ${boundaryMessage.metadata!.sequence}: ~${tokensBefore} → ~${tokensAfter} tokens`);

        return {
            Fired: true,
            BoundarySequence: boundaryMessage.metadata!.sequence,
            PromptId: promptResult.promptId,
            PromptRunId: promptResult.promptRunId,
            TokensBefore: tokensBefore,
            TokensAfter: tokensAfter,
            SummaryText: promptResult.summaryText,
            Warnings: warnings
        };
    }

    /**
     * Splits the assembled window into the leading running summary (when the engine
     * placed one at index 0) and the raw sequence-addressable messages eligible for
     * folding (summary rows and non-addressable placeholders are excluded).
     */
    private static splitWindow(window: ConversationContextMessage[]): { priorSummary: string; rawMessages: ConversationContextMessage[] } {
        const priorSummary = window.length > 0 && window[0].metadata?.isConversationSummary
            ? (typeof window[0].content === 'string' ? window[0].content : '')
            : '';
        const rawMessages = window.filter(m =>
            !m.metadata?.isConversationSummary
            && m.metadata?.sequence !== undefined
            && !!m.metadata?.conversationDetailId
        );
        return { priorSummary, rawMessages };
    }

    /**
     * Unsatisfiable-budget warning: when the prior summary ALONE meets the trigger, no
     * amount of folding can bring the window back under it — the operator needs a bigger
     * ContextWindowMaxTokens or a higher CompactionTriggerPercent. Warns once per
     * conversation per process; the guard skip paths in {@link chooseBoundary} stop the
     * per-turn churn.
     */
    private static warnOnceIfBudgetUnsatisfiable(
        input: CompactIfNeededInput,
        window: ConversationContextMessage[],
        priorSummary: string,
        warnings: string[]
    ): void {
        const conversationKey = NormalizeUUID(input.ConversationId);
        if (priorSummary.length === 0
            || input.EstimateTokens([window[0]]) < input.Budget.TriggerTokens
            || this.warnedConversationBudgets.has(conversationKey)) {
            return;
        }
        this.warnedConversationBudgets.add(conversationKey);
        const budgetWarning = `Compaction trigger (~${input.Budget.TriggerTokens} tokens) is at or below the running summary's size — the window can never get under the trigger. Raise ContextWindowMaxTokens or CompactionTriggerPercent for this agent/type.`;
        warnings.push(budgetWarning);
        LogStatusEx({ message: `⚠️ [CrossTurnCompaction] Conversation ${input.ConversationId}: ${budgetWarning}` });
    }

    /**
     * Selects the fold boundary and applies the worth-it guards. Returns the boundary
     * index into `rawMessages`, or a skip reason when there is no foldable boundary
     * (too few addressable messages, or the window already fits the target tail —
     * possible only with inverted trigger/target configs) or when the projected token
     * relief is under {@link MIN_COMPACTION_GAIN_TOKENS} (not worth a summary-prompt
     * LLM call).
     */
    private static chooseBoundary(
        rawMessages: ConversationContextMessage[],
        tokensBefore: number,
        input: CompactIfNeededInput
    ): { index: number } | { skippedReason: string } {
        const boundaryIndex = this.selectBoundaryIndex(rawMessages, input);
        if (boundaryIndex === null) {
            this.logVerbose(input, `Over trigger (~${tokensBefore} tokens) but no foldable boundary — ${rawMessages.length} addressable messages, target tail ${input.Budget.TargetTokens - SUMMARY_RESERVE_TOKENS} tokens`);
            return { skippedReason: 'No foldable boundary (too few addressable messages, or the window already fits the target tail)' };
        }

        // Minimum-gain guard: projected post-compaction size = summary reserve + retained tail.
        const projectedTokensAfter = SUMMARY_RESERVE_TOKENS + input.EstimateTokens(rawMessages.slice(boundaryIndex));
        const projectedGain = tokensBefore - projectedTokensAfter;
        if (projectedGain < MIN_COMPACTION_GAIN_TOKENS) {
            this.logVerbose(input, `Skipping: projected gain ~${projectedGain} tokens < minimum ${MIN_COMPACTION_GAIN_TOKENS}`);
            return { skippedReason: `Projected gain (~${projectedGain} tokens) is under the ${MIN_COMPACTION_GAIN_TOKENS}-token minimum — not worth a summary prompt run` };
        }
        return { index: boundaryIndex };
    }

    /**
     * Picks the boundary index within the raw (non-summary, sequence-addressable)
     * messages: the earliest message whose tail fits inside
     * `TargetTokens - SUMMARY_RESERVE_TOKENS`, walking backward from the newest.
     * Returns null when there is nothing worthwhile to fold (window too small or the
     * boundary would sit at the first raw message, folding nothing).
     */
    private static selectBoundaryIndex(rawMessages: ConversationContextMessage[], input: CompactIfNeededInput): number | null {
        if (rawMessages.length < MIN_MESSAGES_TO_COMPACT) {
            return null;
        }
        const tailBudget = input.Budget.TargetTokens - SUMMARY_RESERVE_TOKENS;
        let accumulated = 0;
        let boundaryIndex = rawMessages.length - 1;
        for (let i = rawMessages.length - 1; i >= 0; i--) {
            const messageTokens = input.EstimateTokens([rawMessages[i]]);
            if (accumulated + messageTokens > tailBudget) {
                break;
            }
            accumulated += messageTokens;
            boundaryIndex = i;
        }
        // boundaryIndex 0 would fold nothing (delta empty) — no progress, skip.
        return boundaryIndex > 0 ? boundaryIndex : null;
    }

    /** Renders the delta and runs the summary prompt. */
    private static async runSummaryPrompt(
        input: CompactIfNeededInput,
        priorSummary: string,
        delta: ConversationContextMessage[]
    ): Promise<{ success: boolean; summaryText: string; promptId?: string; promptRunId?: string; errorMessage?: string }> {
        const prompt = this.resolveSummaryPrompt(input);
        if (!prompt) {
            return { success: false, summaryText: '', errorMessage: `No conversation summary prompt found (agent/type ConversationSummaryPromptID unset and no '${CONVERSATION_SUMMARY_PROMPT_NAME}' system prompt)` };
        }

        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.data = {
            priorSummary: priorSummary || '(none — this is the first compaction of this conversation)',
            deltaMessages: delta.map(m => this.renderDeltaMessage(m)).join('\n')
        };
        promptParams.contextUser = input.ContextUser;
        if (input.OnPromptRunCreated) {
            promptParams.onPromptRunCreated = input.OnPromptRunCreated;
        }

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt<string>(promptParams);
        const summaryText = (typeof result.result === 'string' && result.result.trim().length > 0)
            ? result.result.trim()
            : (result.rawResult || '').trim();

        if (!result.success || summaryText.length === 0) {
            return { success: false, summaryText: '', promptId: prompt.ID, promptRunId: result.promptRun?.ID, errorMessage: result.errorMessage || 'Summary prompt returned no content' };
        }
        return { success: true, summaryText, promptId: prompt.ID, promptRunId: result.promptRun?.ID };
    }

    /** Prompt resolution: agent override, else type override, else the seeded system prompt by name. */
    private static resolveSummaryPrompt(input: CompactIfNeededInput) {
        const overrideId = input.Agent.ConversationSummaryPromptID || input.AgentType?.ConversationSummaryPromptID;
        if (overrideId) {
            const overridePrompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, overrideId));
            if (overridePrompt) {
                return overridePrompt;
            }
            LogError(`ConversationSummaryPromptID ${overrideId} not found in AIEngine prompt cache — falling back to the system prompt`);
        }
        return AIEngine.Instance.Prompts.find(p => p.Name === CONVERSATION_SUMMARY_PROMPT_NAME);
    }

    /** One delta line: `[seq N] Role: text` with a per-message size cap. */
    private static renderDeltaMessage(message: ConversationContextMessage): string {
        const roleLabel = message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'User';
        const text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        const capped = text.length > MAX_DELTA_MESSAGE_CHARS
            ? `${text.slice(0, MAX_DELTA_MESSAGE_CHARS)}\n[truncated — ${text.length.toLocaleString()} chars total]`
            : text;
        return `[seq ${message.metadata?.sequence}] ${roleLabel}: ${capped}`;
    }

    /**
     * Persists the summary on the boundary row. Written through a plain entity Save (the
     * same external-save path everything else uses) so ConversationEngine's entity-event
     * handler merges it into any warm cache in place — never through engine mutation
     * helpers, whose self-mutation guard would skip the merge.
     */
    private static async writeBoundaryRow(
        input: CompactIfNeededInput,
        boundaryDetailId: string,
        summaryText: string,
        promptRunId: string | undefined
    ): Promise<void> {
        // Favor the caller-supplied provider; the global is the explicit last resort
        const provider = input.Provider || Metadata.Provider;
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', input.ContextUser);
        if (!(await detail.Load(boundaryDetailId))) {
            throw new Error(`Failed to load boundary ConversationDetail ${boundaryDetailId}`);
        }
        detail.SummaryOfEarlierConversation = summaryText;
        detail.SummaryPromptRunID = promptRunId || null;
        if (!(await detail.Save())) {
            throw new Error(`Boundary-row save failed: ${detail.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
    }

    private static logVerbose(input: CompactIfNeededInput, message: string): void {
        LogStatusEx({
            message: `[CrossTurnCompaction] ${message}`,
            verboseOnly: true,
            isVerboseEnabled: () => input.Verbose === true
        });
    }
}
