/**
 * @fileoverview Pluggable base token class for the Compaction, Message Pruning,
 * Token Estimation & Context-Overflow Recovery seam (`s3`).
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentCompactionHelper, 'Default')` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'compaction'`).
 *
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage, ChatMessageContent } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    AgentConfiguration,
    AIModelSelectionInfo,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionCompactMode } from '../../ActionLifecycleResolver';
import type { CompactionOutcome, EffectiveContextBudget } from '../../ConversationCompactionManager';
import type { AgentRunContext } from '../AgentRunContext';

/** Metadata payload describing how a single message should be compacted. */
export interface CompactMessageMetadata {
    compactMode: ActionCompactMode;
    compactLength: number;
    compactPromptId: string;
    originalLength: number;
    includeArtifactHints?: boolean;
}

/**
 * Pluggable base token class for the `BaseAgent` compaction, context-overflow recovery,
 * token estimation, and message expansion seam.
 */
export class BaseAgentCompactionHelper {
    // --- Content & token utilities ---

    public ContentToString(_ctx: AgentRunContext, _content: ChatMessageContent): string {
        throw new Error('BaseAgentCompactionHelper.ContentToString must be implemented by a registered subclass.');
    }

    public SmartTrimContent(
        _ctx: AgentRunContext,
        _content: string,
        _maxLength?: number
    ): { trimmed: string; strategy: string; originalLength: number } {
        throw new Error('BaseAgentCompactionHelper.SmartTrimContent must be implemented by a registered subclass.');
    }

    public IsToolResultMessage(_ctx: AgentRunContext, _msg: ChatMessage): boolean {
        throw new Error('BaseAgentCompactionHelper.IsToolResultMessage must be implemented by a registered subclass.');
    }

    public IsVolatileResultMessage(_ctx: AgentRunContext, _msg: ChatMessage): boolean {
        throw new Error('BaseAgentCompactionHelper.IsVolatileResultMessage must be implemented by a registered subclass.');
    }

    public EstimateTokens(_ctx: AgentRunContext, _content: ChatMessage['content'], _modelName?: string): number {
        throw new Error('BaseAgentCompactionHelper.EstimateTokens must be implemented by a registered subclass.');
    }

    public HeuristicTokenCount(_ctx: AgentRunContext, _text: string): number {
        throw new Error('BaseAgentCompactionHelper.HeuristicTokenCount must be implemented by a registered subclass.');
    }

    public GetModelContextLimit(_ctx: AgentRunContext, _modelSelectionInfo?: AIModelSelectionInfo): number {
        throw new Error('BaseAgentCompactionHelper.GetModelContextLimit must be implemented by a registered subclass.');
    }

    public TryGetModelMaxInputTokens(_ctx: AgentRunContext, _modelSelectionInfo: AIModelSelectionInfo): number | null {
        throw new Error('BaseAgentCompactionHelper.TryGetModelMaxInputTokens must be implemented by a registered subclass.');
    }

    public EstimateConversationTokens(_ctx: AgentRunContext, _messages: ChatMessage[]): number {
        throw new Error('BaseAgentCompactionHelper.EstimateConversationTokens must be implemented by a registered subclass.');
    }

    // --- Context-overflow recovery strategies ---

    public RecoveryStrategy_DropStaleVolatileState(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tokensToSave: number,
        _currentStepCount: number
    ): { tokensSaved: number; strategyName: string } {
        throw new Error('BaseAgentCompactionHelper.RecoveryStrategy_DropStaleVolatileState must be implemented by a registered subclass.');
    }

