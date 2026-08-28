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
import { LogStatus } from '@memberjunction/core';
import { BaseMessagingAdapter, type UploadableFile } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings, AgentResponseMetadata } from '../base/types.js';
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

    /**
     * Message IDs of "Thinking..." indicators, keyed by `channelId:threadTs`.
     * Per-thread keying prevents concurrent messages from overwriting each other's indicator.
     */
    private thinkingMessageIds = new Map<string, string>();

    /**
     * Maximum length of a message's `text` field.
     *
     * Slack rejects `chat.postMessage`/`chat.update` with `msg_too_long` past roughly 4,000
     * characters — NOT the ~40,000 that applies to a message's total block payload. The higher
     * figure meant this limit never engaged before Slack refused the call, so streaming updates
     * failed continuously for any long output: the model streams its raw envelope (which can
     * include base64 file data), every progress update was rejected, and the placeholder sat
     * frozen mid-flight while the log filled with `msg_too_long`.
     *
     * 3,900 leaves room for the truncation notice appended below.
     */
    private static readonly MAX_TEXT_LENGTH = 3_900;

    protected get PlatformName(): string { return 'Slack'; }

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
        if (result.ts) {
            this.thinkingMessageIds.set(this.threadKey(message), result.ts);
        }
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
        const key = this.threadKey(originalMessage);
        const messageToUpdate = existingMessageId ?? this.thinkingMessageIds.get(key) ?? null;

        if (messageToUpdate) {
            this.thinkingMessageIds.delete(key); // Consumed
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
     * Extensions for MIME types whose subtype is not a usable file extension.
     *
     * `mimeType.split('/')[1]` yields "vnd.openxmlformats-officedocument.wordprocessingml.document"
     * for a .docx, which Slack shows as an unopenable blob.
     */
    private static readonly EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/msword': 'doc',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/pdf': 'pdf',
        'application/json': 'json',
        'text/markdown': 'md',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
    };

    /**
     * Extensions recognised as already present on a filename.
     *
     * Derived from the map above so the two cannot drift, plus common types an agent may name
     * directly without our having a MIME mapping for them.
     */
    private static readonly KNOWN_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
        ...Object.values(SlackAdapter.EXTENSION_BY_MIME_TYPE),
        'jpeg', 'png', 'gif', 'webp', 'html', 'zip', 'mp3', 'mp4', 'wav', 'xml', 'yaml',
    ]);

    /**
     * Upload an agent's binary output as real Slack files, threaded under the reply.
     *
     * Slack's `image` blocks can only reference a public https URL, so base64 media — every
     * generated image, and any file inlined as a `data:` URI — could not be rendered and was
     * silently dropped: the agent did the work, the artifact existed, and the user saw nothing.
     * Uploading makes it an ordinary attachment the user can open or download.
     *
     * Requires the `files:write` bot scope; without it Slack answers `missing_scope`, which the
     * caller logs (the text reply has already posted by then).
     */
    protected async uploadMediaOutputs(originalMessage: IncomingMessage, files: readonly UploadableFile[]): Promise<void> {
        const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;
        // Capped to mirror the media-block limit — a reply should not become a file dump.
        for (const file of files.slice(0, 5)) {
            if (!file || typeof file.data !== 'string' || file.data.length === 0) continue;

            const mimeType = (file.mimeType ?? 'image/png').toLowerCase();
            const extension = SlackAdapter.EXTENSION_BY_MIME_TYPE[mimeType]
                ?? (mimeType.split('/')[1] ?? 'bin').split('+')[0];
            const preferredName = (file.fileName?.trim() || file.label || `generated-${file.modality ?? 'media'}`)
                .replace(/[^\w.-]+/g, '_')
                .slice(0, 80) || 'generated-file';
            // Only treat a trailing token as an extension if it IS one: a bare
            // /\.[A-Za-z0-9]{1,5}$/ reads "Q3 Report v1.2" as already-extensioned and uploads it
            // without .docx — the unopenable blob the mapping above exists to prevent.
            const trailing = /\.([A-Za-z0-9]{1,5})$/.exec(preferredName)?.[1]?.toLowerCase();
            const filename = trailing && SlackAdapter.KNOWN_FILE_EXTENSIONS.has(trailing)
                ? preferredName
                : `${preferredName}.${extension}`;

            await this.client.files.uploadV2({
                channel_id: originalMessage.ChannelID,
                thread_ts: threadTs,
                file: Buffer.from(file.data, 'base64'),
                filename,
                title: file.label ?? file.fileName ?? undefined,
            });
        }
    }

    /**
     * Send the final formatted response. If a "Thinking..." message exists
     * (no streaming occurred), update it in-place instead of posting a new message.
     */
    protected async sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        const key = this.threadKey(originalMessage);
        const thinkingId = this.thinkingMessageIds.get(key);
        if (thinkingId) {
            this.thinkingMessageIds.delete(key);
            await this.updateFinalMessage(originalMessage, thinkingId, response);
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
        responseText: string,
        metadata?: AgentResponseMetadata
    ): Promise<FormattedResponse> {
        const identity = this.buildAgentIdentity(agent);

        // Build rich Block Kit layout
        const blocks = buildRichResponse(result, agent, responseText, {
            explorerBaseURL: this.settings.ExplorerBaseURL,
            artifactId: metadata?.ArtifactId,
            conversationId: metadata?.ConversationId,
        });

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
        } catch (error) {
            LogStatus(`Slack user email lookup failed for '${platformUserId}' (falling back to service account)`);
            return null;
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────

    /** Build a unique key for per-thread state (thinking indicator). */
    private threadKey(message: IncomingMessage): string {
        return `${message.ChannelID}:${message.ThreadID ?? message.MessageID}`;
    }

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
        // Same ceiling as the primary path: Slack refuses a `text` field past ~4,000, and this
        // fallback is what sendFinalMessage/updateFinalMessage actually post.
        if (text.length <= SlackAdapter.MAX_TEXT_LENGTH) return text;
        return text.slice(0, SlackAdapter.MAX_TEXT_LENGTH - 30) + '\n\n(See full response above)';
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
