/**
 * @module @memberjunction/messaging-adapters
 * @description Microsoft Teams-specific messaging adapter implementation.
 *
 * Extends `BaseMessagingAdapter` with Bot Framework operations for:
 * - Sending and updating messages via `TurnContext`
 * - Showing typing indicators via `ActivityTypes.Typing`
 * - Formatting responses as Adaptive Cards
 * - Stripping bot `<at>` mentions from message text
 */

import { TurnContext, ActivityTypes, Activity, ConversationReference } from 'botbuilder';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings } from '../base/types.js';
import { markdownToAdaptiveCard } from './teams-formatter.js';

/**
 * Microsoft Teams-specific adapter that implements all platform operations
 * using the Bot Framework SDK (`botbuilder`).
 *
 * ## Features
 * - Native typing indicators via `ActivityTypes.Typing`
 * - Adaptive Card rich formatting for responses
 * - Bot mention stripping (`<at>BotName</at>`) for clean agent input
 * - User email extraction from Bot Framework activities
 *
 * ## Authentication
 * Requires a Microsoft App ID and Password registered in Azure Bot Service.
 * The Bot Framework SDK handles JWT token validation automatically.
 *
 * ## Thread History
 * Teams thread history fetching via Microsoft Graph API is not yet implemented.
 * This means conversations are currently single-turn. Multi-turn support
 * requires Graph API access with `ChannelMessage.Read.All` permission.
 */
export class TeamsAdapter extends BaseMessagingAdapter {
    /** The bot's Microsoft App ID (also used as the bot's user ID). */
    private BotID: string = '';

    /**
     * Stored conversation references for proactive messaging.
     * Maps conversation ID to the reference needed to send proactive messages.
     */
    private ConversationReferences: Map<string, Partial<ConversationReference>> = new Map();

    constructor(settings: MessagingAdapterSettings) {
        super(settings);
    }

    /**
     * Convert a Bot Framework `TurnContext` into a normalized `IncomingMessage`.
     *
     * Called by `TeamsMessagingExtension` when a message activity is received.
     *
     * @param turnContext - Bot Framework turn context for the current activity.
     * @returns Normalized incoming message.
     */
    public MapTeamsActivity(turnContext: TurnContext): IncomingMessage {
        const activity = turnContext.activity;

        // Store conversation reference for potential proactive messaging
        const conversationRef = TurnContext.getConversationReference(activity);
        this.ConversationReferences.set(
            activity.conversation?.id ?? '',
            conversationRef
        );

        // Extract sender email from activity (available in Teams)
        const senderEmail = (activity.from as unknown as Record<string, unknown>)?.['email'] as string | undefined;

        return {
            MessageID: activity.id ?? '',
            Text: activity.text ?? '',
            SenderID: activity.from?.id ?? '',
            SenderName: activity.from?.name ?? '',
            SenderEmail: senderEmail,
            ChannelID: activity.channelId ?? '',
            ThreadID: activity.conversation?.id ?? null,
            IsDirectMessage: activity.conversation?.conversationType === 'personal',
            IsBotMention: this.hasBotMention(activity),
            Timestamp: activity.timestamp ? new Date(activity.timestamp) : new Date(),
            RawEvent: { activity, turnContext } as unknown as Record<string, unknown>
        };
    }

    /**
     * Initialize: set the bot ID from config or environment.
     */
    protected async onInitialize(): Promise<void> {
        const settings = this.Settings;
        this.BotID = settings.MicrosoftAppId ?? process.env.MICROSOFT_APP_ID ?? '';
    }

    protected getBotUserId(): string {
        return this.BotID;
    }

    /**
     * Send a typing indicator to the Teams conversation.
     * Teams natively supports typing indicators via the Bot Framework.
     */
    protected async showTypingIndicator(message: IncomingMessage): Promise<void> {
        const turnContext = (message.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        if (turnContext) {
            await turnContext.sendActivity({ type: ActivityTypes.Typing });
        }
    }

    /**
     * Fetch thread history from Teams.
     *
     * NOTE: Not yet implemented. Requires Microsoft Graph API access with
     * `ChannelMessage.Read.All` permission. Currently returns empty array,
     * meaning conversations are single-turn.
     *
     * Future implementation would use:
     * `GET /teams/{id}/channels/{id}/messages/{id}/replies`
     */
    protected async fetchThreadHistory(
        _channelId: string,
        _threadId: string
    ): Promise<IncomingMessage[]> {
        // TODO: Implement via Microsoft Graph API
        // GET /teams/{team-id}/channels/{channel-id}/messages/{message-id}/replies
        // Requires Graph API client and ChannelMessage.Read.All permission
        return [];
    }

    /**
     * Post a new streaming message or update an existing one.
     */
    protected async sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
    ): Promise<string> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;

        if (existingMessageId) {
            await turnContext.updateActivity({
                id: existingMessageId,
                type: ActivityTypes.Message,
                text: currentContent + ' ...'
            } as Partial<Activity>);
            return existingMessageId;
        } else {
            const response = await turnContext.sendActivity(currentContent + ' ...');
            return response?.id ?? '';
        }
    }

    /**
     * Send the final formatted response as an Adaptive Card.
     */
    protected async sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        await turnContext.sendActivity({
            type: ActivityTypes.Message,
            text: response.PlainText,
            attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: response.RichPayload
            }]
        } as Partial<Activity>);
    }

    /**
     * Update the streaming progress message with the final Adaptive Card.
     */
    protected async updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        await turnContext.updateActivity({
            id: messageId,
            type: ActivityTypes.Message,
            text: response.PlainText,
            attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: response.RichPayload
            }]
        } as Activity);
    }

    /**
     * Format agent response Markdown as a Teams Adaptive Card.
     */
    protected async formatResponse(markdownText: string): Promise<FormattedResponse> {
        return {
            PlainText: markdownText,
            RichPayload: markdownToAdaptiveCard(markdownText)
        };
    }

    /**
     * Strip the bot's `<at>` mention from the message text.
     * Teams @mentions use the format `<at>BotName</at>`.
     */
    protected stripBotMention(text: string): string {
        return text.replace(/<at>[^<]+<\/at>/g, '').trim();
    }

    /**
     * Look up the email for a Teams user.
     * In Teams, the email is often available directly on the activity's `from` property.
     *
     * @param platformUserId - Teams user ID.
     * @returns Email address, or `null` if not available.
     */
    protected async lookupUserEmail(platformUserId: string): Promise<string | null> {
        // Teams provides email in the activity `from` field for most message types
        // The caller already extracted SenderEmail from the activity
        // For additional lookups, Graph API would be needed
        return null;
    }

    /**
     * Check if the bot was @mentioned in a Teams activity.
     */
    private hasBotMention(activity: Partial<Activity>): boolean {
        const entities = activity.entities ?? [];
        return entities.some(
            e => e.type === 'mention' &&
                 (e as Record<string, unknown>).mentioned != null &&
                 ((e as Record<string, unknown>).mentioned as Record<string, unknown>)?.id === this.BotID
        );
    }
}
