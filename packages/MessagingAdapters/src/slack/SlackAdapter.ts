/**
 * @module @memberjunction/messaging-adapters
 * @description Slack-specific messaging adapter implementation.
 *
 * Extends `BaseMessagingAdapter` with Slack API calls for:
 * - Posting and updating messages via the Web API with per-agent identity
 * - Fetching thread history via `conversations.replies`
 * - Rich Block Kit formatting with agent context, artifact cards, and metadata
 * - Multi-word agent name matching via known-name lookup
 * - Looking up user email addresses
 * - Stripping bot @mentions from message text
 */

import { WebClient, type KnownBlock } from '@slack/web-api';
import { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings } from '../base/types.js';
import { buildRichResponse, buildErrorBlocks, buildAgentContextBlock, buildDivider } from './slack-block-builder.js';
import { markdownToBlocks } from './slack-formatter.js';

/**
 * Slack-specific adapter that implements all platform operations
 * using the Slack Web API (`@slack/web-api`).
 *
 * ## Features
 * - Per-agent identity: each agent's name and avatar appear on their messages
 * - Thread-based conversation context via `conversations.replies`
 * - Progressive streaming updates via `chat.postMessage` / `chat.update`
 * - Rich Block Kit formatting with agent headers, artifact cards, and metadata
 * - Multi-word agent name matching (e.g., `@Research Agent`)
 * - User email lookup via `users.info` for MJ user mapping
 * - Bot mention stripping for clean agent input
 *
 * ## Authentication
 * Requires a Bot User OAuth Token (`xoxb-...`) with these scopes:
 * - `chat:write` — Post and update messages
 * - `chat:write.customize` — Post with custom username and icon
 * - `channels:history` / `groups:history` / `im:history` — Read thread history
 * - `users:read` / `users:read.email` — Look up user email addresses
 * - `app_mentions:read` — Receive @mention events
 */
export class SlackAdapter extends BaseMessagingAdapter {
    /** Slack Web API client. */
    private client: WebClient;

    /** The bot's own Slack user ID (e.g., `U0123456`). */
    private botUserID: string = '';

    /** Message ID of the "Thinking..." indicator, reused by the first streaming update. */
    private thinkingMessageId: string | null = null;

    /**
     * Slack's maximum message text length. Messages exceeding this cause `msg_too_long`.
     * The `text` field is the plain-text fallback when blocks are present; the rich
     * content is in Block Kit blocks (already limited to 50 blocks with "View Full" button).
     */
    private static readonly MAX_TEXT_LENGTH = 39_000;

    constructor(settings: MessagingAdapterSettings) {
        super(settings);
        this.client = new WebClient(settings.BotToken);
    }

    /**
     * Convert a raw Slack event payload into a normalized `IncomingMessage`.
     *
     * Called by `SlackMessagingExtension` when a webhook event is received.
     * Uses multi-word agent name matching against the loaded agent list.
     *
     * @param event - Raw Slack event object from the Events API.
     * @returns Normalized incoming message.
     */
    public MapSlackEvent(event: Record<string, unknown>): IncomingMessage {
        const text = (event.text as string) ?? '';
        return {
            MessageID: event.ts as string,
            Text: text,
            SenderID: (event.user as string) ?? (event.bot_id as string) ?? '',
            SenderName: (event.username as string) ?? '',
            ChannelID: event.channel as string,
            ThreadID: (event.thread_ts as string) ?? null,
            IsDirectMessage: event.channel_type === 'im',
            IsBotMention: event.type === 'app_mention',
            MentionedAgentNames: this.matchAgentMentions(text),
            Timestamp: new Date(parseFloat(event.ts as string) * 1000),
            RawEvent: event
        };
    }

    /**
     * Fetch the bot's own user ID from the Slack API.
     * This is needed to identify bot messages in thread history.
     */
    protected async onInitialize(): Promise<void> {
        const authResult = await this.client.auth.test();
        this.botUserID = authResult.user_id as string;
    }

    protected getBotUserId(): string {
        return this.botUserID;
    }

    /**
     * Post a "Thinking..." message as the typing indicator.
     * Shows the agent's identity if available. This message gets replaced
     * in-place by the first streaming update.
     */
    protected async showTypingIndicator(message: IncomingMessage, agent?: MJAIAgentEntityExtended): Promise<void> {
        const threadTs = message.ThreadID ?? message.MessageID;
        const identityParams = agent ? this.buildSlackIdentityParams(agent) : {};

        const result = await this.client.chat.postMessage({
            channel: message.ChannelID,
            thread_ts: threadTs,
            text: '_Thinking..._',
            ...identityParams
        });
        this.thinkingMessageId = result.ts ?? null;
    }

    /**
     * Fetch all messages in a Slack thread using `conversations.replies`.
     */
    protected async fetchThreadHistory(channelId: string, threadId: string): Promise<IncomingMessage[]> {
        const result = await this.client.conversations.replies({
            channel: channelId,
            ts: threadId,
            limit: this.settings.MaxThreadMessages ?? 50
        });

        return (result.messages ?? []).map(msg => ({
            MessageID: msg.ts!,
            Text: msg.text ?? '',
            SenderID: msg.user ?? (msg as Record<string, unknown>).bot_id as string ?? '',
            SenderName: (msg as Record<string, unknown>).username as string ?? '',
            ChannelID: channelId,
            ThreadID: threadId,
            IsDirectMessage: false,
            IsBotMention: false,
            Timestamp: new Date(parseFloat(msg.ts!) * 1000),
            RawEvent: msg as Record<string, unknown>
        }));
    }

