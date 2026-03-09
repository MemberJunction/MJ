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

/** Fields that are unlikely to contain user-facing document content. O(1) lookup. */
const NON_CONTENT_FIELDS = new Set([
    'id', 'ID', 'uuid', 'status', 'type', 'step', 'nextStep',
    'createdAt', 'updatedAt', 'timestamp', 'metadata',
    'subAgentResult', 'payloadChangeResult', 'shouldTerminate',
    'terminateAfter', 'iterationNumber', 'number',
    'taskGraph', 'actionResult', 'resultCode', 'allMatches',
    'similarityScore', 'systemPrompt', 'matchCount',
]);

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

    /** Maximum number of delegation hops to prevent infinite loops. */
    private static readonly MAX_DELEGATION_HOPS = 3;

    /**
     * Execute the agent and send the response, with streaming support.
     * Handles delegation automatically: when the agent returns `payload.invokeAgent`,
     * the target agent is auto-executed (matching MJ Explorer behavior).
     */
    private async executeAgentAndRespond(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[],
        multiAgentNote: string | null
    ): Promise<void> {
        let result: ExecuteAgentResult;
        try {
            result = await this.runAgentWithStreaming(message, agent, contextUser, conversationMessages);
        } catch (error) {
            // runAgentWithStreaming already sent an error message to the user
            LogError('executeAgentAndRespond caught error from runAgentWithStreaming:', undefined, error);
            return;
        }

        // Check for delegation: payload.invokeAgent indicates the agent wants to hand off
        const delegationTarget = this.detectDelegation(result);
        if (delegationTarget) {
            await this.handleDelegation(
                message, agent, result, delegationTarget,
                contextUser, conversationMessages, multiAgentNote
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
        await this.sendAgentResult(message, agent, result, multiAgentNote);
    }

    /**
     * Run an agent with streaming progress updates.
     * Returns the raw ExecuteAgentResult for further processing.
     */
    private async runAgentWithStreaming(
        message: IncomingMessage,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        conversationMessages: ChatMessage[]
    ): Promise<ExecuteAgentResult> {
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

        try {
            return await runner.RunAgent(params);
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
        hopCount: number = 0
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

        // Execute the target agent
        try {
            const targetResult = await this.runAgentWithStreaming(
                message, targetAgent, contextUser, updatedMessages
            );

            // Check if the target agent also delegates
            const nextDelegation = this.detectDelegation(targetResult);
            if (nextDelegation) {
                await this.handleDelegation(
                    message, targetAgent, targetResult, nextDelegation,
                    contextUser, updatedMessages, null, hopCount + 1
                );
                return;
            }

            // Send the target agent's result
            await this.sendAgentResult(message, targetAgent, targetResult, null);
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
        multiAgentNote: string | null
    ): Promise<void> {
        const responseText = this.extractResponseText(result);
        const fullResponse = multiAgentNote
            ? multiAgentNote + '\n\n' + responseText
            : responseText;

        const formatted = await this.formatResponse(result, agent, fullResponse);
        await this.sendFinalMessage(message, formatted);
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
     * Check if a message looks like a brief summary rather than the actual response,
     * AND the richer content looks like genuine prose (not JSON/metadata).
     *
     * This covers the case where an agent sets Message to a status line but the real
     * content is in the payload (e.g., Marketing Agent: "Your blog post is finalized"
     * but the actual blog text is in FinalPayload).
     *
     * IMPORTANT: Only appends if the richer content is human-readable prose.
     * JSON blobs, structured metadata, and serialized data are NEVER appended.
     */
    private isDelegationNote(message: string, richerContent: string): boolean {
        const messageLen = message.trim().length;
        const richLen = richerContent.trim().length;
        // Message must be short AND payload must have significantly more content
        if (messageLen >= 300 || richLen <= messageLen * 1.5) return false;
        // Richer content must look like actual prose, not JSON/metadata
        if (!this.looksLikeProseContent(richerContent)) return false;
        return true;
    }

    /**
     * Check if text looks like human-readable prose content (a blog post, report, etc.)
     * vs. structured data (JSON, metadata, code).
     */
    private looksLikeProseContent(text: string): boolean {
        const trimmed = text.trim();
        // JSON-like content is not prose
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) return false;
        // Contains many JSON key-value patterns → structured data
        const jsonPatternCount = (trimmed.match(/"[\w]+"\s*:/g) ?? []).length;
        if (jsonPatternCount > 3) return false;
        // Contains orchestration markers → internal metadata
        if (this.isOrchestrationMetadata(trimmed)) return false;
        // Must have meaningful word content (not just symbols/IDs)
        const wordCount = trimmed.split(/\s+/).filter(w => /[a-zA-Z]{2,}/.test(w)).length;
        return wordCount >= 10;
    }

    /**
     * Try to extract richer human-readable content from the payload sources.
     * Used to detect when agentRun.Message is just a delegation note.
     */
    private extractRicherContent(result: ExecuteAgentResult): string | null {
        // Collect all candidate content and return the richest (longest) one.
        // This prevents short status strings from winning over full document content.
        let bestContent: string | null = null;
        let bestLength = 0;

        const consider = (text: string | null): void => {
            if (text && text.trim().length > bestLength) {
                bestLength = text.trim().length;
                bestContent = text;
            }
        };

        // Try FinalPayload (merged payload from sub-agent execution)
        const finalPayload = result.agentRun?.FinalPayload;
        if (finalPayload) {
            consider(this.extractHumanContentFromPayload(finalPayload));
        }

        // Try in-memory payload
        if (result.payload != null) {
            if (typeof result.payload === 'string' && result.payload.trim()) {
                consider(result.payload);
            } else if (typeof result.payload === 'object' && result.payload !== null) {
                consider(this.extractHumanTextFromObject(result.payload as Record<string, unknown>));
            }
        }

        // Try agentRun.Result
        const runResult = result.agentRun?.Result;
        if (runResult) {
            const parsed = this.parseOutputData(runResult);
            if (parsed && !this.isOrchestrationMetadata(parsed)) {
                consider(parsed);
            }
        }

        // Try step outputs — the real content might be in an earlier step
        const stepContent = this.extractFromStepOutputs(result);
        if (stepContent) {
            consider(stepContent);
        }

        return bestContent;
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
     *
     * Searches backwards from the last step, but also tracks the LONGEST
     * non-orchestration output found across all steps. This ensures that
     * a substantial output (like a full blog post in step 7) isn't overshadowed
     * by a short status message in step 10.
     */
    private extractFromStepOutputs(result: ExecuteAgentResult): string | null {
        const steps = result.agentRun?.Steps ?? [];
        let bestOutput: string | null = null;
        let bestLength = 0;

        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (!step.OutputData) continue;

            const parsed = this.parseOutputData(step.OutputData);
            if (parsed && !this.isOrchestrationMetadata(parsed)) {
                // Track the longest output — agent steps often end with a short
                // status message while the real content was generated in an earlier step
                if (parsed.length > bestLength) {
                    bestLength = parsed.length;
                    bestOutput = parsed;
                }
            }
        }
        return bestOutput;
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
            '"step":"Sub-Agent"',
            '"step": "Sub-Agent"',
            '"subAgent"',
            '"terminateAfter"',
            '"taskGraph"',
            '"actionResult"',
            '"resultCode"',
            '"similarityScore"',
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
            // Delegation pattern: { nextStep: { subAgent: { name: "..." } } }
            // The parent agent delegates to a sub-agent — show a brief note.
            // Do NOT show subAgent.message — it's the internal prompt to the sub-agent.
            if (nextStep.subAgent != null && typeof nextStep.subAgent === 'object') {
                const subAgent = nextStep.subAgent as Record<string, unknown>;
                const subAgentName = subAgent.name as string | undefined;
                if (subAgentName) {
                    return `_Delegating to ${subAgentName}..._`;
                }
            }
        }

        // Direct text fields: message, output, result, summary
        const directField = this.tryStringFields(obj, ['message', 'output', 'result', 'summary']);
        if (directField) return directField;

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
        const directField = this.tryStringFields(obj, ['summary', 'message', 'output', 'result', 'content', 'text', 'report']);
        if (directField) return directField;

        // Check nested objects for common patterns
        const nestedFields = ['data', 'response', 'payload', 'results'];
        for (const field of nestedFields) {
            if (obj[field] != null && typeof obj[field] === 'object') {
                const nested = this.extractHumanTextFromObject(obj[field] as Record<string, unknown>);
                if (nested) return nested;
            }
        }

        // Deep search: walk ALL fields looking for substantial text content.
        // This catches agent-specific payload shapes (e.g., Marketing Agent's blogPost.content,
        // campaign.deliverables, etc.) that don't match our known field patterns.
        const deepText = this.findDeepTextContent(obj, 3);
        if (deepText) return deepText;

        return null;
    }

    /**
     * Walk an object tree looking for the longest substantial text field.
     *
     * Used as a fallback when structured pattern matching fails.
     * Finds text content buried under arbitrary agent-specific field names
     * (e.g., blogPost.content, campaign.body, deliverables.text).
     *
     * @param obj - Object to search.
     * @param maxDepth - Maximum recursion depth to prevent runaway traversal.
     * @returns The longest text value found that looks like document content, or null.
     */
    private findDeepTextContent(obj: Record<string, unknown>, maxDepth: number): string | null {
        if (maxDepth <= 0) return null;

        let bestText: string | null = null;
        let bestLength = 0;

        // Minimum length to be considered "substantial" content (not a label or ID)
        const MIN_CONTENT_LENGTH = 100;

        for (const [key, value] of Object.entries(obj)) {
            // Skip known non-content fields
            if (this.isNonContentField(key)) continue;

            if (typeof value === 'string' && value.trim().length > MIN_CONTENT_LENGTH) {
                // Skip strings that are serialized JSON — they're structured data, not prose
                const trimmedVal = value.trim();
                const isSerializedJson = (trimmedVal.startsWith('{') || trimmedVal.startsWith('[')) && trimmedVal.length > 200;
                if (!isSerializedJson && value.length > bestLength) {
                    bestLength = value.length;
                    bestText = value;
                }
            } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
                const nested = this.findDeepTextContent(value as Record<string, unknown>, maxDepth - 1);
                if (nested && nested.length > bestLength) {
                    bestLength = nested.length;
                    bestText = nested;
                }
            } else if (Array.isArray(value) && value.length > 0) {
                // Check arrays of objects (e.g., deliverables: [{ content: "..." }])
                for (const item of value) {
                    if (item != null && typeof item === 'object' && !Array.isArray(item)) {
                        const nested = this.findDeepTextContent(item as Record<string, unknown>, maxDepth - 1);
                        if (nested && nested.length > bestLength) {
                            bestLength = nested.length;
                            bestText = nested;
                        }
                    }
                }
            }
        }

        return bestText;
    }

    /**
     * Check if a field name is unlikely to contain user-facing document content.
     */
    private isNonContentField(key: string): boolean {
        return NON_CONTENT_FIELDS.has(key);
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
     * Check multiple field names on an object, returning the first non-empty string value found.
     */
    private tryStringFields(obj: Record<string, unknown>, fieldNames: string[]): string | null {
        for (const field of fieldNames) {
            if (typeof obj[field] === 'string' && (obj[field] as string).trim()) {
                return obj[field] as string;
            }
        }
        return null;
    }

    /**
     * Check if an object looks like orchestration/control metadata.
     */
    private looksLikeOrchestrationObject(obj: Record<string, unknown>): boolean {
        const orchestrationKeys = ['subAgentResult', 'payloadChangeResult', 'shouldTerminate', 'taskGraph', 'actionResult'];
        if (orchestrationKeys.some(key => key in obj)) return true;

        // nextStep with subAgent or step type is orchestration control flow
        if (obj.nextStep != null && typeof obj.nextStep === 'object') {
            const nextStep = obj.nextStep as Record<string, unknown>;
            if (nextStep.subAgent != null || nextStep.step === 'Sub-Agent' || nextStep.terminate === true) {
                return true;
            }
        }
        return false;
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