    public RecoveryStrategy_RemoveOldestToolResults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tokensToSave: number,
        _currentStepCount: number,
        _minAge?: number
    ): { tokensSaved: number; strategyName: string } {
        throw new Error('BaseAgentCompactionHelper.RecoveryStrategy_RemoveOldestToolResults must be implemented by a registered subclass.');
    }

    public async RecoveryStrategy_CompactOldToolResults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tokensToSave: number,
        _currentStepCount: number,
        _minAge?: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        throw new Error('BaseAgentCompactionHelper.RecoveryStrategy_CompactOldToolResults must be implemented by a registered subclass.');
    }

    public async RecoveryStrategy_CompactAllToolResults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        throw new Error('BaseAgentCompactionHelper.RecoveryStrategy_CompactAllToolResults must be implemented by a registered subclass.');
    }

    public RecoveryStrategy_TrimLastUserMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tokensToSave: number
    ): { tokensSaved: number; strategyName: string } {
        throw new Error('BaseAgentCompactionHelper.RecoveryStrategy_TrimLastUserMessage must be implemented by a registered subclass.');
    }

    public async AttemptContextRecovery<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _payload: P,
        _errorMessage: string,
        _modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentCompactionHelper.AttemptContextRecovery must be implemented by a registered subclass.');
    }

    // --- Mid-loop pruning, cross-turn & post-run compaction ---

    public IsMidLoopCompactionThresholdReached(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentCompactionHelper.IsMidLoopCompactionThresholdReached must be implemented by a registered subclass.');
    }

    public async PruneAndCompactExpiredMessages(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _currentTurn: number
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.PruneAndCompactExpiredMessages must be implemented by a registered subclass.');
    }

    public ResolveCompactionBudget(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration | undefined
    ): EffectiveContextBudget {
        throw new Error('BaseAgentCompactionHelper.ResolveCompactionBudget must be implemented by a registered subclass.');
    }

    public async CheckPreTurnCompaction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration | undefined
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.CheckPreTurnCompaction must be implemented by a registered subclass.');
    }

    public StartPostTurnCompaction(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentCompactionHelper.StartPostTurnCompaction must be implemented by a registered subclass.');
    }

    public async RunCrossTurnCompaction(
        _ctx: AgentRunContext,
        _phase: 'pre-turn' | 'post-turn',
        _params: ExecuteAgentParams,
        _config: AgentConfiguration | undefined,
        _budget: EffectiveContextBudget
    ): Promise<CompactionOutcome | undefined> {
        throw new Error('BaseAgentCompactionHelper.RunCrossTurnCompaction must be implemented by a registered subclass.');
    }

    public async RecordCompactionRunStep(
        _ctx: AgentRunContext,
        _phase: 'pre-turn' | 'post-turn',
        _params: ExecuteAgentParams,
        _budget: EffectiveContextBudget,
        _outcome: CompactionOutcome
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.RecordCompactionRunStep must be implemented by a registered subclass.');
    }

    public async RunPostRunCompaction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.RunPostRunCompaction must be implemented by a registered subclass.');
    }

    public async TriggerPostRunMemoryExtraction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.TriggerPostRunMemoryExtraction must be implemented by a registered subclass.');
    }

    public async CreateCompactionStep(
        _ctx: AgentRunContext,
        _prompt: MJAIPromptEntityExtended,
        _message: AgentChatMessage,
        _params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        throw new Error('BaseAgentCompactionHelper.CreateCompactionStep must be implemented by a registered subclass.');
    }

    public async UpdateCompactionStep(
        _ctx: AgentRunContext,
        _step: MJAIAgentRunStepEntityExtended,
        _result: AIPromptRunResult<{ summary: string }>,
        _message: AgentChatMessage,
        _params: ExecuteAgentParams
    ): Promise<void> {
        throw new Error('BaseAgentCompactionHelper.UpdateCompactionStep must be implemented by a registered subclass.');
    }

    public async CompactMessage(
        _ctx: AgentRunContext,
        _message: AgentChatMessage,
        _metadata: CompactMessageMetadata,
        _params: ExecuteAgentParams
    ): Promise<string> {
        throw new Error('BaseAgentCompactionHelper.CompactMessage must be implemented by a registered subclass.');
    }

    public GetSystemDefaultCompactPromptId(_ctx: AgentRunContext): string {
        throw new Error('BaseAgentCompactionHelper.GetSystemDefaultCompactPromptId must be implemented by a registered subclass.');
    }

    public ExecuteExpandMessageStep(
        _ctx: AgentRunContext,
        _request: BaseAgentNextStep,
        _params: ExecuteAgentParams,
        _currentTurn: number
    ): string | null {
        throw new Error('BaseAgentCompactionHelper.ExecuteExpandMessageStep must be implemented by a registered subclass.');
    }
}
