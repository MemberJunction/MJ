/**
 * @fileoverview Shared, reusable orchestration for injecting MemberJunction "memory"
 * (notes + examples) and pre-execution RAG context into an agent's conversation messages.
 *
 * This logic was extracted verbatim out of `BaseAgent` so it can be called identically from
 * both `BaseAgent` and the new `Realtime` agent type — the co-agent must assemble the same
 * context the loop agent already does, with no duplicated logic. The underlying retrieval
 * (`AgentContextInjector`, reranking, `AgentPreExecutionRAG`) is unchanged; this class is the
 * thin wrapper that reads the agent's inject flags, builds the scope params, formats the
 * system message, and unshifts it onto the conversation array.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIAgentNoteEntity, MJAIAgentExampleEntity } from '@memberjunction/core-entities';
import { ChatMessage } from '@memberjunction/ai';
import { SecondaryScopeConfig, SecondaryScopeValue } from '@memberjunction/ai-core-plus';

import { AgentContextInjector } from './agent-context-injector';
import { AgentPreExecutionRAG, AgentPreExecutionRAGResult } from './agent-pre-execution-rag';
import { RerankerService } from '@memberjunction/ai-reranker';

/**
 * Verbose-aware status logging callback. Mirrors `BaseAgent.logStatus(message, verboseOnly)`.
 */
export type AgentMemoryStatusLogger = (message: string, verboseOnly?: boolean) => void;

/**
 * Error logging callback. Mirrors the subset of `BaseAgent.logError` used by RAG injection.
 */
export type AgentMemoryErrorLogger = (
    error: Error | string,
    options?: { category?: string; agent?: MJAIAgentEntityExtended }
) => void;

/**
 * Observability context for run-step tracking, derived by the caller from the active agent run.
 */
export interface AgentMemoryObservability {
    /** Current agent run ID for tracing. */
    agentRunID: string;
    /** Step sequence number for the rerank step. */
    stepNumber: number;
}

/**
 * Shared helper that orchestrates context-memory and pre-execution RAG injection for an agent.
 *
 * Stateless: every method receives all required inputs as parameters and returns the data the
 * caller needs to persist (matching the original return shapes of the `BaseAgent` methods).
 * The system-message side effects are applied to the supplied `conversationMessages` array,
 * exactly as before.
 */
export class AgentMemoryContextBuilder {
    /**
     * Inject notes and examples into agent context memory.
     * Injects memory context directly into the supplied conversation messages array.
     *
     * @param input - The user input text for semantic search
     * @param agent - The agent configuration entity
     * @param userId - Optional user ID for scoping
     * @param companyId - Optional company ID for scoping
     * @param contextUser - User context
     * @param conversationMessages - The conversation messages array to inject into
     * @param primaryScopeEntityId - Optional primary scope entity ID for multi-tenant filtering
     * @param primaryScopeRecordId - Optional primary scope record ID for multi-tenant filtering
     * @param secondaryScopes - Optional secondary scope dimensions for multi-tenant filtering
     * @param secondaryScopeConfig - Optional agent-level scope config for per-dimension inheritance
     * @param observability - Optional observability context for run-step tracking
     * @param logStatus - Optional verbose-aware status logger
     * @returns Object containing injected notes and examples
     */
    public async InjectContextMemory(
        input: string,
        agent: MJAIAgentEntityExtended,
        userId?: string,
        companyId?: string,
        contextUser?: UserInfo,
        conversationMessages?: ChatMessage[],
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        secondaryScopeConfig?: SecondaryScopeConfig | null,
        observability?: AgentMemoryObservability,
        logStatus?: AgentMemoryStatusLogger
    ): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        // Check if injection is enabled
        if (!agent.InjectNotes && !agent.InjectExamples) {
            return { notes: [], examples: [] };
        }

        const injector = new AgentContextInjector();

        // Parse reranker configuration if present
        const rerankerConfigJson = agent.RerankerConfiguration;
        const rerankerConfig = RerankerService.Instance.parseConfiguration(rerankerConfigJson);

