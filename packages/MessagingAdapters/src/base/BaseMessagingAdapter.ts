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
import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    MessagingAdapterSettings,
    IncomingMessage,
    FormattedResponse,
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
 * ## User Identity Mapping
 *
 * The adapter resolves the platform user's email to an MJ `UserInfo` record.
 * This gives proper per-user permission scoping without a separate auth flow.
 * Falls back to the configured service account email if no MJ user matches.
 */
export abstract class BaseMessagingAdapter {
    /** Extension settings from `mj.config.cjs`. */
    protected Settings: MessagingAdapterSettings;

    /** Fallback context user (service account) loaded from config email. */
    protected FallbackContextUser: UserInfo | null = null;

    /** Default agent loaded from config AgentID. */
    protected DefaultAgent: MJAIAgentEntityExtended | null = null;

    constructor(settings: MessagingAdapterSettings) {
        this.Settings = settings;
    }

    /**
     * Initialize the adapter: load the default MJ agent and resolve the fallback context user.
     * Must be called before handling any messages.
     *
     * @throws Error if the configured agent or fallback user cannot be found.
     */
    public async Initialize(): Promise<void> {
        await this.loadDefaultAgent();
        await this.loadFallbackContextUser();
        await this.onInitialize();
        LogStatus(`Messaging adapter initialized: agent='${this.DefaultAgent?.Name}', fallbackUser='${this.Settings.ContextUserEmail}'`);
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
        if (this.Settings.ShowTypingIndicator !== false) {
            await this.safeShowTypingIndicator(message);
        }

        // 4. Determine which agent to use
        const { agent, multiAgentNote } = await this.resolveAgent(message);

        // 5. Fetch thread history and build conversation messages
        const threadHistory = await this.safeGetThreadHistory(message);
        const conversationMessages = this.buildConversationMessages(threadHistory, message);

        // 6. Run the agent with streaming
        await this.executeAgentAndRespond(message, agent, contextUser, conversationMessages, multiAgentNote);
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
     */
    protected abstract showTypingIndicator(message: IncomingMessage): Promise<void>;

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
     * @returns The message ID of the progress message (new or existing).
     */
    protected abstract sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
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
     * Convert Markdown text to the platform's rich format (Block Kit, Adaptive Card, etc.).
     * This includes handling long responses by splitting into multiple blocks/messages.
     */
    protected abstract formatResponse(markdownText: string): Promise<FormattedResponse>;

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
        let email = message.SenderEmail;

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
                u => u.Email?.toLowerCase() === email!.toLowerCase()
            );
            if (mjUser) {
                return mjUser;
            }
        }

        // Fall back to service account
        return this.FallbackContextUser!;
    }

    /**
     * Resolve which agent to use for this message.
     *
     * If the user @mentioned specific agent names, looks them up.
     * If multiple agents are mentioned, uses the first and returns a note.
     * Falls back to the default agent from config.
     */
    protected async resolveAgent(
        message: IncomingMessage
    ): Promise<{ agent: MJAIAgentEntityExtended; multiAgentNote: string | null }> {
        const mentionedNames = message.MentionedAgentNames ?? [];

        if (mentionedNames.length === 0) {
            return { agent: this.DefaultAgent!, multiAgentNote: null };
        }

        // Look up the first mentioned agent
        const firstAgentName = mentionedNames[0];
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'AI Agents',
            ExtraFilter: `Name='${firstAgentName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        });

        if (result.Success && result.Results.length > 0) {
            const agent = result.Results[0];
            let multiAgentNote: string | null = null;

            if (mentionedNames.length > 1) {
                multiAgentNote = `_Note: Only one agent can be addressed per message. Routing to **${agent.Name}**. Other mentioned agents (${mentionedNames.slice(1).join(', ')}) were not invoked._`;
            }

            return { agent, multiAgentNote };
        }

        // Agent not found by name — fall back to default
        LogStatus(`Agent '${firstAgentName}' not found, using default agent`);
        return { agent: this.DefaultAgent!, multiAgentNote: null };
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
        const updateInterval = this.Settings.StreamingUpdateIntervalMs ?? 1000;
        let progressMessageId: string | null = null;

        try {
            const params: ExecuteAgentParams = {
                agent,
                conversationMessages,
                contextUser,
                onStreaming: async (content: string) => {
                    streamBuffer += content;
                    const now = Date.now();
                    if (now - lastUpdateTime >= updateInterval) {
                        lastUpdateTime = now;
                        try {
                            progressMessageId = await this.sendOrUpdateStreamingMessage(
                                message, streamBuffer, progressMessageId
                            );
                        } catch (streamError) {
                            // Silently skip streaming update failures (rate limiting, etc.)
                            // The final message will still be sent
                        }
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
            const formatted = await this.formatResponse(fullResponse);

            if (progressMessageId) {
                await this.updateFinalMessage(message, progressMessageId, formatted);
            } else {
                await this.sendFinalMessage(message, formatted);
            }
        } catch (error) {
            LogError('Error running agent for messaging adapter:', undefined, error);
            const errorMessage = "I'm sorry, I encountered an error processing your request. Please try again.";
            const errorFormatted = await this.formatResponse(errorMessage);

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
     * Looks at the agent run steps (last step with output) and falls back
     * to the payload if no step output is found.
     */
    private extractResponseText(result: ExecuteAgentResult): string {
        if (!result.success) {
            const errorMsg = result.agentRun?.ErrorMessage;
            if (errorMsg) {
                return `I encountered an issue: ${errorMsg}`;
            }
            return "I'm sorry, I encountered an error processing your request. Please try again.";
        }

        // Look for output in run steps (last step with output)
        const steps = result.agentRun?.Steps ?? [];
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step.Output) {
                return step.Output;
            }
        }

        // Fall back to payload
        if (typeof result.payload === 'string') {
            return result.payload;
        }

        if (result.payload != null && typeof result.payload === 'object') {
            return JSON.stringify(result.payload, null, 2);
        }

        return "I processed your request but have no response to show.";
    }

    /**
     * Fetch thread history with error handling. Returns empty array on failure.
     */
    private async safeGetThreadHistory(message: IncomingMessage): Promise<IncomingMessage[]> {
        if (!message.ThreadID) {
            return []; // Top-level message, no prior history
        }
        try {
            const maxMessages = this.Settings.MaxThreadMessages ?? 50;
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
     */
    private async safeShowTypingIndicator(message: IncomingMessage): Promise<void> {
        try {
            await this.showTypingIndicator(message);
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
     * Load the default MJ agent entity from database.
     * @throws Error if the configured agent ID cannot be found.
     */
    private async loadDefaultAgent(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'AI Agents',
            ExtraFilter: `ID='${this.Settings.AgentID}'`,
            ResultType: 'entity_object'
        });
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Default agent not found: ${this.Settings.AgentID}`);
        }
        this.DefaultAgent = result.Results[0];
    }

    /**
     * Resolve the fallback context user from the configured email.
     * @throws Error if the configured email cannot be found.
     */
    private async loadFallbackContextUser(): Promise<void> {
        const userCache = new UserCache();
        const user = userCache.Users.find(
            u => u.Email?.toLowerCase() === this.Settings.ContextUserEmail.toLowerCase()
        );

        if (!user) {
            throw new Error(`Fallback context user not found: ${this.Settings.ContextUserEmail}`);
        }

        this.FallbackContextUser = user;
    }
}
