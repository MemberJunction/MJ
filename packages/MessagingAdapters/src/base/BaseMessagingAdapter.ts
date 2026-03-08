/**
 * @module @memberjunction/messaging-adapters
 * @description Abstract base class for messaging platform adapters.
 *
 * Handles the common flow: receive message -> resolve user -> fetch thread history
 * -> run agent -> stream updates -> send final response.
 *
 * Platform subclasses (Slack, Teams) implement the abstract methods for
 * platform-specific operations like sending messages and fetching threads.
 */

import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessage } from '@memberjunction/ai';
import { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    MessagingAdapterSettings,
    IncomingMessage,
    FormattedResponse,
    AgentIdentity,
} from './types.js';

/**
 * Abstract base class for messaging platform adapters.
 *
 * Handles the common orchestration flow that is shared across all messaging
 * platforms (Slack, Teams, Discord, etc.):
 *
 * 1. Receive an incoming message
 * 2. Determine if the bot should respond (DM, @mention, etc.)
 * 3. Resolve the platform user to an MJ UserInfo
 * 4. Show a typing/thinking indicator
 * 5. Fetch thread history for conversation context
 * 6. Route to the correct agent (default or @mentioned)
 * 7. Run the agent via `AgentRunner.RunAgent()` with streaming
 * 8. Send progressive streaming updates to the platform
 * 9. Send the final formatted response
 *
 * Platform subclasses implement the abstract methods for platform-specific
 * operations (sending messages, fetching threads, formatting responses).
 *
 * This class is NOT a `BaseServerExtension` itself — the platform-specific
 * Extension classes (e.g., `SlackMessagingExtension`) own the Express route
 * registration and delegate message handling to their adapter instance.
 *
 * ## Multi-Agent Routing
 *
 * Users can @mention different agents in different messages within the same
 * thread. Each message routes to exactly one agent. If multiple agents are
 * mentioned in a single message, the first one is used and a note is included
 * in the response.
 *
 * ## Multi-Word Agent Names
 *
 * Agent names can be multi-word (e.g., "Research Agent"). At initialization,
 * all active agents are loaded from the database. When parsing @mentions,
 * known agent names are matched longest-first to avoid prefix collisions.
 *
 * ## User Identity Mapping
 *
 * The adapter resolves the platform user's email to an MJ `UserInfo` record.
 * This gives proper per-user permission scoping without a separate auth flow.
 * Falls back to the configured service account email if no MJ user matches.
 */
export abstract class BaseMessagingAdapter {
    /** Extension settings from `mj.config.cjs`. */
    protected settings: MessagingAdapterSettings;

    /** Fallback context user (service account) loaded from config email. */
    protected fallbackContextUser: UserInfo | null = null;

    /** Default agent loaded from config DefaultAgentName. */
    protected defaultAgent: MJAIAgentEntityExtended | null = null;

    /** All active agents, loaded at init for multi-word name matching. Sorted longest-name-first. */
    protected availableAgents: MJAIAgentEntityExtended[] = [];

    constructor(settings: MessagingAdapterSettings) {
        this.settings = settings;
    }

    /**
     * Initialize the adapter: resolve the fallback context user, load the default
     * MJ agent (using the fallback user as contextUser), load all available agents,
     * then run platform init.
     * Must be called before handling any messages.
     *
     * @throws Error if the configured agent or fallback user cannot be found.
     */
    public async Initialize(): Promise<void> {
        await this.loadFallbackContextUser();
        await this.loadDefaultAgent();
        await this.loadAvailableAgents();
        await this.onInitialize();
        LogStatus(`Messaging adapter initialized: agent='${this.defaultAgent?.Name}', fallbackUser='${this.settings.ContextUserEmail}', availableAgents=${this.availableAgents.length}`);
    }

    /**
     * Main entry point: handle an incoming message from the platform.
     *
     * Orchestrates the full flow from message receipt to response delivery.
     * Errors are caught and reported as user-facing error messages — this
     * method never throws.
     *
     * @param message - Normalized incoming message from the platform adapter.
     */
    public async HandleMessage(message: IncomingMessage): Promise<void> {
        // 1. Should we respond to this message?
        if (!this.shouldRespond(message)) {
            return;
        }

        // 2. Resolve the MJ user for this platform sender
        const contextUser = await this.resolveContextUser(message);

        // 3. Show typing indicator
        if (this.settings.ShowTypingIndicator !== false) {
            await this.safeShowTypingIndicator(message);
        }

        // 4. Fetch thread history (needed for both agent resolution and conversation context)
        const threadHistory = await this.safeGetThreadHistory(message);

        // 5. Determine which agent to use (uses thread history for agent affinity)
        const { agent, multiAgentNote } = await this.resolveAgent(message, contextUser, threadHistory);

        // 6. Build conversation messages from thread history
        const conversationMessages = this.buildConversationMessages(threadHistory, message);

        // 7. Run the agent with streaming
        await this.executeAgentAndRespond(message, agent, contextUser, conversationMessages, multiAgentNote);
    }

