/**
 * @module @memberjunction/messaging-adapters
 * @description Core types shared across all messaging platform adapters.
 */

/**
 * Configuration for a messaging adapter, passed via the
 * `ServerExtensionConfig.Settings` object in `mj.config.cjs`.
 *
 * @example
 * ```javascript
 * // mj.config.cjs
 * serverExtensions: [{
 *     DriverClass: 'SlackMessagingExtension',
 *     RootPath: '/webhook/slack',
 *     Settings: {
 *         AgentID: '...',
 *         ContextUserEmail: 'bot@company.com',
 *         BotToken: process.env.SLACK_BOT_TOKEN,
 *         SigningSecret: process.env.SLACK_SIGNING_SECRET,
 *     }
 * }]
 * ```
 */
export interface MessagingAdapterSettings {
    /**
     * Default MJ Agent ID used when no specific agent is @mentioned.
     * Must be a valid GUID matching an AI Agents entity record.
     */
    AgentID: string;

    /**
     * Fallback MJ User email for agent execution when the platform user
     * cannot be mapped to an MJ user. Acts as a service account.
     */
    ContextUserEmail: string;

    /** Platform-specific bot token for API access. */
    BotToken: string;

    /** Optional signing secret for webhook signature verification (Slack). */
    SigningSecret?: string;

    /** Optional app-level token for Slack Socket Mode connections. */
    AppToken?: string;

    /**
     * Connection mode for platforms that support multiple modes.
     * - `'http'` (default): Standard HTTP webhook endpoint
     * - `'socket'`: WebSocket connection (Slack Socket Mode, no public URL needed)
     */
    ConnectionMode?: 'http' | 'socket';

    /**
     * Maximum number of thread messages to fetch for conversation context.
     * @default 50
     */
    MaxThreadMessages?: number;

    /**
     * Whether to show typing/thinking indicators while the agent processes.
     * @default true
     */
    ShowTypingIndicator?: boolean;

    /**
     * Minimum interval between streaming message updates in milliseconds.
     * Prevents rate limiting from platform APIs.
     * @default 1000
     */
    StreamingUpdateIntervalMs?: number;

    /**
     * Microsoft App ID for Teams Bot Framework authentication.
     * Only needed for Teams adapters.
     */
    MicrosoftAppId?: string;

    /**
     * Microsoft App Password for Teams Bot Framework authentication.
     * Only needed for Teams adapters.
     */
    MicrosoftAppPassword?: string;
}

/**
 * Normalized representation of an incoming message from any messaging platform.
 *
 * Platform adapters convert their platform-specific event payloads into this
 * common format before passing to `BaseMessagingAdapter.HandleMessage()`.
 */
export interface IncomingMessage {
    /** Platform-specific message ID (e.g., Slack `ts`, Teams `activity.id`). */
    MessageID: string;

    /** The text content of the message. */
    Text: string;

    /** Platform-specific user ID of the sender. */
    SenderID: string;

    /** Display name of the sender (may be empty if not available). */
    SenderName: string;

    /** Email of the sender (if available from platform). Used for MJ user lookup. */
    SenderEmail?: string;

    /** Channel/conversation ID where the message was sent. */
    ChannelID: string;

    /** Thread ID for threaded conversations (`null` for top-level messages). */
    ThreadID: string | null;

    /** Whether this is a direct message (DM) to the bot. */
    IsDirectMessage: boolean;

    /** Whether the bot was explicitly @mentioned in the message. */
    IsBotMention: boolean;

    /**
     * Agent names mentioned in the message (parsed from @mentions).
     * Used for multi-agent routing. The first agent in the list is used.
     */
    MentionedAgentNames?: string[];

    /** Timestamp of the message. */
    Timestamp: Date;

    /** Raw platform-specific event payload for adapter-specific logic. */
    RawEvent: Record<string, unknown>;
}

/**
 * Represents a formatted response ready to send back to the platform.
 * Contains both a plain text fallback and platform-specific rich format.
 */
export interface FormattedResponse {
    /** Plain text fallback (used by screen readers and notification previews). */
    PlainText: string;

    /**
     * Platform-specific rich format payload.
     * - Slack: `{ blocks: BlockKitBlock[] }`
     * - Teams: Adaptive Card JSON
     */
    RichPayload: Record<string, unknown>;
}

/**
 * Result of converting thread history to a ChatMessage array.
 */
export interface ThreadHistoryResult {
    /** The converted messages ready for AgentRunner. */
    MessageCount: number;

    /** Number of messages that were truncated due to MaxThreadMessages. */
    TruncatedCount: number;
}

/**
 * Section parsed from Markdown content for platform-specific formatting.
 */
export interface MarkdownSection {
    /** Type of section: 'text', 'code', or 'header'. */
    Type: 'text' | 'code' | 'header';

    /** Content of the section. */
    Content: string;
}
