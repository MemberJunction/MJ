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
    AgentResponseMetadata,
} from './types.js';

/**
 * Result from `runAgentWithStreaming`, wrapping the ExecuteAgentResult with
 * conversation/artifact metadata from `RunAgentInConversation`.
 */
interface ConversationAgentResult {
    /** The agent execution result. */
    result: ExecuteAgentResult;
    /** The MJ Conversation Artifact ID, if one was created. */
    artifactId?: string;
    /** The MJ Conversation ID for this interaction. */
    conversationId?: string;
}

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

    /**
     * Maps platform thread IDs to MJ Conversation IDs.
     * Ensures all messages in the same Slack/Teams thread share a single MJ Conversation,
     * preserving context across follow-up messages.
     */
    private threadConversationMap = new Map<string, string>();

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
     * @param metadata - Optional metadata about the conversation/artifact for deep linking.
     */
    protected abstract formatResponse(
        result: ExecuteAgentResult | null,
        agent: MJAIAgentEntityExtended,
        responseText: string,
        metadata?: AgentResponseMetadata
    ): Promise<FormattedResponse>;

    /**
     * Human-readable platform name (e.g., "Slack", "Teams") used in conversation names
     * and log messages. Subclasses must return their platform identifier.
     */
    protected abstract get PlatformName(): string;

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

        // Pass 1: Exact full-name match with @ prefix (longest-first)
        const exactMatched = this.matchExactAgentNames(cleanText);
        if (exactMatched.length > 0) return exactMatched;

        // Pass 2: First-word prefix match with @ prefix — "@Codesmith" matches "Codesmith Agent"
        const prefixMatched = this.matchPrefixAgentNames(cleanText);
        if (prefixMatched.length > 0) return prefixMatched;

        // Pass 3: Bare name match (no @ required) — handles "@Bot marketing agent help"
        // where the @ was consumed by the bot mention. Only matches at the start of
        // the message to avoid false positives in regular text.
        const bareMatched = this.matchBareAgentNames(cleanText);
        if (bareMatched.length > 0) return bareMatched;

        // Pass 4: Agent name anywhere in the message — handles "write a blog for me marketing agent"
        // where the agent name is at the end or middle. Only matches full agent names
        // with word boundaries, longest-first, to avoid false positives.
        const anywhereMatched = this.matchAnywhereAgentNames(cleanText);
        if (anywhereMatched.length > 0) return anywhereMatched;

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
     * Match agent names at the start of the message without an @ prefix.
     *
     * Handles the common Slack pattern where the user types `@Bot Marketing Agent help me`
     * — the `@Bot` becomes `<@U123>` and gets stripped, leaving `Marketing Agent help me`.
     * We check if the cleaned text starts with a known agent name (case-insensitive,
     * longest-first to avoid prefix collisions).
     */
    private matchBareAgentNames(text: string): string[] {
        const trimmed = text.trim().toLowerCase();
        for (const agent of this.availableAgents) {
            const agentName = agent.Name;
            if (!agentName) continue;
            const lowerName = agentName.toLowerCase();
            // Must start with the agent name followed by a word boundary or end
            if (trimmed.startsWith(lowerName) &&
                (trimmed.length === lowerName.length || /\W/.test(trimmed[lowerName.length]))) {
                return [agentName];
            }
        }
        return [];
    }

    /**
     * Match agent names appearing anywhere in the message text.
     *
     * This is the lowest-priority matching pass. It handles cases like
     * "write a blog for me marketing agent" where the agent name is at the
     * end or middle of the message. Uses word boundary matching and checks
     * longest names first to avoid false positives.
     *
     * Only returns a match if exactly one agent is found, to avoid ambiguity.
     */
    private matchAnywhereAgentNames(text: string): string[] {
        const lowerText = text.trim().toLowerCase();
        const matched: string[] = [];
        for (const agent of this.availableAgents) {
            const agentName = agent.Name;
            if (!agentName || agentName.length < 3) continue; // Skip very short names
            const lowerName = agentName.toLowerCase();
            // Check for the agent name with word boundaries on both sides
            const pattern = new RegExp(`(?:^|\\W)${this.escapeRegex(lowerName)}(?:\\W|$)`, 'i');
            if (pattern.test(lowerText)) {
                matched.push(agentName);
                // For anywhere matching, only accept unambiguous results
                // If we find more than one agent, it's ambiguous — skip
                if (matched.length > 1) return [];
            }
        }
        return matched;
    }

    /**
     * Determine whether the bot should respond to this message.
     *
     * Responds to:
     * - Direct messages (DMs)
     * - Explicit @mentions (`app_mention` events)
     * - Thread replies (any reply in a thread the bot is participating in)
     *
     * Thread replies are included because the bot only has threads it started
     * (via slash commands or @mention responses), so a reply in such a thread
     * is implicitly directed at the bot.
     *
     * Subclasses can override for platform-specific logic.
     */
    protected shouldRespond(message: IncomingMessage): boolean {
        return message.IsDirectMessage || message.IsBotMention || message.ThreadID != null;
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

    /** Maximum number of delegation hops to prevent infinite loops. */
    private static readonly MAX_DELEGATION_HOPS = 3;

    /**
     * Execute the agent and send the response, with streaming support.
     * Handles delegation automatically: when the agent returns `payload.invokeAgent`,
     * the target agent is auto-executed (matching MJ Explorer behavior).
     */
    /**
     * Get the thread key for conversation mapping.
     * Uses ThreadID if in a thread, otherwise MessageID (for thread-root messages).
     */
    private getThreadKey(message: IncomingMessage): string {
        return `${message.ChannelID}:${message.ThreadID ?? message.MessageID}`;
    }

    private async executeAgentAndRespond(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[],
        multiAgentNote: string | null
    ): Promise<void> {
        // Look up existing MJ Conversation for this thread
        const threadKey = this.getThreadKey(message);
        const existingConversationId = this.threadConversationMap.get(threadKey);

        let agentResult: ConversationAgentResult;
        try {
            agentResult = await this.runAgentWithStreaming(
                message, agent, contextUser, conversationMessages, existingConversationId
            );
        } catch (error) {
            // runAgentWithStreaming already sent an error message to the user
            LogError('executeAgentAndRespond caught error from runAgentWithStreaming:', undefined, error);
            return;
        }

        const { result, artifactId, conversationId } = agentResult;

        // Store the conversation ID for future messages in this thread
        if (conversationId) {
            this.threadConversationMap.set(threadKey, conversationId);
        }

        // Check for delegation: payload.invokeAgent indicates the agent wants to hand off
        const delegationTarget = this.detectDelegation(result);
        if (delegationTarget) {
            await this.handleDelegation(
                message, agent, result, delegationTarget,
                contextUser, conversationMessages, multiAgentNote,
                0, conversationId
            );
            return;
        }

        // Log diagnostic info when no delegation detected (helps debug routing issues)
        if (result.success && result.agentRun?.FinalStep === 'Success') {
            const payloadKeys = result.payload != null && typeof result.payload === 'object'
                ? Object.keys(result.payload as Record<string, unknown>).join(', ')
                : '(no payload)';
            LogStatus(`No delegation detected. Agent='${agent.Name}', FinalStep='${result.agentRun.FinalStep}', payloadKeys=[${payloadKeys}]`);
        }

        // No delegation — send the result directly
        const metadata: AgentResponseMetadata = { ArtifactId: artifactId, ConversationId: conversationId };
        await this.sendAgentResult(message, agent, result, multiAgentNote, metadata);
    }

    /**
     * Run an agent within a conversation context, with streaming progress updates.
     *
     * Uses `AgentRunner.RunAgentInConversation()` so that:
     * - An MJ Conversation is created (or reused) for the interaction
     * - Artifacts are automatically created from the agent's payload
     * - The artifact ID is returned for deep-linking into MJ Explorer
     *
     * @returns The agent result plus conversation/artifact metadata.
     */
    private async runAgentWithStreaming(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[],
        conversationId?: string
    ): Promise<ConversationAgentResult> {
        const runner = new AgentRunner();
        let streamBuffer = '';
        let lastUpdateTime = 0;
        const updateInterval = this.settings.StreamingUpdateIntervalMs ?? 1000;
        const agentName = agent.Name ?? 'Agent';

        // Send initial "thinking" message with agent name
        const thinkingText = `_${agentName} is thinking..._`;
        let progressMessageId: string | null = await this.sendOrUpdateStreamingMessage(
            message, thinkingText, null, agent
        );
        lastUpdateTime = Date.now();

        const params: ExecuteAgentParams = {
            agent,
            conversationMessages,
            contextUser,
            payload: {}, // Provide empty starting payload so loop agents can apply payloadChangeRequests
            onProgress: (progress) => {
                if (progress.displayMode === 'historical') return;

                const stepCount = (progress.metadata?.stepCount as number) ?? undefined;
                const stepNumber = (progress.metadata?.stepNumber as number) ?? undefined;
                const stepSuffix = stepNumber != null && stepCount != null
                    ? ` (Step ${stepNumber} of ${stepCount})`
                    : '';
                const progressLabel = `_${progress.message}${stepSuffix}_`;

                if (!streamBuffer) {
                    const now = Date.now();
                    if (now - lastUpdateTime >= updateInterval) {
                        lastUpdateTime = now;
                        this.sendOrUpdateStreamingMessage(
                            message, progressLabel, progressMessageId, agent
                        ).then(msgId => {
                            progressMessageId = msgId;
                        }).catch((err) => {
                            LogError('Progress update failed:', undefined, err);
                        });
                    }
                }
            },
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

        // Extract the user's message text (last user message in the conversation)
        const userMessageText = this.stripBotMention(message.Text);

        try {
            const conversationResult = await runner.RunAgentInConversation(params, {
                conversationId,
                userMessage: userMessageText,
                createArtifacts: true,
                conversationName: `${this.PlatformName}: ${userMessageText.substring(0, 80)}`,
            });

            const artifactId = conversationResult.artifactInfo?.artifactId;

            return {
                result: conversationResult.agentResult,
                artifactId,
                conversationId: conversationResult.conversationId,
            };
        } catch (error) {
            LogError('Error running agent for messaging adapter:', undefined, error);
            // Send error message using the progress message if available
            const errorMessage = "I'm sorry, I encountered an error processing your request. Please try again.";
            const errorFormatted = await this.formatResponse(null, agent, errorMessage);
            if (progressMessageId) {
                await this.updateFinalMessage(message, progressMessageId, errorFormatted);
            } else {
                await this.sendFinalMessage(message, errorFormatted);
            }
            throw error;
        }
    }

    /**
     * Detect if an agent result contains a delegation request.
     *
     * Three detection strategies, tried in order:
     * 1. `payload.invokeAgent` — formal delegation field (same as MJ Explorer)
     * 2. `agentRun.FinalPayload` — serialized payload fallback (in case in-memory payload is empty)
     * 3. Message text pattern matching — detects "I'll have the {Agent Name}..." phrasing
     *    when the agent describes delegation intent without formally setting the payload
     *
     * @returns The target agent name, or null if no delegation.
     */
    private detectDelegation(result: ExecuteAgentResult): string | null {
        if (!result.success) return null;

        // Strategy 1: Check in-memory payload.invokeAgent (primary, matches MJ Explorer)
        const fromPayload = this.extractInvokeAgentFromPayload(result.payload);
        if (fromPayload) {
            LogStatus(`Delegation detected via payload.invokeAgent: '${fromPayload}'`);
            return fromPayload;
        }

        // Strategy 2: Check FinalPayload (serialized string on agentRun)
        const fromFinalPayload = this.extractInvokeAgentFromFinalPayload(result.agentRun);
        if (fromFinalPayload) {
            LogStatus(`Delegation detected via FinalPayload: '${fromFinalPayload}'`);
            return fromFinalPayload;
        }

        // Strategy 3: Detect delegation intent from message text
        // Handles cases where the agent says "I'll have the Marketing Agent..." without
        // setting payload.invokeAgent (common when conversation context is less structured)
        const fromMessage = this.extractDelegationFromMessage(result.agentRun?.Message);
        if (fromMessage) {
            LogStatus(`Delegation detected via message text: '${fromMessage}'`);
            return fromMessage;
        }

        return null;
    }

    /**
     * Extract `invokeAgent` from the in-memory payload object.
     */
    private extractInvokeAgentFromPayload(payload: unknown): string | null {
        if (payload == null || typeof payload !== 'object') return null;
        const obj = payload as Record<string, unknown>;
        if (typeof obj.invokeAgent === 'string' && obj.invokeAgent.trim()) {
            return obj.invokeAgent.trim();
        }
        return null;
    }

    /**
     * Extract `invokeAgent` from the serialized FinalPayload string on the agentRun.
     * Fallback for cases where the in-memory payload is empty but FinalPayload was persisted.
     */
    private extractInvokeAgentFromFinalPayload(agentRun: ExecuteAgentResult['agentRun']): string | null {
        const fpStr = agentRun?.FinalPayload;
        if (!fpStr || typeof fpStr !== 'string') return null;
        try {
            const parsed = JSON.parse(fpStr);
            if (parsed != null && typeof parsed === 'object' && typeof parsed.invokeAgent === 'string') {
                return parsed.invokeAgent.trim() || null;
            }
        } catch {
            // Not valid JSON — ignore
        }
        return null;
    }

    /**
     * Detect delegation intent from the agent's message text.
     *
     * Matches patterns like:
     * - "I'll have the Marketing Agent write..."
     * - "I'll delegate to the Research Agent..."
     * - "Routing to Marketing Agent"
     * - "Let me have the Codesmith Agent handle this"
     *
     * Only matches against known agent names from `availableAgents` to avoid false positives.
     */
    private extractDelegationFromMessage(message: string | null | undefined): string | null {
        if (!message || typeof message !== 'string') return null;

        const lowerMessage = message.toLowerCase();

        // Quick gate: must contain a delegation-intent phrase
        const delegationPhrases = [
            "i'll have the", "i'll delegate to", "i will have the", "i will delegate to",
            "routing to", "delegating to", "let me have the", "i'll ask the",
            "i will ask the", "handing off to", "passing to", "let me route to",
            "i'll get the", "i will get the", "i'll invoke the", "i will invoke the"
        ];
        const hasDelegationPhrase = delegationPhrases.some(phrase => lowerMessage.includes(phrase));
        if (!hasDelegationPhrase) return null;

        // Check if any known agent name appears in the message
        // availableAgents is sorted longest-first, so we'll match the most specific name
        for (const agent of this.availableAgents) {
            const agentName = agent.Name;
            if (!agentName) continue;
            if (lowerMessage.includes(agentName.toLowerCase())) {
                return agentName;
            }
        }

        return null;
    }

    /**
     * Handle agent delegation: send a delegation note, then auto-execute the target agent.
     *
     * Mirrors MJ Explorer's `handleSubAgentInvocation()`:
     * 1. Show the delegating agent's message (e.g., "Delegating to Marketing Agent")
     * 2. Find the target agent in availableAgents
     * 3. Execute the target agent with the same conversation context
     * 4. Send the target agent's result
     *
     * Supports chained delegation up to MAX_DELEGATION_HOPS.
     */
    private async handleDelegation(
        message: IncomingMessage,
        sourceAgent: MJAIAgentEntityExtended,
        sourceResult: ExecuteAgentResult,
        targetAgentName: string,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[],
        multiAgentNote: string | null,
        hopCount: number = 0,
        conversationId?: string
    ): Promise<void> {
        // Prevent infinite delegation loops
        if (hopCount >= BaseMessagingAdapter.MAX_DELEGATION_HOPS) {
            LogError(`Delegation loop detected: exceeded ${BaseMessagingAdapter.MAX_DELEGATION_HOPS} hops`);
            await this.sendAgentResult(message, sourceAgent, sourceResult, multiAgentNote);
            return;
        }

        // Find the target agent
        const targetAgent = this.availableAgents.find(
            a => a.Name != null && a.Name.toLowerCase() === targetAgentName.toLowerCase()
        );
        if (!targetAgent) {
            LogError(`Delegation target '${targetAgentName}' not found in available agents`);
            await this.sendAgentResult(message, sourceAgent, sourceResult, multiAgentNote);
            return;
        }

        // Send the delegating agent's message as a brief note
        const sourceMessage = sourceResult.agentRun?.Message;
        const delegationNote = sourceMessage && typeof sourceMessage === 'string' && sourceMessage.trim()
            ? sourceMessage
            : `_Delegating to ${targetAgent.Name}..._`;

        const delegationFormatted = await this.formatResponse(sourceResult, sourceAgent, delegationNote);
        await this.sendFinalMessage(message, delegationFormatted);

        LogStatus(`Delegation: ${sourceAgent.Name} → ${targetAgent.Name} (hop ${hopCount + 1})`);

        // Build conversation context including the delegation payload
        const updatedMessages = [...conversationMessages];
        const delegationPayload = sourceResult.payload as Record<string, unknown> | undefined;
        if (delegationPayload?.inputPayload != null) {
            // Pass the source agent's input payload as context for the target agent
            updatedMessages.push({
                role: 'assistant',
                content: typeof delegationPayload.inputPayload === 'string'
                    ? delegationPayload.inputPayload
                    : JSON.stringify(delegationPayload.inputPayload)
            });
        }

        // Execute the target agent (reuse the same MJ Conversation for continuity)
        try {
            const targetAgentResult = await this.runAgentWithStreaming(
                message, targetAgent, contextUser, updatedMessages, conversationId
            );

            // Check if the target agent also delegates
            const nextDelegation = this.detectDelegation(targetAgentResult.result);
            if (nextDelegation) {
                await this.handleDelegation(
                    message, targetAgent, targetAgentResult.result, nextDelegation,
                    contextUser, updatedMessages, null, hopCount + 1,
                    targetAgentResult.conversationId ?? conversationId
                );
                return;
            }

            // Send the target agent's result
            const metadata: AgentResponseMetadata = {
                ArtifactId: targetAgentResult.artifactId,
                ConversationId: targetAgentResult.conversationId ?? conversationId,
            };
            await this.sendAgentResult(message, targetAgent, targetAgentResult.result, null, metadata);
        } catch (error) {
            // runAgentWithStreaming already sent an error message
            LogError(`Delegation target '${targetAgent.Name}' failed:`, undefined, error);
        }
    }

    /**
     * Extract response text, format it, and send the final message.
     */
    private async sendAgentResult(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        result: ExecuteAgentResult,
        multiAgentNote: string | null,
        metadata?: AgentResponseMetadata
    ): Promise<void> {
        const responseText = this.extractResponseText(result);
        const fullResponse = multiAgentNote
            ? multiAgentNote + '\n\n' + responseText
            : responseText;

        const formatted = await this.formatResponse(result, agent, fullResponse, metadata);
        await this.sendFinalMessage(message, formatted);
    }

    /**
     * Extract the user-facing response text from an `ExecuteAgentResult`.
     *
     * Mirrors MJ Explorer's approach: the data model itself tells us what's user-facing.
     * `agentRun.Message` is the field agents explicitly set for the user. Everything
     * else (payload, FinalPayload, step outputs) is internal agent state.
     *
     * We do NOT mine payloads for content — that approach requires hardcoding
     * agent-specific payload shapes and inevitably leaks internal LLM state
     * (research plans, orchestration metadata, etc.) to the user.
     *
     * Fallback chain (only when Message is absent):
     * 1. `agentRun.Message` — the primary human-readable field
     * 2. `agentRun.Result` — simple string result (not parsed as JSON)
     * 3. Generic fallback message
     */
    private extractResponseText(result: ExecuteAgentResult): string {
        if (!result.success) {
            return this.extractErrorText(result);
        }

        // Primary: agentRun.Message — the explicit user-facing field
        const message = result.agentRun?.Message;
        if (message && typeof message === 'string' && message.trim()) {
            return message;
        }

        // Fallback: agentRun.Result as a simple string
        const runResult = result.agentRun?.Result;
        if (runResult && typeof runResult === 'string' && runResult.trim()) {
            return runResult;
        }

        return "I processed your request but have no response to show.";
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