    /**
     * Get the list of available agent names, sorted longest-first.
     * Useful for subclasses implementing multi-word agent name matching.
     */
    public get AvailableAgentNames(): string[] {
        return this.availableAgents.map(a => a.Name ?? '').filter(Boolean);
    }

    // ─── Abstract methods (platform-specific) ─────────────────────────

    /**
     * Platform-specific initialization (e.g., fetch bot user ID, open WebSocket).
     * Called at the end of `Initialize()`.
     */
    protected abstract onInitialize(): Promise<void>;

    /**
     * Show a typing/thinking indicator in the channel.
     * Some platforms (Teams) have explicit typing APIs; others (Slack) use a
     * first streaming message as the "thinking" indicator.
     *
     * @param message - The incoming message triggering the indicator.
     * @param agent - The agent that will respond (for per-agent identity).
     */
    protected abstract showTypingIndicator(message: IncomingMessage, agent?: MJAIAgentEntityExtended): Promise<void>;

    /**
     * Fetch the thread history for the given message from the platform API.
     *
     * @param channelId - Channel/conversation ID.
     * @param threadId - Thread/reply chain ID.
     * @returns Array of messages in the thread, oldest first.
     */
    protected abstract fetchThreadHistory(channelId: string, threadId: string): Promise<IncomingMessage[]>;

