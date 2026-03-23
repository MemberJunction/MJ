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
import { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings, AgentResponseMetadata } from '../base/types.js';
import { markdownToAdaptiveCard } from './teams-formatter.js';
import { buildRichAdaptiveCard } from './teams-card-builder.js';

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
    private botID: string = '';

    /**
     * Stored conversation references for proactive messaging.
     * Maps conversation ID to the reference needed to send proactive messages.
     * Entries are evicted after 24 hours to prevent unbounded growth.
     */
    private conversationReferences = new Map<string, { ref: Partial<ConversationReference>; timestamp: number }>();
    private static readonly CONV_REF_TTL_MS = 24 * 60 * 60 * 1000;
    private static readonly CONV_REF_MAX_SIZE = 10_000;

    protected get PlatformName(): string { return 'Teams'; }

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
        this.storeConversationRef(activity.conversation?.id ?? '', conversationRef);

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
        const settings = this.settings;
        this.botID = settings.MicrosoftAppId ?? process.env.MICROSOFT_APP_ID ?? '';
    }

    protected getBotUserId(): string {
        return this.botID;
    }

    /**
     * Send a typing indicator to the Teams conversation.
     * Teams natively supports typing indicators via the Bot Framework.
     */
    protected async showTypingIndicator(message: IncomingMessage, _agent?: MJAIAgentEntityExtended): Promise<void> {
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
     * Falls back to sending a new message if the channel doesn't support updates.
     *
     * Instead of caching update support on the singleton, we detect per-turn
     * by checking `channelId`. Web Chat (`'webchat'`) doesn't support updates;
     * real Teams (`'msteams'`) does. For unknown channels we try/catch.
     */
    protected async sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null,
        _agent?: MJAIAgentEntityExtended
    ): Promise<string> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        const channelSupportsUpdate = this.channelSupportsUpdate(turnContext);

        // Channels that don't support updates (Web Chat, emulator): skip ALL
        // streaming messages. The typing indicator is already shown via
        // showTypingIndicator(), and we'll send only the final Adaptive Card.
        // Without this, the "thinking..." message stays permanently and the
        // final card becomes a second message.
        if (!channelSupportsUpdate) {
            return '';
        }

        if (existingMessageId) {
            try {
                await turnContext.updateActivity({
                    id: existingMessageId,
                    type: ActivityTypes.Message,
                    text: currentContent + ' ...'
                } as Partial<Activity>);
                return existingMessageId;
            } catch {
                // Individual update failed — fall through to send new message
            }
        }

        const response = await turnContext.sendActivity(currentContent + ' ...');
        return response?.id ?? '';
    }

    /**
     * Send the final formatted response as an Adaptive Card.
     */
    protected async sendFinalMessage(originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        await turnContext.sendActivity({
            type: ActivityTypes.Message,
            // Omit `text` when an Adaptive Card is attached — Web Chat and Teams
            // render both the text AND the card, causing duplicate content.
            // The card itself contains all the content; `text` is only a fallback
            // for clients that can't render cards (none of our targets).
            attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: response.RichPayload
            }]
        } as Partial<Activity>);
    }

    /**
     * Update the streaming progress message with the final Adaptive Card.
     * Falls back to sending a new message if the channel doesn't support updates.
     */
    protected async updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        const turnContext = (originalMessage.RawEvent as Record<string, unknown>)['turnContext'] as TurnContext;
        const channelSupportsUpdate = this.channelSupportsUpdate(turnContext);

        if (channelSupportsUpdate) {
            try {
                await turnContext.updateActivity({
                    id: messageId,
                    type: ActivityTypes.Message,
                    attachments: [{
                        contentType: 'application/vnd.microsoft.card.adaptive',
                        content: response.RichPayload
                    }]
                } as Activity);
                return;
            } catch {
                // Fall through to send as new message
            }
        }

        // Fallback: send as new message
        await this.sendFinalMessage(originalMessage, response);
    }

    /**
     * Format agent response as a rich Teams Adaptive Card.
     *
     * When a full `ExecuteAgentResult` is available, builds a rich card with
     * agent header, action buttons, explorer links, and metadata footer.
     * Falls back to basic markdown-to-TextBlock conversion otherwise.
     */
    protected async formatResponse(
        result: ExecuteAgentResult | null,
        agent: MJAIAgentEntityExtended,
        responseText: string,
        metadata?: AgentResponseMetadata
    ): Promise<FormattedResponse> {
        const richPayload = result
            ? buildRichAdaptiveCard(result, agent, responseText, {
                explorerBaseURL: this.settings.ExplorerBaseURL,
                artifactId: metadata?.ArtifactId,
                conversationId: metadata?.ConversationId,
            })
            : markdownToAdaptiveCard(responseText);

        return {
            PlainText: responseText,
            RichPayload: richPayload,
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
     * Detect whether the current channel supports `updateActivity`.
     * Real Teams (`msteams`) supports updates; Web Chat (`webchat`) does not.
     * Unknown channels are assumed to support updates (try/catch guards the call).
     */
    private channelSupportsUpdate(turnContext: TurnContext): boolean {
        const channelId = turnContext.activity?.channelId;
        if (channelId === 'webchat' || channelId === 'emulator') {
            return false;
        }
        return true;
    }

    /**
     * Recently processed form activity IDs — prevents double-processing when
     * Web Chat sends both an invoke and a message for the same Action.Submit.
     * Uses timestamps instead of setTimeout for cleanup (avoids timer leaks).
     */
    private recentFormActivityIds = new Map<string, number>();
    private static readonly FORM_DEDUP_TTL_MS = 30_000;

    /**
     * Handle an Adaptive Card Action.Submit from a form rendered in Teams.
     *
     * Extracts field values from `activity.value`, builds the same
     * `@{_mode:"form",...}` payload that Slack uses for modal submissions,
     * and routes through `HandleMessage()` as a synthetic IncomingMessage.
     *
     * Does NOT send a bot acknowledgement message — the agent's own response
     * serves as the acknowledgement, and a bot-authored echo of the form values
     * would pollute the conversation history the agent sees.
     */
    public async HandleFormSubmit(turnContext: TurnContext): Promise<void> {
        try {
            const activity = turnContext.activity;

            // Dedup: Web Chat may fire both invoke + message for the same submit
            const activityId = activity.id ?? '';
            if (activityId && this.isRecentFormActivity(activityId)) {
                LogStatus(`Teams form submit: duplicate activity '${activityId}', skipping`);
                return;
            }
            if (activityId) {
                this.recentFormActivityIds.set(activityId, Date.now());
            }

            const formValues = activity.value as Record<string, unknown> | null;
            if (!formValues || formValues['action'] !== 'mj:form_submit') {
                return;
            }

            LogStatus(`Teams form submit: user='${activity.from?.name}', conversation='${activity.conversation?.id}'`);

            // Extract form fields: keys starting with "mj_form_" are input field IDs
            const fields = this.extractFormFields(formValues);
            if (fields.length === 0) {
                LogStatus('Teams form submit: no fields extracted, ignoring');
                return;
            }

            // Build the @{_mode:"form"} message matching Explorer/Slack format
            const formResponse = JSON.stringify({
                _mode: 'form',
                action: 'formSubmit',
                fields,
            });
            const messageText = `@${formResponse}`;

            // Build a synthetic IncomingMessage and route through the adapter
            const senderEmail = (activity.from as unknown as Record<string, unknown>)?.['email'] as string | undefined;

            // Store conversation reference for proactive messaging
            const conversationRef = TurnContext.getConversationReference(activity);
            this.storeConversationRef(activity.conversation?.id ?? '', conversationRef);

            const incomingMessage: IncomingMessage = {
                MessageID: activityId,
                Text: messageText,
                SenderID: activity.from?.id ?? '',
                SenderName: activity.from?.name ?? '',
                SenderEmail: senderEmail,
                ChannelID: activity.channelId ?? '',
                ThreadID: activity.conversation?.id ?? null,
                IsDirectMessage: activity.conversation?.conversationType === 'personal',
                IsBotMention: true,
                Timestamp: activity.timestamp ? new Date(activity.timestamp) : new Date(),
                RawEvent: { activity, turnContext } as unknown as Record<string, unknown>,
            };

            await this.HandleMessage(incomingMessage);
        } catch (error) {
            LogError('Failed to handle Teams form submission:', undefined, error);
        }
    }

    /**
     * Extract form field values from an Action.Submit activity.value object.
     * Keys starting with "mj_form_" are input field IDs set by the card builder.
     */
    private extractFormFields(
        formValues: Record<string, unknown>
    ): Array<{ name: string; value: string; label: string; displayValue: string }> {
        const fields: Array<{ name: string; value: string; label: string; displayValue: string }> = [];
        for (const [key, val] of Object.entries(formValues)) {
            if (key.startsWith('mj_form_') && val != null && val !== '') {
                const questionId = key.replace('mj_form_', '');
                const strValue = String(val);
                fields.push({
                    name: questionId,
                    value: strValue,
                    label: questionId,
                    displayValue: strValue,
                });
            }
        }
        return fields;
    }

    /**
     * Check if the bot was @mentioned in a Teams activity.
     */
    private hasBotMention(activity: Partial<Activity>): boolean {
        const entities = activity.entities ?? [];
        return entities.some(
            e => e.type === 'mention' &&
                 (e as Record<string, unknown>).mentioned != null &&
                 ((e as Record<string, unknown>).mentioned as Record<string, unknown>)?.id === this.botID
        );
    }

    // ─── TTL helpers ──────────────────────────────────────────────────

    /** Store a conversation reference with TTL-based eviction. */
    private storeConversationRef(conversationId: string, ref: Partial<ConversationReference>): void {
        this.conversationReferences.set(conversationId, { ref, timestamp: Date.now() });
        // Evict expired entries
        const now = Date.now();
        for (const [key, entry] of this.conversationReferences) {
            if (now - entry.timestamp > TeamsAdapter.CONV_REF_TTL_MS) {
                this.conversationReferences.delete(key);
            }
        }
        if (this.conversationReferences.size > TeamsAdapter.CONV_REF_MAX_SIZE) {
            const oldest = [...this.conversationReferences.entries()]
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            for (const [key] of oldest.slice(0, oldest.length - TeamsAdapter.CONV_REF_MAX_SIZE)) {
                this.conversationReferences.delete(key);
            }
        }
    }

    /** Check if a form activity was recently processed (dedup). */
    private isRecentFormActivity(activityId: string): boolean {
        const timestamp = this.recentFormActivityIds.get(activityId);
        if (timestamp == null) return false;
        if (Date.now() - timestamp > TeamsAdapter.FORM_DEDUP_TTL_MS) {
            this.recentFormActivityIds.delete(activityId);
            return false;
        }
        // Clean up expired entries opportunistically
        for (const [key, ts] of this.recentFormActivityIds) {
            if (Date.now() - ts > TeamsAdapter.FORM_DEDUP_TTL_MS) {
                this.recentFormActivityIds.delete(key);
            }
        }
        return true;
    }
}