    /**
     * Post a new streaming message or update an existing one.
     * Shows the agent's identity on new messages.
     */
    protected async sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null,
        agent?: MJAIAgentEntityExtended
    ): Promise<string> {
        // Reuse the "Thinking..." message for the first streaming update
        const messageToUpdate = existingMessageId ?? this.thinkingMessageId;

        if (messageToUpdate) {
            this.thinkingMessageId = null; // Consumed
            await this.client.chat.update({
                channel: originalMessage.ChannelID,
                ts: messageToUpdate,
                text: this.truncateForSlack(currentContent + ' ...')
            });
            return messageToUpdate;
        } else {
            const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;
            const identityParams = agent ? this.buildSlackIdentityParams(agent) : {};

            const result = await this.client.chat.postMessage({
                channel: originalMessage.ChannelID,
                thread_ts: threadTs,
                text: this.truncateForSlack(currentContent + ' ...'),
                ...identityParams
            });
            return result.ts!;
        }
    }

    /**
     * Send the final formatted response. If a "Thinking..." message exists
     * (no streaming occurred), update it in-place instead of posting a new message.
     */
    protected async sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        if (this.thinkingMessageId) {
            await this.updateFinalMessage(originalMessage, this.thinkingMessageId, response);
            this.thinkingMessageId = null;
            return;
        }
        const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;
        const identityParams = response.AgentIdentity
            ? this.buildSlackIdentityParamsFromIdentity(response.AgentIdentity)
            : {};

        await this.client.chat.postMessage({
            channel: originalMessage.ChannelID,
            thread_ts: threadTs,
            text: this.truncateForSlackFallback(response.PlainText),
            blocks: response.RichPayload.blocks as KnownBlock[],
            ...identityParams
        });
    }

    /**
     * Update the streaming progress message with the final formatted response.
     */
    protected async updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        await this.client.chat.update({
            channel: originalMessage.ChannelID,
            ts: messageId,
            text: this.truncateForSlackFallback(response.PlainText),
            blocks: response.RichPayload.blocks as KnownBlock[]
        });
    }

    /**
     * Format agent response as rich Slack Block Kit blocks.
     *
     * When a full `ExecuteAgentResult` is available, builds a rich layout with
     * agent header, artifact cards, action buttons, and metadata footer.
     * Falls back to simple markdown→blocks conversion for plain text.
     */
    protected async formatResponse(
        result: ExecuteAgentResult | null,
        agent: MJAIAgentEntityExtended,
        responseText: string
    ): Promise<FormattedResponse> {
        const identity = this.buildAgentIdentity(agent);

        // Build rich Block Kit layout
        const blocks = buildRichResponse(result, agent, responseText);

        return {
            PlainText: responseText,
            RichPayload: { blocks },
            AgentIdentity: identity
        };
    }

    /**
     * Strip the bot's @mention from the message text.
     * Slack @mentions use the format `<@U0123456>`.
     */
    protected stripBotMention(text: string): string {
        return text.replace(new RegExp(`<@${this.botUserID}>`, 'g'), '').trim();
    }

    /**
     * Look up a Slack user's email address via the Web API.
     *
     * Requires the `users:read.email` scope on the bot token.
     *
     * @param platformUserId - Slack user ID (e.g., `U0123456`).
     * @returns Email address, or `null` if not available.
     */
    protected async lookupUserEmail(platformUserId: string): Promise<string | null> {
        try {
            const result = await this.client.users.info({ user: platformUserId });
            return result.user?.profile?.email ?? null;
        } catch {
            return null;
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────

    /**
     * Truncate text to Slack's message length limit.
     * Appends an ellipsis note if truncated so users know content was cut.
     */
    private truncateForSlack(text: string): string {
        if (text.length <= SlackAdapter.MAX_TEXT_LENGTH) return text;
        return text.slice(0, SlackAdapter.MAX_TEXT_LENGTH - 50) + '\n\n... (message truncated due to length)';
    }

    /**
     * Truncate text for use as the `text` fallback when Block Kit blocks are present.
     * The `text` field is only shown in notifications/accessibility — the blocks contain
     * the rich content. Keeping it short avoids `msg_too_long` when blocks are large.
     */
    private truncateForSlackFallback(text: string): string {
        const MAX_FALLBACK = 4000;
        if (text.length <= MAX_FALLBACK) return text;
        return text.slice(0, MAX_FALLBACK - 30) + '\n\n(See full response above)';
    }

    /**
     * Build Slack API params for per-agent identity.
     * Uses `username` and `icon_url` which require the `chat:write.customize` scope.
     * Only includes `icon_url` if it's a valid HTTPS URL.
     */
    private buildIdentityParams(name?: string | null, iconUrl?: string | null): Record<string, string> {
        const params: Record<string, string> = {};
        if (name) params.username = name;
        if (iconUrl && typeof iconUrl === 'string' && iconUrl.startsWith('https://')) {
            params.icon_url = iconUrl;
        }
        return params;
    }

    /** Build identity params from an agent entity. */
    private buildSlackIdentityParams(agent: MJAIAgentEntityExtended): Record<string, string> {
        return this.buildIdentityParams(agent.Name, agent.LogoURL);
    }

    /** Build identity params from an AgentIdentity object. */
    private buildSlackIdentityParamsFromIdentity(identity: { Name: string; IconURL?: string }): Record<string, string> {
        return this.buildIdentityParams(identity.Name, identity.IconURL);
    }
}