        // Get notes if injection enabled
        const notes = agent.InjectNotes
            ? await injector.GetNotesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.NoteInjectionStrategy as 'Relevant' | 'Recent' | 'All',
                maxNotes: agent.MaxNotesToInject || 5,
                contextUser: contextUser!,
                rerankerConfig,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                secondaryScopeConfig,
                // Pass observability context for run step tracking
                observability: observability ? {
                    agentRunID: observability.agentRunID,
                    stepNumber: observability.stepNumber
                } : undefined
            })
            : [];
        logStatus?.(`BaseAgent: Got ${notes.length} notes from injector`, true);

        // Get examples if injection enabled
        const examples = agent.InjectExamples
            ? await injector.GetExamplesForContext({
                agentId: agent.ID,
                userId,
                companyId,
                currentInput: input,
                strategy: agent.ExampleInjectionStrategy as 'Semantic' | 'Recent' | 'Rated',
                maxExamples: agent.MaxExamplesToInject || 3,
                contextUser: contextUser!,
                primaryScopeEntityId,
                primaryScopeRecordId,
                secondaryScopes,
                secondaryScopeConfig
            })
            : [];

        // Format and inject memory context into conversation messages
        if ((notes.length > 0 || examples.length > 0) && conversationMessages) {
            const notesText = injector.FormatNotesForInjection(notes);
            const examplesText = injector.FormatExamplesForInjection(examples);

            let memoryContext = '';
            if (notesText) memoryContext += notesText + '\n\n';
            if (examplesText) memoryContext += examplesText + '\n\n';

            // Inject as system message at the start
            conversationMessages.unshift({
                role: 'system',
                content: memoryContext
            });

            logStatus?.(
                `💾 Injected ${notes.length} notes and ${examples.length} examples into conversation context`,
                true
            );
        }

        return { notes, examples };
    }

    /**
     * Inject pre-execution RAG context for this agent using scoped search.
     *
     * Loads the agent's `AIAgentSearchScope` rows (Phase IN 'PreExecution'|'Both'), renders any
     * per-scope query templates, calls `SearchEngine.Search()` per scope, cross-scope RRF fuses
     * the results when multiple scopes contributed, and unshifts a `<retrieved_context>` system
     * message onto `conversationMessages`.
     *
     * When the agent has no active pre-execution scopes (or all scopes returned zero results),
     * this method is a no-op — no system message is injected and `null` is returned.
     *
     * See plans/search-scopes-rag-plus.md §4 (Agent Integration — Pre-Execution RAG).
     *
     * @param lastUserMessage - The most recent user message text.
     * @param agent - The agent being executed.
     * @param contextUser - Calling user (threaded to SearchEngine + Metadata).
     * @param conversationMessages - The mutated message array that flows to the LLM (system msg is unshifted here).
     * @param originalMessages - The unmodified messages array (for template `recentMessages`).
     * @param primaryScopeEntityId - Multi-tenant primary scope entity ID.
     * @param primaryScopeRecordId - Multi-tenant primary scope record ID.
     * @param secondaryScopes - Multi-tenant secondary scope dimensions.
     * @param payload - The agent's current payload (for template rendering).
     * @param logStatus - Optional verbose-aware status logger.
     * @param logError - Optional error logger (used when RAG injection fails non-fatally).
     * @returns The structured RAG result, or `null` if no scopes produced results.
     */
    public async InjectPreExecutionRAG(
        lastUserMessage: string,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined,
        originalMessages: ChatMessage[] | undefined,
        primaryScopeEntityId?: string,
        primaryScopeRecordId?: string,
        secondaryScopes?: Record<string, SecondaryScopeValue>,
        payload?: unknown,
        logStatus?: AgentMemoryStatusLogger,
        logError?: AgentMemoryErrorLogger
    ): Promise<AgentPreExecutionRAGResult | null> {
        try {
            if (!contextUser) return null;
            if (!agent?.ID) return null;

            const rag = new AgentPreExecutionRAG();
            const result = await rag.Execute({
                agent,
                lastUserMessage,
                recentMessages: originalMessages ? originalMessages.slice(-5) : undefined,
                payload,
                primaryScopeRecordId,
                primaryScopeEntityId,
                secondaryScopes,
                contextUser
            });

            if (!result) return null;

            if (conversationMessages && result.formattedSystemMessage) {
                conversationMessages.unshift({ role: 'system', content: result.formattedSystemMessage });
                logStatus?.(
                    `🔎 Injected pre-execution RAG context: ${result.combinedResults.length} result(s) from ${result.queriedScopeIDs.length} scope(s)`,
                    true
                );
            }

            return result;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError?.(`InjectPreExecutionRAG failed — continuing without RAG context: ${msg}`, {
                agent,
                category: 'AgentPreExecutionRAG'
            });
            return null;
        }
    }
}