    /**
     * Send or update a streaming progress message. Returns the message ID.
     *
     * If `existingMessageId` is `null`, posts a new message.
     * If `existingMessageId` is provided, updates the existing message in place.
     *
     * @param originalMessage - The message being responded to.
     * @param currentContent - Accumulated streamed content so far.
     * @param existingMessageId - ID of an existing progress message to update, or `null`.
     * @param agent - The agent generating the response (for per-agent identity).
     * @returns The message ID of the progress message (new or existing).
     */
    protected abstract sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null,
        agent?: MJAIAgentEntityExtended
    ): Promise<string>;

    /**
     * Send the final formatted response as a new message in the thread.
     */
    protected abstract sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void>;

    /**
     * Update an existing streaming message with the final formatted response.
     */
    protected abstract updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void>;

    /**
     * Convert an agent execution result to the platform's rich format.
     *
     * @param result - The full agent execution result.
     * @param agent - The agent that produced the result.
     * @param responseText - Extracted human-readable response text.
     */
    protected abstract formatResponse(
        result: ExecuteAgentResult | null,
        agent: MJAIAgentEntityExtended,
        responseText: string
    ): Promise<FormattedResponse>;

    /**
     * Get the bot's own user ID on this platform (to identify bot messages in thread history).
     */
    protected abstract getBotUserId(): string;

    /**
     * Strip the bot @mention from the message text so the agent sees clean input.
     */
    protected abstract stripBotMention(text: string): string;

    /**
     * Look up the email address for a platform user ID.
     * Used for mapping platform identity to MJ user.
     *
     * @param platformUserId - Platform-specific user ID.
     * @returns Email address, or `null` if not available.
     */
    protected abstract lookupUserEmail(platformUserId: string): Promise<string | null>;

    // ─── Protected helper methods ─────────────────────────────────────

    /**
     * Build an `AgentIdentity` from an agent entity.
     * Only includes `IconURL` if it's a valid HTTPS URL.
     */
    protected buildAgentIdentity(agent: MJAIAgentEntityExtended): AgentIdentity {
        const identity: AgentIdentity = { Name: agent.Name ?? 'Agent' };
        const logoURL = agent.LogoURL;
        if (logoURL && typeof logoURL === 'string' && logoURL.startsWith('https://')) {
            identity.IconURL = logoURL;
        }
        return identity;
    }

    /**
     * Match agent names mentioned in the message text against known agents.
     *
     * Strips the bot's platform mention, then checks for known agent names
     * preceded by `@` (case-insensitive). Names are checked longest-first
     * to avoid prefix collisions (e.g., "Research Agent" before "Research").
     *
     * @param text - The raw message text.
     * @returns Array of matched agent names.
     */
    protected matchAgentMentions(text: string): string[] {
        const cleanText = this.stripBotMention(text);

        // Pass 1: Exact full-name match (longest-first to avoid prefix collisions)
        const exactMatched = this.matchExactAgentNames(cleanText);
        if (exactMatched.length > 0) return exactMatched;

        // Pass 2: First-word prefix match — "@Codesmith" matches "Codesmith Agent"
        const prefixMatched = this.matchPrefixAgentNames(cleanText);
        if (prefixMatched.length > 0) return prefixMatched;

        return [];
    }

    /**
     * Match @mentions against full agent names (exact match, case-insensitive).
     */
    private matchExactAgentNames(text: string): string[] {
        const matched: string[] = [];
        for (const agent of this.availableAgents) {
            const agentName = agent.Name;
            if (!agentName) continue;
            const pattern = new RegExp(`@${this.escapeRegex(agentName)}(?:\\b|$)`, 'i');
            if (pattern.test(text)) {
                matched.push(agentName);
            }
        }
        return matched;
    }

    /**
     * Match @mentions by first-word prefix — e.g., "@Codesmith" matches agent "Codesmith Agent".
     *
     * Extracts all `@word` tokens from the text and checks if any agent name starts with
     * that word. Only matches if exactly one agent matches to avoid ambiguity.
     */
    private matchPrefixAgentNames(text: string): string[] {
        // Extract @word tokens (single words after @)
        const mentionPattern = /@(\w+)/gi;
        const mentions: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = mentionPattern.exec(text)) !== null) {
            mentions.push(match[1]);
        }

        const matched: string[] = [];
        for (const mention of mentions) {
            const candidates = this.availableAgents.filter(
                a => a.Name != null && a.Name.toLowerCase().startsWith(mention.toLowerCase())
            );
            // Only accept unambiguous prefix matches
            if (candidates.length === 1 && candidates[0].Name) {
                matched.push(candidates[0].Name);
            }
        }
        return matched;
    }

    /**
     * Determine whether the bot should respond to this message.
     * Default: respond to DMs and explicit @mentions. Subclasses can override.
     */
    protected shouldRespond(message: IncomingMessage): boolean {
        return message.IsDirectMessage || message.IsBotMention;
    }

    /**
     * Resolve the MJ user for the platform sender.
     *
     * Flow:
     * 1. If IncomingMessage has SenderEmail, look up in UserCache
     * 2. If not, call `lookupUserEmail()` (platform API) then look up
     * 3. Fall back to the configured service account
     */
    protected async resolveContextUser(message: IncomingMessage): Promise<UserInfo> {
        let email: string | undefined = message.SenderEmail;

        if (!email) {
            try {
                email = await this.lookupUserEmail(message.SenderID) ?? undefined;
            } catch (error) {
                LogError('Failed to look up user email from platform:', undefined, error);
            }
        }

        if (email) {
            const userCache = new UserCache();
            const mjUser = userCache.Users.find(
                (u: UserInfo) => u.Email?.toLowerCase() === email!.toLowerCase()
            );
            if (mjUser) {
                return mjUser;
            }
        }

        // Fall back to service account
        return this.fallbackContextUser!;
    }

    /**
     * Resolve which agent to use for this message.
     *
     * Priority:
     * 1. Explicit @mention in the current message
     * 2. Thread affinity — if this is a reply in a thread, use the same agent
     *    that was originally @mentioned in the thread's first message
     * 3. Fall back to the default agent from config
     *
     * If the mentioned agent is not found, responds with available agents.
     */
    protected async resolveAgent(
        message: IncomingMessage,
        contextUser: UserInfo,
        threadHistory: IncomingMessage[] = []
    ): Promise<{ agent: MJAIAgentEntityExtended; multiAgentNote: string | null }> {
        const mentionedNames = message.MentionedAgentNames ?? [];

        if (mentionedNames.length === 0) {
            // No explicit @mention — check thread affinity
            const threadAgent = this.resolveThreadAgent(threadHistory);
            if (threadAgent) {
                return { agent: threadAgent, multiAgentNote: null };
            }
            return { agent: this.defaultAgent!, multiAgentNote: null };
        }

        // Look up the first mentioned agent from the cached list
        const firstAgentName = mentionedNames[0];
        const matchedAgent = this.availableAgents.find(
            a => a.Name != null && a.Name.toLowerCase() === firstAgentName.toLowerCase()
        );

        if (matchedAgent) {
            let multiAgentNote: string | null = null;
            const name = matchedAgent.Name ?? 'Agent';

            if (mentionedNames.length > 1) {
                multiAgentNote = `_Note: Only one agent can be addressed per message. Routing to **${name}**. Other mentioned agents (${mentionedNames.slice(1).join(', ')}) were not invoked._`;
            }

            return { agent: matchedAgent, multiAgentNote };
        }

        // Agent not found by name — fall back to default with helpful message
        const agentNames = this.availableAgents.map(a => a.Name ?? '').filter(Boolean).join(', ');
        LogStatus(`Agent '${firstAgentName}' not found, using default agent. Available: ${agentNames}`);

        const defaultName = this.defaultAgent!.Name ?? 'default agent';
        const helpNote = agentNames
            ? `_I couldn't find an agent named "${firstAgentName}". Available agents: ${agentNames}. Routing to **${defaultName}**._`
            : null;

        return { agent: this.defaultAgent!, multiAgentNote: helpNote };
    }

    /**
     * Look through the thread history to find the agent that was originally invoked.
     *
     * Checks the first user message in the thread for @agent mentions. This provides
     * thread affinity — follow-up messages in a thread continue with the same agent
     * without requiring the user to @mention it again, matching MJ Explorer behavior.
     *
     * @returns The agent from the thread's first message, or `null` if none found.
     */
    private resolveThreadAgent(threadHistory: IncomingMessage[]): MJAIAgentEntityExtended | null {
        if (threadHistory.length === 0) return null;

        const botUserId = this.getBotUserId();

        // Walk through thread messages (oldest first) looking for user messages with agent mentions
        for (const msg of threadHistory) {
            // Skip bot messages
            if (msg.SenderID === botUserId) continue;

            // Check for agent mentions in this message
            const mentions = msg.MentionedAgentNames ?? this.matchAgentMentions(msg.Text);
            if (mentions.length > 0) {
                const matched = this.availableAgents.find(
                    a => a.Name != null && a.Name.toLowerCase() === mentions[0].toLowerCase()
                );
                if (matched) {
                    LogStatus(`Thread affinity: routing to '${matched.Name}' (mentioned in thread message ${msg.MessageID})`);
                    return matched;
                }
            }
        }

        return null;
    }

    /**
     * Execute the agent and send the response, with streaming support.
     */
    private async executeAgentAndRespond(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[],
        multiAgentNote: string | null
    ): Promise<void> {
        const runner = new AgentRunner();
        let streamBuffer = '';
        let lastUpdateTime = 0;
        const updateInterval = this.settings.StreamingUpdateIntervalMs ?? 1000;
        let progressMessageId: string | null = null;

        try {
            const params: ExecuteAgentParams = {
                agent,
                conversationMessages,
                contextUser,
                onStreaming: (chunk) => {
                    streamBuffer += chunk.content;
                    const now = Date.now();
                    if (now - lastUpdateTime >= updateInterval) {
                        lastUpdateTime = now;
                        this.sendOrUpdateStreamingMessage(
                            message, streamBuffer, progressMessageId, agent
                        ).then(msgId => {
                            progressMessageId = msgId;
                        }).catch((err) => {
                            LogError('Streaming update failed:', undefined, err);
                        });
                    }
                }
            };

            const result: ExecuteAgentResult = await runner.RunAgent(params);

            // Extract response text
            const responseText = this.extractResponseText(result);

            // Prepend multi-agent note if applicable
            const fullResponse = multiAgentNote
                ? multiAgentNote + '\n\n' + responseText
                : responseText;

            // Format and send final response
            const formatted = await this.formatResponse(result, agent, fullResponse);

            if (progressMessageId) {
                await this.updateFinalMessage(message, progressMessageId, formatted);
            } else {
                await this.sendFinalMessage(message, formatted);
            }
        } catch (error) {
            LogError('Error running agent for messaging adapter:', undefined, error);
            const errorMessage = "I'm sorry, I encountered an error processing your request. Please try again.";
            const errorFormatted = await this.formatResponse(null, agent, errorMessage);

            if (progressMessageId) {
                await this.updateFinalMessage(message, progressMessageId, errorFormatted);
            } else {
                await this.sendFinalMessage(message, errorFormatted);
            }
        }
    }

    /**
     * Extract the response text from an `ExecuteAgentResult`.
     *
     * Extraction priority (matches MJ Explorer, AICLI, and TaskOrchestrator):
     * 1. `agentRun.Message` — the primary human-readable field set by most agents
     * 2. Human-readable message from step outputs (skipping orchestration metadata)
     * 3. `agentRun.Result` (final result field on the run entity)
     * 4. `agentRun.FinalPayload` (full payload stored on the run)
     * 5. `result.payload` (the in-memory payload from execution)
     *
     * Orchestration metadata (outputs containing `subAgentResult`, `nextStep: "retry"`,
     * `payloadChangeResult`) is skipped in favor of actual user-facing content.
     */
    private extractResponseText(result: ExecuteAgentResult): string {
        if (!result.success) {
            return this.extractErrorText(result);
        }

        // 1. Try agentRun.Message — primary human-readable field (used by Explorer, AICLI, TaskOrchestrator)
        const message = result.agentRun?.Message;
        if (message && typeof message === 'string' && message.trim()) {
            // Check if Message is a short delegation note and richer content exists.
            // When an agent delegates to a sub-agent, the parent's Message is often brief
            // (e.g., "I'll have Codesmith handle this") while the real output is in the payload.
            const richContent = this.extractRicherContent(result);
            if (richContent && this.isDelegationNote(message, richContent)) {
                return message + '\n\n' + richContent;
            }
            return message;
        }

        // 2. Try step outputs (skip orchestration metadata)
        const stepText = this.extractFromStepOutputs(result);
        if (stepText) return stepText;

        // 3. Try agentRun.Result (explicit final result field)
        const runResult = result.agentRun?.Result;
        if (runResult) {
            const parsed = this.parseOutputData(runResult);
            if (parsed && !this.isOrchestrationMetadata(parsed)) {
                return parsed;
            }
        }

        // 4. Try agentRun.FinalPayload (full merged payload)
        const finalPayload = result.agentRun?.FinalPayload;
        if (finalPayload) {
            const parsed = this.extractHumanContentFromPayload(finalPayload);
            if (parsed) return parsed;
        }

        // 5. Try result.payload (in-memory payload)
        if (result.payload != null) {
            return this.extractFromPayloadObject(result.payload);
        }

        return "I processed your request but have no response to show.";
    }

    /**
     * Check if a message looks like a brief delegation note rather than the actual response.
     *
     * Delegation notes are short messages (under 200 chars) where the payload has
     * substantially more content. This happens when a parent agent (e.g., Sage) delegates
     * to a sub-agent (e.g., Codesmith) — the parent's Message is a brief handoff note
     * while the real output is in the merged payload.
     */
    private isDelegationNote(message: string, richerContent: string): boolean {
        const messageLen = message.trim().length;
        const richLen = richerContent.trim().length;
        // Message is short AND payload has significantly more content
        return messageLen < 200 && richLen > messageLen * 2;
    }

    /**
     * Try to extract richer human-readable content from the payload sources.
     * Used to detect when agentRun.Message is just a delegation note.
     */
    private extractRicherContent(result: ExecuteAgentResult): string | null {
        // Try FinalPayload first (merged payload from sub-agent execution)
        const finalPayload = result.agentRun?.FinalPayload;
        if (finalPayload) {
            const parsed = this.extractHumanContentFromPayload(finalPayload);
            if (parsed) return parsed;
        }

        // Try in-memory payload
        if (result.payload != null) {
            if (typeof result.payload === 'string' && result.payload.trim()) {
                return result.payload;
            }
            if (typeof result.payload === 'object' && result.payload !== null) {
                return this.extractHumanTextFromObject(result.payload as Record<string, unknown>);
            }
        }

        // Try agentRun.Result
        const runResult = result.agentRun?.Result;
        if (runResult) {
            const parsed = this.parseOutputData(runResult);
            if (parsed && !this.isOrchestrationMetadata(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * Extract error text from a failed agent result.
     */
    private extractErrorText(result: ExecuteAgentResult): string {
        const errorMsg = result.agentRun?.ErrorMessage;
        if (errorMsg) {
            return `I encountered an issue: ${errorMsg}`;
        }
        return "I'm sorry, I encountered an error processing your request. Please try again.";
    }

    /**
     * Try to extract a human-readable message from step outputs.
     * Skips orchestration metadata (subAgentResult, payloadChangeResult, etc.).
     */
    private extractFromStepOutputs(result: ExecuteAgentResult): string | null {
        const steps = result.agentRun?.Steps ?? [];
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (!step.OutputData) continue;

            const parsed = this.parseOutputData(step.OutputData);
            if (parsed && !this.isOrchestrationMetadata(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    /**
     * Extract human-readable content from a FinalPayload string.
     * The payload may be a structured research result with nested findings.
     */
    private extractHumanContentFromPayload(payloadStr: string): string | null {
        try {
            const obj = JSON.parse(payloadStr) as Record<string, unknown>;
            return this.extractHumanTextFromObject(obj);
        } catch {
            // Not JSON — could be plain text
            if (payloadStr.trim().length > 0 && !this.isOrchestrationMetadata(payloadStr)) {
                return payloadStr;
            }
            return null;
        }
    }

    /**
     * Extract text from a payload object (from result.payload).
     */
    private extractFromPayloadObject(payload: unknown): string {
        if (typeof payload === 'string') {
            const parsed = this.parseOutputData(payload);
            return parsed || payload;
        }

        if (typeof payload === 'object' && payload !== null) {
            const obj = payload as Record<string, unknown>;
            const humanText = this.extractHumanTextFromObject(obj);
            if (humanText) return humanText;
        }

        return "I processed your request but have no response to show.";
    }

    /**
     * Parse output data that may be JSON with a message field, or plain text.
     */
    private parseOutputData(data: string): string {
        try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            return this.extractMessageFromObject(parsed);
        } catch {
            return data;
        }
    }

    /**
     * Check if text/object looks like orchestration metadata rather than user content.
     * Orchestration outputs contain control fields like subAgentResult, payloadChangeResult.
     */
    private isOrchestrationMetadata(text: string): boolean {
        // Check for orchestration JSON patterns
        const orchestrationMarkers = [
            '"subAgentResult"',
            '"payloadChangeResult"',
            '"shouldTerminate"',
            '"nextStep":"retry"',
            '"nextStep": "retry"',
        ];
        return orchestrationMarkers.some(marker => text.includes(marker));
    }

    /**
     * Extract the human-readable message from a structured agent response object.
     * Checks common patterns: nextStep.message, message, output, result, summary.
     * Also recognizes Research Agent state payloads and orchestration metadata.
     */
    private extractMessageFromObject(obj: Record<string, unknown>): string {
        // Pattern: { nextStep: { message: "..." } } (Sage/Loop agents — conversational)
        if (obj.nextStep != null && typeof obj.nextStep === 'object') {
            const nextStep = obj.nextStep as Record<string, unknown>;
            if (typeof nextStep.message === 'string' && nextStep.message.trim()) {
                return nextStep.message;
            }
        }

        // Pattern: { message: "..." }
        if (typeof obj.message === 'string' && obj.message.trim()) {
            return obj.message;
        }

        // Pattern: { output: "..." }
        if (typeof obj.output === 'string' && obj.output.trim()) {
            return obj.output;
        }

        // Pattern: { result: "..." }
        if (typeof obj.result === 'string' && obj.result.trim()) {
            return obj.result;
        }

        // Pattern: { summary: "..." }
        if (typeof obj.summary === 'string' && obj.summary.trim()) {
            return obj.summary;
        }

        // Skip orchestration metadata — return empty to let caller try next source
        if (this.looksLikeOrchestrationObject(obj)) {
            return '';
        }

        // Research Agent state payload — compose readable text
        const researchText = this.composeFromResearchState(obj);
        if (researchText) return researchText;

        // Fallback: stringify
        return JSON.stringify(obj, null, 2);
    }

    /**
     * Try to extract human-readable text from a structured payload object.
     * Handles research payloads with findings, summaries, sections, etc.
     */
    private extractHumanTextFromObject(obj: Record<string, unknown>): string | null {
        // First try to compose from structured payload (title + findings/sections).
        // This produces richer output than a single field.
        const composedText = this.composeFromStructuredPayload(obj);
        if (composedText) return composedText;

        // Codesmith-style payload: { task, code, results, iterations, errors }
        const codesmithText = this.composeFromCodePayload(obj);
        if (codesmithText) return codesmithText;

        // Direct text fields (for simpler payloads)
        const directFields = ['summary', 'message', 'output', 'result', 'content', 'text', 'report'];
        for (const field of directFields) {
            if (typeof obj[field] === 'string' && (obj[field] as string).trim()) {
                return obj[field] as string;
            }
        }

        // Check nested objects for common patterns
        const nestedFields = ['data', 'response', 'payload', 'results'];
        for (const field of nestedFields) {
            if (obj[field] != null && typeof obj[field] === 'object') {
                const nested = this.extractHumanTextFromObject(obj[field] as Record<string, unknown>);
                if (nested) return nested;
            }
        }

        return null;
    }

    /**
     * Compose human-readable text from a code execution payload.
     *
     * Recognizes payloads with the shape `{ task, code, results, iterations }` —
     * produced by agents like Codesmith that generate and execute code.
     */
    private composeFromCodePayload(obj: Record<string, unknown>): string | null {
        // Must have `code` and `results` to be recognized as a code execution payload
        if (typeof obj.code !== 'string' || !('results' in obj)) {
            return null;
        }

        const parts: string[] = [];

        // Task description
        if (typeof obj.task === 'string' && obj.task.trim()) {
            parts.push(`**Task:** ${obj.task}`);
        }

        // Results — the primary output
        const results = obj.results;
        if (results != null) {
            if (typeof results === 'string') {
                parts.push(results);
            } else {
                parts.push('**Results:**\n```json\n' + JSON.stringify(results, null, 2) + '\n```');
            }
        }

        // Code used (abbreviated if long)
        const code = obj.code as string;
        if (code.trim()) {
            const codePreview = code.length > 500 ? code.slice(0, 500) + '\n// ...(truncated)' : code;
            parts.push('**Code:**\n```javascript\n' + codePreview + '\n```');
        }

        // Errors if any
        if (Array.isArray(obj.errors) && (obj.errors as unknown[]).length > 0) {
            const errors = (obj.errors as string[]).filter(Boolean);
            if (errors.length > 0) {
                parts.push('**Errors:** ' + errors.join('; '));
            }
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Compose human-readable text from a structured research/analysis payload.
     * Handles payloads with arrays of findings, sections, sources, etc.
     */
    private composeFromStructuredPayload(obj: Record<string, unknown>): string | null {
        const parts: string[] = [];

        // Title
        if (typeof obj.title === 'string' || typeof obj.Title === 'string') {
            parts.push(`# ${(obj.title ?? obj.Title) as string}`);
        }

        // Summary
        if (typeof obj.summary === 'string' || typeof obj.Summary === 'string') {
            parts.push((obj.summary ?? obj.Summary) as string);
        }

        // Findings / Sections / extractedFindings
        const arrayFields = [
            'findings', 'Findings', 'extractedFindings',
            'sections', 'Sections', 'items', 'results'
        ];
        for (const field of arrayFields) {
            if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
                const items = obj[field] as Record<string, unknown>[];
                for (const item of items) {
                    const itemText = this.formatPayloadItem(item);
                    if (itemText) parts.push(itemText);
                }
                break; // Only use the first matching array
            }
        }

        // Sources
        const sourceFields = ['sources', 'Sources', 'sourceRecords', 'references'];
        for (const field of sourceFields) {
            if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
                const sources = (obj[field] as Record<string, unknown>[])
                    .slice(0, 10)
                    .map(s => this.formatSourceItem(s))
                    .filter(Boolean);
                if (sources.length > 0) {
                    parts.push('\n## Sources\n' + sources.join('\n'));
                }
                break;
            }
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Format a single finding/section item from a structured payload.
     */
    private formatPayloadItem(item: Record<string, unknown>): string | null {
        if (typeof item !== 'object' || item == null) return null;

        const heading = (item.heading ?? item.Heading ?? item.title ?? item.Title ?? item.name ?? item.Name) as string | undefined;
        const content = (item.content ?? item.Content ?? item.text ?? item.Text ?? item.description ?? item.Description ?? item.finding ?? item.Finding) as string | undefined;

        if (!heading && !content) return null;

        if (heading && content) return `### ${heading}\n${content}`;
        if (heading) return `### ${heading}`;
        return content ?? null;
    }

    /**
     * Format a single source/reference item.
     */
    private formatSourceItem(source: Record<string, unknown>): string {
        if (typeof source !== 'object' || source == null) return '';
        const title = (source.title ?? source.Title ?? source.name ?? source.Name ?? 'Source') as string;
        const url = (source.url ?? source.URL ?? source.link ?? source.Link) as string | undefined;
        if (url) return `- [${title}](${url})`;
        return `- ${title}`;
    }

    /**
     * Compose readable text from a Research Agent state payload.
     *
     * Research Agent payloads have a characteristic structure:
     * `{ metadata: { researchGoal, status }, plan: { researchQuestions, initialPlan }, iterations: [...] }`
     *
     * Extracts the research goal, plan, questions, and any iteration content.
     */
    private composeFromResearchState(obj: Record<string, unknown>): string | null {
        const metadata = obj.metadata as Record<string, unknown> | undefined;
        const plan = obj.plan as Record<string, unknown> | undefined;

        // Must have the metadata + plan shape to be recognized as research state
        if (!metadata || typeof metadata !== 'object' || !plan || typeof plan !== 'object') {
            return null;
        }

        const researchGoal = metadata.researchGoal as string | undefined;
        if (!researchGoal) return null;

        const parts: string[] = [];

        // Title from research goal
        parts.push(`# ${researchGoal}`);

        // Status
        const status = metadata.status as string | undefined;
        if (status === 'in_progress') {
            parts.push('_Research is in progress..._');
        }

        // Plan description
        const initialPlan = plan.initialPlan as string | undefined;
        if (initialPlan) {
            parts.push(initialPlan);
        }

        // Research questions
        const questions = plan.researchQuestions as string[] | undefined;
        if (Array.isArray(questions) && questions.length > 0) {
            const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
            parts.push(`## Research Questions\n${questionList}`);
        }

        // Iterations with actual content
        const iterations = obj.iterations as Record<string, unknown>[] | undefined;
        if (Array.isArray(iterations) && iterations.length > 0) {
            for (const iteration of iterations) {
                const iterContent = this.extractIterationContent(iteration);
                if (iterContent) parts.push(iterContent);
            }
        }

        // Extracted findings (from sourceRecords or extractedFindings)
        const findingsFields = ['extractedFindings', 'sourceRecords'];
        for (const field of findingsFields) {
            if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length > 0) {
                const items = (obj[field] as Record<string, unknown>[])
                    .map(item => this.formatPayloadItem(item))
                    .filter(Boolean);
                if (items.length > 0) {
                    parts.push(`## Findings\n${items.join('\n\n')}`);
                }
                break;
            }
        }

        // Comparisons or contradictions
        const comparisons = obj.comparisons as Record<string, unknown>[] | undefined;
        if (Array.isArray(comparisons) && comparisons.length > 0) {
            const compTexts = comparisons
                .map(c => (c.description ?? c.summary ?? c.text) as string | undefined)
                .filter(Boolean);
            if (compTexts.length > 0) {
                parts.push(`## Key Comparisons\n${compTexts.map(t => `- ${t}`).join('\n')}`);
            }
        }

        return parts.length > 1 ? parts.join('\n\n') : null;
    }

    /**
     * Extract readable content from a research iteration object.
     */
    private extractIterationContent(iteration: Record<string, unknown>): string | null {
        if (!iteration || typeof iteration !== 'object') return null;

        const parts: string[] = [];
        const iterNum = iteration.iterationNumber ?? iteration.number;
        if (iterNum != null) {
            parts.push(`### Iteration ${iterNum}`);
        }

        // Look for findings, summary, or content within the iteration
        const summary = (iteration.summary ?? iteration.findings ?? iteration.content ?? iteration.result) as string | undefined;
        if (typeof summary === 'string' && summary.trim()) {
            parts.push(summary);
        }

        // Nested findings array
        const findings = iteration.extractedFindings as Record<string, unknown>[] | undefined;
        if (Array.isArray(findings) && findings.length > 0) {
            for (const f of findings) {
                const text = this.formatPayloadItem(f);
                if (text) parts.push(text);
            }
        }

        return parts.length > 0 ? parts.join('\n') : null;
    }

    /**
     * Check if an object looks like orchestration/control metadata.
     */
    private looksLikeOrchestrationObject(obj: Record<string, unknown>): boolean {
        const orchestrationKeys = ['subAgentResult', 'payloadChangeResult', 'shouldTerminate'];
        return orchestrationKeys.some(key => key in obj);
    }

    /**
     * Fetch thread history with error handling. Returns empty array on failure.
     */
    private async safeGetThreadHistory(message: IncomingMessage): Promise<IncomingMessage[]> {
        if (!message.ThreadID) {
            return []; // Top-level message, no prior history
        }
        try {
            const maxMessages = this.settings.MaxThreadMessages ?? 50;
            const history = await this.fetchThreadHistory(message.ChannelID, message.ThreadID);
            // Exclude the current message and limit
            return history
                .filter(m => m.MessageID !== message.MessageID)
                .slice(-maxMessages);
        } catch (error) {
            LogError('Failed to fetch thread history, proceeding without context:', undefined, error);
            return [];
        }
    }

    /**
     * Show typing indicator with error handling. Failures are silently ignored.
     * Now passes the resolved agent for per-agent identity on the indicator.
     */
    private async safeShowTypingIndicator(message: IncomingMessage, agent?: MJAIAgentEntityExtended): Promise<void> {
        try {
            await this.showTypingIndicator(message, agent);
        } catch (error) {
            // Typing indicator failures are non-critical
        }
    }

    /**
     * Convert thread history + current message into `ChatMessage[]` for `AgentRunner`.
     *
     * Maps platform messages to roles:
     * - Messages from the bot → `assistant`
     * - Messages from anyone else → `user`
     *
     * Bot @mentions are stripped from user messages.
     */
    private buildConversationMessages(
        history: IncomingMessage[],
        currentMessage: IncomingMessage
    ): ChatMessage[] {
        const botUserId = this.getBotUserId();
        const messages: ChatMessage[] = [];

        for (const msg of history) {
            const role = msg.SenderID === botUserId ? 'assistant' : 'user';
            const content = role === 'user' ? this.stripBotMention(msg.Text) : msg.Text;
            if (content.trim()) {
                messages.push({ role, content });
            }
        }

        // Add the current message
        const currentText = this.stripBotMention(currentMessage.Text).trim();
        if (currentText) {
            messages.push({ role: 'user', content: currentText });
        }

        return messages;
    }

    /**
     * Load the default MJ agent entity from database by name.
     * Matches the pattern used by the conversation UI (ConversationAgentService).
     * @throws Error if the configured agent name cannot be found.
     */
    private async loadDefaultAgent(): Promise<void> {
        const agentName = this.settings.DefaultAgentName;
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${agentName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, this.fallbackContextUser!);
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Default agent '${agentName}' not found. Verify the DefaultAgentName in your messaging adapter config.`);
        }
        this.defaultAgent = result.Results[0];
    }

    /**
     * Load all active agents for multi-word name matching.
     * Sorted longest-name-first to avoid prefix collisions.
     */
    private async loadAvailableAgents(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Status='Active'`,
            ResultType: 'entity_object'
        }, this.fallbackContextUser!);

        if (result.Success) {
            // Sort longest name first for greedy matching
            this.availableAgents = result.Results.sort(
                (a, b) => (b.Name?.length ?? 0) - (a.Name?.length ?? 0)
            );
        } else {
            LogError('Failed to load available agents for name matching', undefined, result.ErrorMessage);
            this.availableAgents = [];
        }
    }

    /**
     * Resolve the fallback context user from the configured email.
     * @throws Error if the configured email cannot be found.
     */
    private async loadFallbackContextUser(): Promise<void> {
        const userCache = new UserCache();
        const user = userCache.Users.find(
            (u: UserInfo) => u.Email?.toLowerCase() === this.settings.ContextUserEmail.toLowerCase()
        );

        if (!user) {
            throw new Error(`Fallback context user not found: ${this.settings.ContextUserEmail}`);
        }

        this.fallbackContextUser = user;
    }

    /**
     * Escape special regex characters in a string.
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
