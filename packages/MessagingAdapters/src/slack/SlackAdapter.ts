/**
 * @module @memberjunction/messaging-adapters
 * @description Slack-specific messaging adapter implementation.
 *
 * Extends `BaseMessagingAdapter` with Slack API calls for:
 * - Posting and updating messages via the Web API
 * - Fetching thread history via `conversations.replies`
 * - Formatting responses as Slack Block Kit blocks
 * - Looking up user email addresses
 * - Stripping bot @mentions from message text
 */

import { WebClient, type KnownBlock } from '@slack/web-api';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings } from '../base/types.js';
import { markdownToBlocks } from './slack-formatter.js';

/**
 * Slack-specific adapter that implements all platform operations
 * using the Slack Web API (`@slack/web-api`).
 *
 * ## Features
 * - Thread-based conversation context via `conversations.replies`
 * - Progressive streaming updates via `chat.postMessage` / `chat.update`
 * - Block Kit rich formatting with auto-splitting for long responses
 * - User email lookup via `users.info` for MJ user mapping
 * - Bot mention stripping for clean agent input
 *
 * ## Authentication
 * Requires a Bot User OAuth Token (`xoxb-...`) with these scopes:
 * - `chat:write` — Post and update messages
 * - `channels:history` / `groups:history` / `im:history` — Read thread history
 * - `users:read` / `users:read.email` — Look up user email addresses
 * - `app_mentions:read` — Receive @mention events
 */
export class SlackAdapter extends BaseMessagingAdapter {
    /** Slack Web API client. */
    private Client: WebClient;

    /** The bot's own Slack user ID (e.g., `U0123456`). */
    private BotUserID: string = '';

    constructor(settings: MessagingAdapterSettings) {
        super(settings);
        this.Client = new WebClient(settings.BotToken);
    }

    /**
     * Convert a raw Slack event payload into a normalized `IncomingMessage`.
     *
     * Called by `SlackMessagingExtension` when a webhook event is received.
     *
     * @param event - Raw Slack event object from the Events API.
     * @returns Normalized incoming message.
     */
    public MapSlackEvent(event: Record<string, unknown>): IncomingMessage {
        return {
            MessageID: event.ts as string,
            Text: (event.text as string) ?? '',
            SenderID: (event.user as string) ?? (event.bot_id as string) ?? '',
            SenderName: (event.username as string) ?? '',
            ChannelID: event.channel as string,
            ThreadID: (event.thread_ts as string) ?? null,
            IsDirectMessage: event.channel_type === 'im',
            IsBotMention: event.type === 'app_mention',
            Timestamp: new Date(parseFloat(event.ts as string) * 1000),
            RawEvent: event
        };
    }

    /**
     * Fetch the bot's own user ID from the Slack API.
     * This is needed to identify bot messages in thread history.
     */
    protected async onInitialize(): Promise<void> {
        const authResult = await this.Client.auth.test();
        this.BotUserID = authResult.user_id as string;
    }

    protected getBotUserId(): string {
        return this.BotUserID;
    }

    /**
     * Slack doesn't have a persistent typing indicator API for bots.
     * The first streaming update serves as the "thinking" indicator.
     */
    protected async showTypingIndicator(_message: IncomingMessage): Promise<void> {
        // No-op: Slack bot typing indicators are not persistent.
        // The first streaming message update acts as the visual indicator.
    }

    /**
     * Fetch all messages in a Slack thread using `conversations.replies`.
     */
    protected async fetchThreadHistory(channelId: string, threadId: string): Promise<IncomingMessage[]> {
        const result = await this.Client.conversations.replies({
            channel: channelId,
            ts: threadId,
            limit: this.Settings.MaxThreadMessages ?? 50
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
     * Posts as a reply in the thread.
     */
    protected async sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
    ): Promise<string> {
        const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;

        if (existingMessageId) {
            await this.Client.chat.update({
                channel: originalMessage.ChannelID,
                ts: existingMessageId,
                text: currentContent + ' ...'
            });
            return existingMessageId;
        } else {
            const result = await this.Client.chat.postMessage({
                channel: originalMessage.ChannelID,
                thread_ts: threadTs,
                text: currentContent + ' ...'
            });
            return result.ts!;
        }
    }

    /**
     * Send the final formatted response as a new message in the thread.
     */
    protected async sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;
        await this.Client.chat.postMessage({
            channel: originalMessage.ChannelID,
            thread_ts: threadTs,
            text: response.PlainText,
            blocks: response.RichPayload.blocks as KnownBlock[]
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
        await this.Client.chat.update({
            channel: originalMessage.ChannelID,
            ts: messageId,
            text: response.PlainText,
            blocks: response.RichPayload.blocks as KnownBlock[]
        });
    }

    /**
     * Format agent response Markdown as Slack Block Kit blocks.
     */
    protected async formatResponse(markdownText: string): Promise<FormattedResponse> {
        return {
            PlainText: markdownText,
            RichPayload: { blocks: markdownToBlocks(markdownText) }
        };
    }

    /**
     * Strip the bot's @mention from the message text.
     * Slack @mentions use the format `<@U0123456>`.
     */
    protected stripBotMention(text: string): string {
        return text.replace(new RegExp(`<@${this.BotUserID}>`, 'g'), '').trim();
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
            const result = await this.Client.users.info({ user: platformUserId });
            return result.user?.profile?.email ?? null;
        } catch {
            return null;
        }
    }
}
