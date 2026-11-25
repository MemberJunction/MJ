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

import { AgentRunner, ResolveHandoffTarget } from '@memberjunction/ai-agents';
import { ChatMessage, parseBase64DataUrl } from '@memberjunction/ai';
import { ExecuteAgentParams, ExecuteAgentResult, FileOutputRef, MAX_HANDOFF_HOPS, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper, AIEngineBase } from '@memberjunction/ai-engine-base';
import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJArtifactEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, SanitizeForLog, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    MessagingAdapterSettings,
    IncomingMessage,
    FormattedResponse,
    AgentIdentity,
    AgentResponseMetadata,
} from './types.js';

/**
 * Outcome of resolving which agent should handle a message for the calling user.
 */
export interface ResolveAgentResult {
    /** The authorized agent to execute, or `null` when the request is refused. */
    agent: MJAIAgentEntityExtended | null;
    /** Optional note prepended to the response (e.g., multiple agents mentioned or fallback notice). */
    multiAgentNote: string | null;
    /** User-safe explanation sent back when `agent` is `null`. */
    refusalMessage?: string;
}

/** Internal access-check verdict for a candidate agent and calling user. */
type AgentAccessVerdict = 'Allowed' | 'NotFound' | 'NotDiscoverable' | 'NotAllowedHere' | 'NoRunPermission';

/** Minimal row projection loaded from `MJ: Conversation Details` for DB-backed thread history. */
interface ConversationDetailHistoryRow {
    ID: string;
    Role: MJConversationDetailEntity['Role'];
    Message: string | null;
    AgentID: string | null;
}

/** Stored thread-to-conversation mapping with sliding idle timestamp, timeout, and last answering agent. */
interface ThreadConversationEntry {
    conversationId: string;
    lastActivityAt: number;
    idleTimeoutMs: number;
    lastAgentId?: string;
}

/** Parsed result of checking whether a message starts with `/new`. */
interface NewConversationCommandResult {
    isNewCommand: boolean;
    /** Remaining prompt text after `/new`, empty string when bare `/new`. */
    remainingText: string;
}

/**
 * Result from `runAgentWithStreaming`, wrapping the ExecuteAgentResult with
 * conversation/artifact metadata from `RunAgentInConversation`.
 */
interface ConversationAgentResult {
    /** The agent execution result. */
    result: ExecuteAgentResult;
    /** The platform message ID of the streaming/progress message, if one was sent. */
    progressMessageId?: string | null;
    /** The MJ Conversation Artifact ID, if one was created. */
    artifactId?: string;
    /** The MJ Conversation ID for this interaction. */
    conversationId?: string;
    /** The MJ Conversation Detail ID for the agent's response row, if created. */
    agentResponseDetailId?: string;
    /** The execution parameters used for the initial agent run. */
    params: ExecuteAgentParams;
}

/**
 * A binary output to deliver as a platform file: either a generated `MediaOutput` or a file the
 * agent inlined as a `data:` URI. `fileName`, when present, wins over any derived name.
 *
 * Deliberately not `Pick<MediaOutput, ...>`: `MediaOutput.modality` is `MediaModality`
 * (`'Image' | 'Audio' | 'Video'`), and a file attachment is none of those.
 */
export interface UploadableFile {
    modality?: string;
    mimeType?: string;
    /** Base64-encoded bytes. */
    data?: string;
    label?: string;
    /** Preferred name; when absent the adapter derives one from `label` and the MIME type. */
    fileName?: string;
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
    /**
     * Optional per-platform file upload. Implemented by adapters whose platform can accept file
     * uploads (see `SlackAdapter.uploadMediaOutputs`); absent elsewhere, in which case binary
     * output is simply not delivered as files.
     */
    protected uploadMediaOutputs?(message: IncomingMessage, files: readonly UploadableFile[]): Promise<void>;

    /** Extension settings from `mj.config.cjs`. */
    protected settings: MessagingAdapterSettings;

    /** Fallback context user (service account) loaded from config email. */
    protected fallbackContextUser: UserInfo | null = null;

    /** Default agent loaded from config DefaultAgentName. */
    protected defaultAgent: MJAIAgentEntityExtended | null = null;

    /**
     * Active, directly-discoverable, host-allowed agents loaded at init for multi-word
     * name matching and slash command registration. Sorted longest-name-first.
     */
    protected availableAgents: MJAIAgentEntityExtended[] = [];

    /**
     * All active agents loaded at init (including sub-agents and agents outside `AllowedAgentIDs`),
     * kept private so explicit mentions/slash commands targeting non-discoverable or disallowed
     * agents are refused rather than silently rerouted.
     */
    private allActiveAgents: MJAIAgentEntityExtended[] = [];

    /** UUID-insensitive host allow-list from `settings.AllowedAgentIDs`, or `null` when unrestricted. */
    private allowedAgentIds: UUIDSet | null = null;

    /**
     * Maps platform thread keys to MJ Conversation IDs, sliding idle timestamps,
     * and the last agent that answered in that conversation.
     *
     * Rolling conversations (DMs, Teams group chats, Teams meetings) roll over after
     * `ConversationIdleTimeoutMs` (default 2 hours) of inactivity; explicit channel
     * threads expire after 24 hours.
     */
    private threadConversationMap = new Map<string, ThreadConversationEntry>();

    /** Max age for explicit channel thread→conversation mappings (24 hours). */
    private static readonly THREAD_MAP_TTL_MS = 24 * 60 * 60 * 1000;

    /** Default idle rollover timeout for rolling conversations (DMs, group chats, meetings): 2 hours. */
    private static readonly DEFAULT_ROLLING_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

    /** Max entries in the thread map before forced eviction of oldest entries. */
    private static readonly THREAD_MAP_MAX_SIZE = 10_000;

    /**
     * Per-thread execution chain. Messages on one platform thread are handled one at a time, in
     * arrival order, so a rapid burst cannot race: the first message creates the MJ Conversation
     * and stores its id before the second message looks it up, and the per-thread streaming
     * indicator is never clobbered by a parallel turn.
     */
    private inFlightThreadPromises = new Map<string, Promise<void>>();

    constructor(settings: MessagingAdapterSettings) {
        this.settings = settings;
        this.allowedAgentIds = settings.AllowedAgentIDs !== undefined
            ? new UUIDSet(settings.AllowedAgentIDs)
            : null;
    }

    /**
     * Initialize the adapter: resolve the service-account context user, warm `AIEngineBase`
     * metadata as the service account, load the default MJ agent and directly-discoverable
     * host-allowed agents, then run platform init.
     * Must be called before handling any messages.
     *
     * @throws Error if the configured agent or service-account user cannot be found, or if
     *               the default agent violates `AllowedAgentIDs` or is not directly discoverable.
     */
    public async Initialize(): Promise<void> {
        await this.loadFallbackContextUser();
        // Warm AIEngineBase as the service account so shared agent/permission metadata is never
        // loaded under the first regular caller's scope.
        await AIEngineBase.Instance.Config(false, this.fallbackContextUser!);
        await this.loadDefaultAgent();
        await this.loadAvailableAgents();
        await this.onInitialize();
        LogStatus(`Messaging adapter initialized: agent='${this.defaultAgent?.Name}', serviceUser='${this.settings.ContextUserEmail}', availableAgents=${this.availableAgents.length}`);
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

        // Serialize messages on the same thread behind an in-flight promise so rapid
        // multi-message bursts in one thread reuse the same MJ Conversation in order.
        const threadKey = this.getThreadKey(message);
        const previous = this.inFlightThreadPromises.get(threadKey) ?? Promise.resolve();
        const current = previous
            .catch(() => {
                // Earlier turn errors are already handled; never block subsequent turns in the thread.
            })
            .then(() => this.handleMessageForThread(message));

        this.inFlightThreadPromises.set(threadKey, current);
        try {
            await current;
        } finally {
            if (this.inFlightThreadPromises.get(threadKey) === current) {
                this.inFlightThreadPromises.delete(threadKey);
            }
        }
    }

    /**
     * Executes the full message handling pipeline for a single turn once its per-thread
     * serialization slot has been acquired.
     */
    private async handleMessageForThread(message: IncomingMessage): Promise<void> {
        // 2. Fetch thread history (needed for the multi-bot gate below, agent resolution, and
        //    conversation context). Deliberately BEFORE user lookup and typing indicator: the gate
        //    may decline silently, and an indicator or refusal from an unaddressed bot in a
        //    multi-bot channel would create duplicate noise.
        const threadHistory = await this.safeGetThreadHistory(message);

        // 3. Multi-bot thread gate. A thread reply needs no mention to reach a bot, so on a
        //    platform that broadcasts channel messages to every installed app (Slack), ONE
        //    reply reached every bot and each answered — N replies to one message once more
        //    than one agent had its own app. A bot may answer an un-mentioned thread reply
        //    only when it is already party to that thread (it posted in it).
        if (message.ThreadID && threadHistory.length > 0 && !this.respondsToUnaddressedThreadReplies()) {
            const botUserId = this.getBotUserId();
            const addressed = message.IsBotMention === true
                || (!!botUserId && typeof message.Text === 'string' && message.Text.includes(botUserId));
            const inThread = threadHistory.some((m) => this.isSelf(m.SenderID));
            if (!addressed && !inThread) {
                LogStatus(
                    `${this.PlatformName}: not answering thread ${message.ThreadID} — this bot was not ` +
                    `addressed and has not posted in it (multi-bot thread gate)`
                );
                return;
            }
        }

        // 4. Resolve the MJ user for this platform sender (fails closed unless AllowFallbackUser is true)
        const contextUser = await this.resolveContextUser(message);
        if (!contextUser) {
            await this.sendRefusal(
                message,
                "I couldn't match your account to an active MemberJunction user, so I can't process this request. Please contact your administrator to link your account."
            );
            return;
        }

        // 5. Handle `/new` command (reset thread→MJ Conversation mapping and start fresh)
        const threadKey = this.getThreadKey(message);
        const newCmd = this.parseNewConversationCommand(message);
        let effectiveMessage = message;
        let effectiveThreadHistory = threadHistory;
        if (newCmd.isNewCommand) {
            this.clearThreadConversation(threadKey);
            if (!newCmd.remainingText) {
                await this.sendRefusal(
                    message,
                    'Started a fresh conversation. What would you like to work on?'
                );
                return;
            }
            // `/new <prompt>`: strip `/new`, discard prior thread history, and re-match mentions on the prompt
            effectiveMessage = {
                ...message,
                Text: newCmd.remainingText,
                MentionedAgentNames: this.matchAgentMentions(newCmd.remainingText),
            };
            effectiveThreadHistory = [];
        }

        // 6. Look up active MJ Conversation for this thread (honoring sliding idle rollover)
        const idleTimeoutMs = this.resolveIdleTimeoutMs(effectiveMessage);
        const existingEntry = this.getThreadConversationEntry(threadKey, idleTimeoutMs);

        // 7. When the platform does not provide thread history (e.g., Teams without Graph API),
        //    load prior turns from MJ's own `MJ: Conversation Details` as `contextUser`.
        let dbHistoryMessages: ChatMessage[] | null = null;
        let dbLastAgentId: string | undefined;
        if (this.UsesMJConversationHistory() && effectiveThreadHistory.length === 0 && existingEntry?.conversationId) {
            const loaded = await this.loadConversationHistoryFromDB(existingEntry.conversationId, contextUser);
            dbHistoryMessages = loaded.messages;
            dbLastAgentId = loaded.lastAgentId;
        }

        // 8. Determine which agent to use (enforces IsDirectlyDiscoverable, AllowedAgentIDs, CanView, CanRun)
        const rememberedAgentId = effectiveThreadHistory.length === 0
            ? (existingEntry?.lastAgentId ?? dbLastAgentId)
            : undefined;
        const { agent, multiAgentNote, refusalMessage } = await this.resolveAgent(
            effectiveMessage,
            contextUser,
            effectiveThreadHistory,
            rememberedAgentId
        );
        if (!agent) {
            await this.sendRefusal(
                effectiveMessage,
                refusalMessage ?? "You don't have permission to run an agent for this request."
            );
            return;
        }

        // 9. Show typing indicator (after access checks pass so refused turns never show a hung indicator)
        if (this.settings.ShowTypingIndicator !== false) {
            await this.safeShowTypingIndicator(effectiveMessage, agent);
        }

        // 10. Build conversation messages from platform history or DB-backed history
        const conversationMessages = dbHistoryMessages != null
            ? this.appendCurrentUserMessage(dbHistoryMessages, effectiveMessage)
            : this.buildConversationMessages(effectiveThreadHistory, effectiveMessage);

        // 11. Run the agent with streaming
        await this.executeAgentAndRespond(
            effectiveMessage,
            agent,
            contextUser,
            conversationMessages,
            multiAgentNote,
            existingEntry?.conversationId
        );
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
     * Is this artifact meant for the user, rather than internal system state?
     *
     * Fails OPEN: an unreadable artifact keeps its link, since losing a working link on a
     * transient read failure is worse than the rare case of surfacing an internal one.
     */
    protected async isUserVisibleArtifact(artifactId: string, contextUser: UserInfo): Promise<boolean> {
        try {
            const res = await new RunView().RunView<{ Visibility?: MJArtifactEntity['Visibility'] }>(
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID = '${EscapeSQLString(artifactId)}'`,
                    Fields: ['ID', 'Visibility'],
                    ResultType: 'simple',
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                },
                contextUser
            );
            const visibility = res.Success ? res.Results?.[0]?.Visibility : undefined;
            if (visibility === 'System Only') {
                LogStatus(`Not linking artifact ${artifactId}: it is marked System Only`);
                return false;
            }
            return true;
        } catch (error) {
            LogError(`Could not read artifact ${artifactId} visibility; linking it anyway:`, undefined, error);
            return true;
        }
    }

    /**
     * Was this message posted by THIS bot?
     *
     * Not a bare `=== getBotUserId()`. A platform may publish more than one identifier for the
     * same bot and return a different one depending on how the message was posted — on Slack a
     * post carrying a `username`/`icon_url` override comes back with a `bot_id` and NO `user`,
     * and this adapter sets that override on every agent reply so the agent answers under its own
     * name. Platforms with that split override this; the default is a single-identifier compare.
     */
    protected isSelf(senderId: string | null | undefined): boolean {
        const botUserId = this.getBotUserId();
        return !!senderId && !!botUserId && senderId === botUserId;
    }

    /**
     * Was this history message written by ANY bot (not just this one)?
     *
     * Thread affinity and conversation context must both ignore other bots' messages: an agent's
     * reply names itself in prose, which the mention matcher would read as a user request, and as
     * a 'user' turn it feeds one agent's self-description into another's context.
     *
     * The default is `false` because the marker is platform-specific — see `SlackAdapter`, which
     * reads the Events API's `bot_id`/`bot_profile`/`bot_message` fields.
     */
    protected isBotAuthored(_message: IncomingMessage): boolean {
        return false;
    }

    /**
     * May this bot answer a thread reply that did not address it?
     *
     * `false` (the default) enables the multi-bot thread gate in {@link HandleMessage}: with one
     * app per agent, an un-mentioned thread reply would otherwise be answered by every bot in the
     * channel. Platforms that route a message only to its addressee — Teams, where a channel
     * message reaches a bot solely via an @mention — should return `true`, as the gate is both
     * unnecessary and would suppress legitimate replies there.
     */
    protected respondsToUnaddressedThreadReplies(): boolean {
        return false;
    }

    /**
     * Whether this adapter loads multi-turn conversation history from MJ's own
     * `MJ: Conversation Details` table when platform `fetchThreadHistory()` returns empty.
     *
     * Enabled by `TeamsAdapter` so Teams DMs, channels, group chats, and meetings are
     * multi-turn without requiring Microsoft Graph `ChannelMessage.Read.All` permissions.
     */
    protected UsesMJConversationHistory(): boolean {
        return false;
    }

    /**
     * Whether this message belongs to a rolling (non-threaded) conversation such as a DM,
     * group chat, or meeting chat that shares a single thread key indefinitely.
     *
     * Rolling conversations use the shorter sliding idle rollover timeout
     * (`ConversationIdleTimeoutMs`, default 2 hours) instead of the 24-hour thread TTL.
     */
    protected IsRollingConversation(message: IncomingMessage): boolean {
        return message.IsDirectMessage;
    }

    /**
     * Strip the bot @mention from the message text so the agent sees clean input.
     */
    protected abstract stripBotMention(text: string): string;

    /**
     * Look up the email address for a platform user ID.
     * Used for mapping platform identity to MJ user.
     *
     * @param platformUserId - Platform-specific user ID.
     * @param message - Optional incoming message (carries platform turn context when needed).
     * @returns Email address, or `null` if not available.
     */
    protected abstract lookupUserEmail(platformUserId: string, message?: IncomingMessage): Promise<string | null>;

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
    protected matchAgentMentions(text: string, candidateAgents?: MJAIAgentEntityExtended[]): string[] {
        const cleanText = this.stripBotMention(text);
        const agents = candidateAgents ?? this.availableAgents;

        // Pass 1: Exact full-name match with @ prefix (longest-first)
        const exactMatched = this.matchExactAgentNames(cleanText, agents);
        if (exactMatched.length > 0) return exactMatched;

        // Pass 2: First-word prefix match with @ prefix — "@Codesmith" matches "Codesmith Agent"
        const prefixMatched = this.matchPrefixAgentNames(cleanText, agents);
        if (prefixMatched.length > 0) return prefixMatched;

        // Pass 3: Bare name match (no @ required) — handles "@Bot marketing agent help"
        // where the @ was consumed by the bot mention. Only matches at the start of
        // the message to avoid false positives in regular text.
        const bareMatched = this.matchBareAgentNames(cleanText, agents);
        if (bareMatched.length > 0) return bareMatched;

        // Pass 4: Agent name anywhere in the message — handles "write a blog for me marketing agent"
        // where the agent name is at the end or middle. Only matches full agent names
        // with word boundaries, longest-first, to avoid false positives.
        const anywhereMatched = this.matchAnywhereAgentNames(cleanText, agents);
        if (anywhereMatched.length > 0) return anywhereMatched;

        return [];
    }

    /**
     * Match @mentions against full agent names (exact match, case-insensitive).
     */
    private matchExactAgentNames(text: string, agents: MJAIAgentEntityExtended[]): string[] {
        const matched: string[] = [];
        for (const agent of agents) {
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
    private matchPrefixAgentNames(text: string, agents: MJAIAgentEntityExtended[]): string[] {
        // Extract @word tokens (single words after @)
        const mentionPattern = /@(\w+)/gi;
        const mentions: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = mentionPattern.exec(text)) !== null) {
            mentions.push(match[1]);
        }

        const matched: string[] = [];
        for (const mention of mentions) {
            const candidates = agents.filter(
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
    private matchBareAgentNames(text: string, agents: MJAIAgentEntityExtended[]): string[] {
        const trimmed = text.trim().toLowerCase();
        for (const agent of agents) {
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
    private matchAnywhereAgentNames(text: string, agents: MJAIAgentEntityExtended[]): string[] {
        const lowerText = text.trim().toLowerCase();
        const matched: string[] = [];
        for (const agent of agents) {
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
     * Resolve the active MJ user for the platform sender.
     *
     * Flow:
     * 1. If IncomingMessage has SenderEmail, look up an active user in `UserCache.Instance`
     * 2. If not, call `lookupUserEmail(message.SenderID, message)` then look up
     * 3. If no active MJ user matches:
     *    - When `AllowFallbackUser` is explicitly `true`, fall back to `ContextUserEmail`
     *    - Otherwise return `null` (fail closed)
     */
    protected async resolveContextUser(message: IncomingMessage): Promise<UserInfo | null> {
        let email: string | undefined = message.SenderEmail;

        if (!email) {
            try {
                email = await this.lookupUserEmail(message.SenderID, message) ?? undefined;
            } catch (error) {
                LogError('Failed to look up user email from platform:', undefined, error);
            }
        }

        if (email) {
            // UserCache.Instance, never `new UserCache()`: UserCache extends BaseSingleton, whose
            // constructor RETURNS the existing shared instance — and then the subclass field
            // initializer (`_users = []`) runs against that returned instance. So `new` both
            // EMPTIES the process-wide user cache and reads back an empty list: the lookup below
            // could never succeed, and the whole server lost its user cache until the next
            // auto-refresh tick.
            const normalizedEmail = email.trim().toLowerCase();
            const userCache = UserCache.Instance;
            const mjUser = userCache.Users.find(
                (u: UserInfo) => u.Email?.trim().toLowerCase() === normalizedEmail
            );
            if (mjUser && mjUser.IsActive !== false) {
                return mjUser;
            }
        }

        if (this.settings.AllowFallbackUser === true) {
            LogStatus(
                `${this.PlatformName}: sender '${SanitizeForLog(message.SenderID)}' did not match an active MJ user; ` +
                `using fallback service account (AllowFallbackUser=true)`
            );
            return this.fallbackContextUser!;
        }

        LogStatus(
            `${this.PlatformName}: refusing message from unmapped or inactive sender '${SanitizeForLog(message.SenderID)}' ` +
            `(set AllowFallbackUser: true to permit service-account fallback)`
        );
        return null;
    }

    /**
     * Whether an agent ID satisfies the optional `AllowedAgentIDs` host allow-list.
     * Returns `true` when no allow-list is configured.
     */
    protected isAgentAllowedByConfig(agentId: string | null | undefined): boolean {
        if (this.allowedAgentIds === null) {
            return true;
        }
        return !!agentId && this.allowedAgentIds.Has(agentId);
    }

    /**
     * Evaluate whether `contextUser` may directly invoke `agent` through this adapter.
     *
     * Checks in deterministic order (matching `ResolveHandoffTarget`):
     * 1. Active status (checks live `AIEngineBase` cache when populated)
     * 2. `canView` permission — unviewable agents return `'NotFound'` so existence never leaks
     * 3. `AIAgentPermissionHelper.IsDirectlyDiscoverable` (blocks Sub-Agents, children, Required templates)
     * 4. `AllowedAgentIDs` host allow-list
     * 5. `canRun` permission (including Ancestor `CanRun` Invariant for derived agents)
     *
     * Fails closed on any permission evaluation error.
     */
    protected async evaluateAgentAccess(
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo
    ): Promise<AgentAccessVerdict> {
        const cached = AIEngineBase.Instance.Agents?.find(a => UUIDsEqual(a.ID, agent.ID));
        const liveAgent = cached ?? agent;
        if (liveAgent.Status != null && liveAgent.Status !== 'Active') {
            return 'NotFound';
        }

        let effective: { canView: boolean; canRun: boolean };
        try {
            effective = await AIAgentPermissionHelper.GetEffectivePermissions(liveAgent.ID, contextUser);
        } catch (error) {
            LogError(`Failed to evaluate permissions for agent ${liveAgent.ID}:`, undefined, error);
            return 'NotFound';
        }

        if (!effective.canView) {
            return 'NotFound';
        }
        if (!AIAgentPermissionHelper.IsDirectlyDiscoverable(liveAgent)) {
            return 'NotDiscoverable';
        }
        if (!this.isAgentAllowedByConfig(liveAgent.ID)) {
            return 'NotAllowedHere';
        }
        if (!effective.canRun) {
            return 'NoRunPermission';
        }
        return 'Allowed';
    }

    /**
     * Resolve which agent to use for this message, enforcing discoverability,
     * `AllowedAgentIDs`, and per-user `CanView`/`CanRun` permissions across all paths
     * (explicit `@mention`, thread affinity, and default agent).
     */
    protected async resolveAgent(
        message: IncomingMessage,
        contextUser: UserInfo,
        threadHistory: IncomingMessage[] = [],
        rememberedAgentId?: string
    ): Promise<ResolveAgentResult> {
        const rawType = message.RawEvent?.['type'];
        const isProgrammaticMention = rawType === 'slash_command' || rawType === 'form_submit';
        let mentionedNames = message.MentionedAgentNames ?? [];

        // Re-evaluate text mentions strictly against agents this user can view so:
        // 1. Unviewable agents never match or leak their resolved names via any matcher pass.
        // 2. Hidden agents never interfere with prefix/anywhere ambiguity counts for visible agents.
        // Programmatic mentions (slash commands, form submits) and explicitly supplied unknown or
        // non-discoverable names (not drawn from availableAgents) are preserved for authorization.
        if (!isProgrammaticMention && message.Text) {
            const allFromAvailable = mentionedNames.every(name =>
                this.availableAgents.some(a => a.Name != null && a.Name.toLowerCase() === name.trim().toLowerCase())
            );
            if (mentionedNames.length === 0 || allFromAvailable) {
                const viewableAgents = await this.getViewableAvailableAgents(contextUser);
                const viewableMatches = this.matchAgentMentions(message.Text, viewableAgents);
                if (viewableMatches.length > 0 || mentionedNames.length > 0) {
                    // Only overwrite when text matching itself was what produced mentions (or could
                    // recover a visible match previously suppressed by a hidden-agent ambiguity).
                    const unfilteredTextMatches = this.matchAgentMentions(message.Text, this.availableAgents);
                    const mentionsCameFromText =
                        mentionedNames.length === 0 ||
                        (mentionedNames.length === unfilteredTextMatches.length &&
                            mentionedNames.every((m, idx) => m.toLowerCase() === unfilteredTextMatches[idx]?.toLowerCase()));
                    if (mentionsCameFromText) {
                        mentionedNames = viewableMatches;
                    }
                }
            }
        }

        if (mentionedNames.length === 0) {
            return this.resolveUnmentionedAgent(threadHistory, contextUser, rememberedAgentId);
        }

        return this.resolveMentionedAgent(message, mentionedNames, threadHistory, contextUser, rememberedAgentId);
    }

    /**
     * Resolve an agent when the current message has no explicit agent mentions:
     * checks the remembered agent that actually served this thread first, then falls back
     * to viewable thread-history mentions, then the default agent — verifying access for
     * `contextUser` in all cases.
     */
    private async resolveUnmentionedAgent(
        threadHistory: IncomingMessage[],
        contextUser: UserInfo,
        rememberedAgentId?: string
    ): Promise<ResolveAgentResult> {
        if (rememberedAgentId) {
            const rememberedOutcome = await this.resolveRememberedAgent(rememberedAgentId, contextUser);
            if (rememberedOutcome.agent) {
                return { agent: rememberedOutcome.agent, multiAgentNote: null };
            }
            if (rememberedOutcome.refusalMessage) {
                return { agent: null, multiAgentNote: null, refusalMessage: rememberedOutcome.refusalMessage };
            }
        }
        const threadOutcome = await this.resolveThreadAgent(threadHistory, contextUser);
        if (threadOutcome.agent) {
            return { agent: threadOutcome.agent, multiAgentNote: null };
        }
        if (threadOutcome.refusalMessage) {
            return { agent: null, multiAgentNote: null, refusalMessage: threadOutcome.refusalMessage };
        }
        return this.authorizeDefaultAgent(contextUser, null);
    }

    /**
     * Authorize the agent remembered from the active MJ Conversation (used on platforms like
     * Teams where platform thread history is unavailable), enforcing permissions for `contextUser`
     * without leaking hidden agent names.
     */
    private async resolveRememberedAgent(
        agentId: string,
        contextUser: UserInfo
    ): Promise<{ agent: MJAIAgentEntityExtended | null; refusalMessage?: string }> {
        const catalog = this.allActiveAgents.length > 0 ? this.allActiveAgents : this.availableAgents;
        const candidate = catalog.find(a => UUIDsEqual(a.ID, agentId));
        if (!candidate) {
            return { agent: null };
        }
        const verdict = await this.evaluateAgentAccess(candidate, contextUser);
        if (verdict === 'Allowed') {
            LogStatus(`Conversation affinity: routing to '${candidate.Name}' (last agent in conversation)`);
            return { agent: candidate };
        }
        if (verdict === 'NotFound') {
            return {
                agent: null,
                refusalMessage: "You don't have permission to interact with the agent in this conversation.",
            };
        }
        return {
            agent: null,
            refusalMessage: this.formatAccessRefusal(verdict, candidate.Name ?? 'agent'),
        };
    }

    /**
     * Resolve an agent when `MentionedAgentNames` is non-empty, enforcing view/run/discoverability/
     * allow-list checks without leaking the existence of agents `contextUser` cannot view.
     */
    private async resolveMentionedAgent(
        _message: IncomingMessage,
        mentionedNames: string[],
        threadHistory: IncomingMessage[],
        contextUser: UserInfo,
        rememberedAgentId?: string
    ): Promise<ResolveAgentResult> {
        // Evaluate every mentioned name and drop entries that only matched an agent `contextUser`
        // cannot view. Treating hidden agents identically to no match eliminates both full-name
        // leaks (via prefix expansion or multi-mention notes) and existence oracles.
        const evaluated: Array<{
            requestedName: string;
            lookup: { agent: MJAIAgentEntityExtended | null; refusalMessage?: string; matchedHiddenAgent?: boolean };
        }> = [];
        for (const name of mentionedNames) {
            const lookup = await this.findAuthorizedAgentByName(name, contextUser);
            if (lookup.matchedHiddenAgent) {
                continue;
            }
            evaluated.push({ requestedName: name, lookup });
        }

        if (evaluated.length === 0) {
            return this.resolveUnmentionedAgent(threadHistory, contextUser, rememberedAgentId);
        }

        const first = evaluated[0];
        if (first.lookup.agent) {
            const name = first.lookup.agent.Name ?? 'Agent';
            const otherNames = evaluated.slice(1).map(e => e.lookup.agent?.Name ?? e.requestedName);
            const multiAgentNote = otherNames.length > 0
                ? `_Note: Only one agent can be addressed per message. Routing to **${name}**. Other mentioned agents (${otherNames.join(', ')}) were not invoked._`
                : null;
            return { agent: first.lookup.agent, multiAgentNote };
        }

        if (first.lookup.refusalMessage) {
            return { agent: null, multiAgentNote: null, refusalMessage: first.lookup.refusalMessage };
        }

        // Genuinely unknown agent name — fall back to default if permitted, listing ONLY
        // agents this user may view and run.
        const firstAgentName = first.requestedName;
        const permittedAgents = await this.getPermittedAvailableAgents(contextUser);
        const agentNames = permittedAgents.map(a => a.Name ?? '').filter(Boolean).join(', ');
        LogStatus(`Agent '${SanitizeForLog(firstAgentName)}' not found for user '${contextUser.ID}', checking default agent.`);

        const defaultName = this.defaultAgent!.Name ?? 'default agent';
        const helpNote = agentNames
            ? `_I couldn't find an agent named "${firstAgentName}". Available agents: ${agentNames}. Routing to **${defaultName}**._`
            : `_I couldn't find an agent named "${firstAgentName}". Routing to **${defaultName}**._`;

        return this.authorizeDefaultAgent(contextUser, helpNote);
    }

    /**
     * Authorize `this.defaultAgent` for `contextUser`, returning a refusal when the user
     * lacks permission to run the default agent.
     */
    private async authorizeDefaultAgent(
        contextUser: UserInfo,
        multiAgentNote: string | null
    ): Promise<ResolveAgentResult> {
        const verdict = await this.evaluateAgentAccess(this.defaultAgent!, contextUser);
        if (verdict === 'Allowed') {
            return { agent: this.defaultAgent!, multiAgentNote };
        }
        const defaultName = this.defaultAgent!.Name ?? 'default agent';
        LogStatus(`Refusing default agent '${defaultName}' for user '${contextUser.ID}': ${verdict}`);
        return {
            agent: null,
            multiAgentNote: null,
            refusalMessage: this.formatAccessRefusal(verdict, defaultName),
        };
    }

    /**
     * Look up an agent by name (case-insensitive, trimmed) across all active agents,
     * evaluating access for `contextUser` in deterministic UUID order.
     */
    private async findAuthorizedAgentByName(
        requestedName: string,
        contextUser: UserInfo
    ): Promise<{ agent: MJAIAgentEntityExtended | null; refusalMessage?: string; matchedHiddenAgent?: boolean }> {
        const normalized = requestedName.trim().toLowerCase();
        const catalog = this.allActiveAgents.length > 0 ? this.allActiveAgents : this.availableAgents;
        const candidates = catalog
            .filter(a => a.Name != null && a.Name.trim().toLowerCase() === normalized)
            .sort((a, b) => NormalizeUUID(a.ID).localeCompare(NormalizeUUID(b.ID)));

        if (candidates.length === 0) {
            return { agent: null };
        }

        let firstViewableRefusal: { verdict: Exclude<AgentAccessVerdict, 'Allowed' | 'NotFound'>; name: string } | null = null;
        let sawHiddenMatch = false;

        for (const candidate of candidates) {
            const verdict = await this.evaluateAgentAccess(candidate, contextUser);
            if (verdict === 'Allowed') {
                return { agent: candidate };
            }
            if (verdict === 'NotFound') {
                sawHiddenMatch = true;
                continue;
            }
            firstViewableRefusal ??= { verdict, name: candidate.Name ?? requestedName };
        }

        if (firstViewableRefusal) {
            LogStatus(
                `Refusing agent '${firstViewableRefusal.name}' for user '${contextUser.ID}': ${firstViewableRefusal.verdict}`
            );
            return {
                agent: null,
                refusalMessage: this.formatAccessRefusal(firstViewableRefusal.verdict, firstViewableRefusal.name),
            };
        }

        return { agent: null, matchedHiddenAgent: sawHiddenMatch };
    }

    /** Format a user-safe refusal message for a viewable-but-blocked agent. */
    private formatAccessRefusal(verdict: Exclude<AgentAccessVerdict, 'Allowed'>, agentName: string): string {
        switch (verdict) {
            case 'NoRunPermission':
                return `You don't have permission to run **${agentName}**.`;
            case 'NotAllowedHere':
                return `**${agentName}** is not available in this app.`;
            case 'NotDiscoverable':
                return `**${agentName}** cannot be invoked directly.`;
            case 'NotFound':
                return "You don't have permission to run an agent for this request.";
        }
    }

    /**
     * Filter `this.availableAgents` to agents `contextUser` is permitted to view (excluding
     * unviewable or inactive agents, while keeping viewable agents that lack `CanRun` so an
     * explicit `@mention` still yields a clear run-permission refusal).
     */
    private async getViewableAvailableAgents(contextUser: UserInfo): Promise<MJAIAgentEntityExtended[]> {
        const viewable: MJAIAgentEntityExtended[] = [];
        for (const agent of this.availableAgents) {
            if ((await this.evaluateAgentAccess(agent, contextUser)) !== 'NotFound') {
                viewable.push(agent);
            }
        }
        return viewable;
    }

    /**
     * Filter `this.availableAgents` to only the agents `contextUser` is permitted to view and run.
     */
    private async getPermittedAvailableAgents(contextUser: UserInfo): Promise<MJAIAgentEntityExtended[]> {
        const permitted: MJAIAgentEntityExtended[] = [];
        for (const agent of this.availableAgents) {
            if ((await this.evaluateAgentAccess(agent, contextUser)) === 'Allowed') {
                permitted.push(agent);
            }
        }
        return permitted;
    }

    /**
     * Look through the thread history to find the agent that was originally invoked,
     * enforcing permissions for the *current* message's `contextUser`.
     *
     * Matches earlier human messages strictly against agents `contextUser` can view and
     * skips unviewable mentions so an unverified history mention (e.g. a user starting a
     * thread with `@hidden` and replying) cannot confirm a hidden agent's existence.
     * Threads actually served by a restricted agent are gated via `resolveRememberedAgent`
     * using the `lastAgentId` recorded when that agent ran.
     */
    private async resolveThreadAgent(
        threadHistory: IncomingMessage[],
        contextUser: UserInfo
    ): Promise<{ agent: MJAIAgentEntityExtended | null; refusalMessage?: string }> {
        if (threadHistory.length === 0) return { agent: null };

        const viewableAgents = await this.getViewableAvailableAgents(contextUser);

        // Walk through thread messages (oldest first) looking for user messages with agent mentions
        for (const msg of threadHistory) {
            // Skip bot messages — this bot's own, AND any other bot's. Another agent's reply
            // names that agent in its own prose ("I'm Sage, ..."), which the mention matcher
            // below reads as a user asking for it, letting one bot steal a thread that belongs
            // to another. Only humans establish thread affinity.
            if (this.isSelf(msg.SenderID) || this.isBotAuthored(msg)) continue;

            // Match strictly against agents this user can view (never adapter-wide).
            const mentions = msg.MentionedAgentNames ?? this.matchAgentMentions(msg.Text, viewableAgents);
            for (const mention of mentions) {
                const lookup = await this.findAuthorizedAgentByName(mention, contextUser);
                if (lookup.agent) {
                    LogStatus(`Thread affinity: routing to '${lookup.agent.Name}' (mentioned in thread message ${msg.MessageID})`);
                    return { agent: lookup.agent };
                }
                if (lookup.refusalMessage) {
                    return { agent: null, refusalMessage: lookup.refusalMessage };
                }
                // Unviewable mention (matchedHiddenAgent) is skipped as no match so thread
                // replies cannot act as an existence oracle for hidden agents that never ran.
            }
        }

        return { agent: null };
    }

    /** Send a user-safe refusal message without invoking any agent. */
    private async sendRefusal(message: IncomingMessage, refusalText: string): Promise<void> {
        if (!this.defaultAgent) {
            LogError(`${this.PlatformName}: cannot send refusal — defaultAgent is not initialized`);
            return;
        }
        const formatted = await this.formatResponse(null, this.defaultAgent, refusalText);
        await this.sendFinalMessage(message, formatted);
    }

    /**
     * Execute the agent and send the response, with streaming support.
     * Handles handoffs automatically via `AgentRunner.FollowHandoffs`, and falls back to
     * `detectDelegation` / `handleDelegation` when an older agent emits `payload.invokeAgent`
     * or delegation prose without returning `NextStep: 'Handoff'`.
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
        multiAgentNote: string | null,
        existingConversationId?: string
    ): Promise<void> {
        // Look up the MJ Conversation for this thread (or reuse the one resolved in handleMessageForThread).
        // HandleMessage serializes same-thread turns, so by the time a follow-up message gets here
        // the earlier turn has finished and stored the id below; RunAgentInConversation creates the
        // conversation when there is none yet.
        const threadKey = this.getThreadKey(message);
        const resolvedExistingConversationId = existingConversationId
            ?? this.getThreadConversationId(threadKey, this.resolveIdleTimeoutMs(message));

        let agentResult: ConversationAgentResult;
        try {
            agentResult = await this.runAgentWithStreaming(
                message, agent, contextUser, conversationMessages, resolvedExistingConversationId
            );
        } catch (error) {
            // runAgentWithStreaming already sent an error message to the user
            LogError('executeAgentAndRespond caught error from runAgentWithStreaming:', undefined, error);
            return;
        }

        const { result, progressMessageId, artifactId, conversationId } = agentResult;

        // Store the conversation ID + answering agent for future messages in this thread
        const entryIdleTimeoutMs = this.resolveIdleTimeoutMs(message);
        if (conversationId) {
            this.setThreadConversationId(threadKey, conversationId, agent.ID, entryIdleTimeoutMs);
        }

        // First-class Handoff step: follow the handoff chain via AgentRunner.FollowHandoffs
        if (result.handoff && !this.settings.DisableDelegation) {
            const runner = new AgentRunner();
            let activeProgressMessageId: string | null | undefined = progressMessageId;
            const updateInterval = this.settings.StreamingUpdateIntervalMs ?? 1000;

            const outcomes = await runner.FollowHandoffs({
                params: { ...agentResult.params, conversationMessages },
                sourceResult: result,
                conversationId: conversationId ?? '',
                sourceConversationDetailId: agentResult.agentResponseDetailId ?? '',
                createArtifacts: true,
                hooks: {
                    OnHopStart: async (hopInfo, source) => {
                        const sourceName = hopInfo.sourceAgent.Name ?? 'Agent';
                        const targetName = hopInfo.targetAgent.Name ?? 'Agent';
                        const presetDisplay = hopInfo.preset
                            ? (hopInfo.preset.DisplayName || hopInfo.preset.Name)
                            : null;
                        const presetSuffix = presetDisplay ? ` (${presetDisplay})` : '';
                        const transferLine = `${sourceName} transferred you to **${targetName}**${presetSuffix}`;
                        const sourceMessage = source.agentResult.agentRun?.Message?.trim();
                        const transferBody = sourceMessage && !this.looksLikeJSON(sourceMessage)
                            ? `${sourceMessage}\n\n${transferLine}`
                            : transferLine;
                        const fullTransferNote = hopInfo.hopIndex === 0 && multiAgentNote
                            ? `${multiAgentNote}\n\n${transferBody}`
                            : transferBody;

                        const formattedTransfer = await this.formatResponse(
                            source.agentResult,
                            hopInfo.sourceAgent,
                            fullTransferNote,
                            { ConversationId: conversationId }
                        );
                        if (activeProgressMessageId) {
                            await this.updateFinalMessage(message, activeProgressMessageId, formattedTransfer);
                        } else {
                            await this.sendFinalMessage(message, formattedTransfer);
                        }

                        const thinkingText = `_${targetName} is thinking..._`;
                        let hopProgressMessageId: string | null = await this.sendOrUpdateStreamingMessage(
                            message,
                            thinkingText,
                            null,
                            hopInfo.targetAgent
                        );
                        activeProgressMessageId = hopProgressMessageId;
                        let hopStreamBuffer = '';
                        let hopLastUpdateTime = Date.now();

                        return {
                            onProgress: (progress) => {
                                if (progress.displayMode === 'historical') return;
                                const stepCount = (progress.metadata?.stepCount as number) ?? undefined;
                                const stepNumber = (progress.metadata?.stepNumber as number) ?? undefined;
                                const stepSuffix = stepNumber != null && stepCount != null
                                    ? ` (Step ${stepNumber} of ${stepCount})`
                                    : '';
                                const progressLabel = `_${progress.message}${stepSuffix}_`;
                                if (!hopStreamBuffer) {
                                    const now = Date.now();
                                    if (now - hopLastUpdateTime >= updateInterval) {
                                        hopLastUpdateTime = now;
                                        this.sendOrUpdateStreamingMessage(
                                            message, progressLabel, hopProgressMessageId, hopInfo.targetAgent
                                        ).then(msgId => {
                                            hopProgressMessageId = msgId;
                                            activeProgressMessageId = msgId;
                                        }).catch((err) => {
                                            LogError('Progress update failed:', undefined, err);
                                        });
                                    }
                                }
                            },
                            onStreaming: (chunk) => {
                                hopStreamBuffer += chunk.content;
                                const now = Date.now();
                                if (now - hopLastUpdateTime >= updateInterval) {
                                    hopLastUpdateTime = now;
                                    this.sendOrUpdateStreamingMessage(
                                        message, hopStreamBuffer, hopProgressMessageId, hopInfo.targetAgent
                                    ).then(msgId => {
                                        hopProgressMessageId = msgId;
                                        activeProgressMessageId = msgId;
                                    }).catch((err) => {
                                        LogError('Streaming update failed:', undefined, err);
                                    });
                                }
                            },
                        };
                    },
                    OnHopEnd: async (hopInfo, outcome) => {
                        if (outcome.agentResult?.handoff) {
                            // Another hop is requested; defer finalizing activeProgressMessageId
                            // until the next hop starts (or is refused after the loop).
                            return;
                        }
                        if (outcome.agentResult) {
                            const candidateArtifactId = outcome.artifactInfo?.artifactId;
                            const hopArtifactId = candidateArtifactId
                                && (await this.isUserVisibleArtifact(candidateArtifactId, contextUser))
                                ? candidateArtifactId
                                : undefined;
                            await this.sendAgentResult(
                                message,
                                hopInfo.targetAgent,
                                outcome.agentResult,
                                null,
                                { ArtifactId: hopArtifactId, ConversationId: conversationId },
                                activeProgressMessageId
                            );
                            activeProgressMessageId = null;
                        } else if (outcome.error) {
                            const errorMessage = "I'm sorry, I encountered an error processing your request. Please try again.";
                            const errorFormatted = await this.formatResponse(
                                null,
                                hopInfo.targetAgent,
                                errorMessage,
                                { ConversationId: conversationId }
                            );
                            if (activeProgressMessageId) {
                                await this.updateFinalMessage(message, activeProgressMessageId, errorFormatted);
                            } else {
                                await this.sendFinalMessage(message, errorFormatted);
                            }
                            activeProgressMessageId = null;
                        }
                    },
                },
            });

            if (outcomes.length === 0) {
                // Hop 0 target was refused before OnHopStart ran; deliver the source result.
                const metadata: AgentResponseMetadata = { ArtifactId: artifactId, ConversationId: conversationId };
                await this.sendAgentResult(message, agent, result, multiAgentNote, metadata, activeProgressMessageId);
            } else {
                const lastOutcome = outcomes[outcomes.length - 1];
                if (conversationId && lastOutcome.targetAgent?.ID) {
                    this.setThreadConversationId(threadKey, conversationId, lastOutcome.targetAgent.ID, entryIdleTimeoutMs);
                }
                if (activeProgressMessageId != null && lastOutcome.agentResult) {
                    // A subsequent hop requested another handoff that was refused before OnHopStart ran;
                    // finalize the last target's open streaming message.
                    const candidateArtifactId = lastOutcome.artifactInfo?.artifactId;
                    const hopArtifactId = candidateArtifactId
                        && (await this.isUserVisibleArtifact(candidateArtifactId, contextUser))
                        ? candidateArtifactId
                        : undefined;
                    await this.sendAgentResult(
                        message,
                        lastOutcome.targetAgent,
                        lastOutcome.agentResult,
                        null,
                        { ArtifactId: hopArtifactId, ConversationId: conversationId },
                        activeProgressMessageId
                    );
                }
            }
            return;
        }

        // Fallback for non-Handoff agents: payload.invokeAgent or delegation prose indicates a handoff
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
        await this.sendAgentResult(message, agent, result, multiAgentNote, metadata, progressMessageId);
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

        // When AllowedAgentIDs is configured, propagate it through ALL_AVAILABLE_AGENTS so
        // downstream BaseAgent decision discovery, task graph validation, and FollowHandoffs
        // enforce the exact same host allow-list, narrowed to agents this user can actually run
        // (matching ConversationAgentRunner and keeping hidden agent descriptions out of data).
        const hostAllowedData = this.settings.AllowedAgentIDs !== undefined
            ? {
                ALL_AVAILABLE_AGENTS: (await this.getPermittedAvailableAgents(contextUser)).map(a => ({
                    ID: a.ID,
                    Name: a.Name,
                    Description: a.Description,
                })),
            }
            : undefined;

        const params: ExecuteAgentParams = {
            agent,
            conversationMessages: [...conversationMessages],
            contextUser,
            payload: {}, // Provide empty starting payload so loop agents can apply payloadChangeRequests
            ...(hostAllowedData ? { data: hostAllowedData } : {}),
            handoffChain: this.settings.DisableDelegation ? undefined : [],
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

            // Only link an artifact the user is meant to see. MJ marks an artifact
            // `Visibility = 'System Only'` when the agent's ArtifactCreationMode says so — the
            // Explorer UI hides those, but the link we post does not, so a run whose payload was
            // internal state (a loop agent's scratch payload) offered "view the artifact" and
            // opened raw JSON. Checked on the artifact itself rather than the agent's mode,
            // because a System-Only agent can still produce a user-facing FILE artifact.
            const candidateArtifactId = conversationResult.artifactInfo?.artifactId;
            const artifactId = candidateArtifactId
                && (await this.isUserVisibleArtifact(candidateArtifactId, contextUser))
                ? candidateArtifactId
                : undefined;

            return {
                result: conversationResult.agentResult,
                progressMessageId,
                artifactId,
                conversationId: conversationResult.conversationId,
                agentResponseDetailId: conversationResult.agentResponseDetailId,
                params,
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
    /** Cached environment lookup — messaging adapters are long-lived and single-environment. */
    private cachedEnvironmentID: string | null = null;
    private async resolveEnvironmentID(contextUser: UserInfo): Promise<string | null> {
        if (this.cachedEnvironmentID) return this.cachedEnvironmentID;
        const res = await new RunView().RunView<{ ID: string }>(
            { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1, SkipTotalRowCount: true },
            contextUser,
        );
        this.cachedEnvironmentID = res.Results?.[0]?.ID ?? null;
        if (!this.cachedEnvironmentID) {
            LogError('[BaseMessagingAdapter] Could not resolve an Environment; task graphs cannot be submitted.');
        }
        return this.cachedEnvironmentID;
    }

    protected detectDelegation(result: ExecuteAgentResult): string | null {
        // A bot pinned to one agent must not be delegated away from it. Checked before any
        // strategy runs, because Strategy 3 below reads the reply TEXT — so an orchestrator
        // agent describing its own routing role would hand the conversation to whichever agent
        // it happened to name, under this bot's identity and with no attribution.
        if (this.settings.DisableDelegation) return null;
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
     * Handle fallback agent delegation (for non-Handoff agents that emit `payload.invokeAgent`
     * or delegation prose): send a delegation note, then auto-execute the target agent.
     *
     * 1. Resolve and validate the target agent via `ResolveHandoffTarget`
     * 2. Show the delegating agent's message (e.g., "Delegating to Marketing Agent")
     * 3. Execute the target agent with the same conversation context
     * 4. Send the target agent's result
     *
     * Supports chained delegation up to MAX_HANDOFF_HOPS.
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
        conversationId?: string,
        handoffChain?: string[]
    ): Promise<void> {
        const currentChain = handoffChain ?? [];

        // Prevent infinite delegation loops
        if (hopCount >= MAX_HANDOFF_HOPS) {
            LogError(`Delegation loop detected: exceeded ${MAX_HANDOFF_HOPS} hops`);
            await this.sendAgentResult(message, sourceAgent, sourceResult, multiAgentNote);
            return;
        }

        // Resolve and validate the target agent via ResolveHandoffTarget (enforcing live Active
        // status, ParentID, IsDirectlyDiscoverable, AllowedAgentIDs, view/run permissions, cycle
        // checks, and MAX_HANDOFF_HOPS). Prefer live AIEngineBase.Instance.Agents so agents
        // deactivated after Initialize() cannot be reached via fallback delegation.
        const liveAgents = AIEngineBase.Instance.Agents;
        const resolution = await ResolveHandoffTarget({
            AgentName: targetAgentName,
            SourceAgentID: sourceAgent.ID,
            HandoffChain: currentChain,
            HostAllowedIDs: this.settings.AllowedAgentIDs,
            ContextUser: contextUser,
            Agents: liveAgents && liveAgents.length > 0 ? liveAgents : this.availableAgents,
        });
        if (resolution.Refusal || !resolution.Target) {
            LogError(
                `Delegation target '${targetAgentName}' refused (${resolution.Refusal?.Reason ?? 'NotFound'}): ${resolution.Refusal?.Message ?? 'Target not found'}`
            );
            await this.sendAgentResult(message, sourceAgent, sourceResult, multiAgentNote);
            return;
        }
        const targetAgent = resolution.Target;

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
            const resolvedTargetConvoId = targetAgentResult.conversationId ?? conversationId;
            if (resolvedTargetConvoId && targetAgent.ID) {
                this.setThreadConversationId(
                    this.getThreadKey(message),
                    resolvedTargetConvoId,
                    targetAgent.ID,
                    this.resolveIdleTimeoutMs(message)
                );
            }

            // Check if the target agent also delegates
            const nextDelegation = this.detectDelegation(targetAgentResult.result);
            if (nextDelegation) {
                const nextChain = sourceAgent.ID ? [...currentChain, sourceAgent.ID] : currentChain;
                await this.handleDelegation(
                    message, targetAgent, targetAgentResult.result, nextDelegation,
                    contextUser, updatedMessages, null, hopCount + 1,
                    targetAgentResult.conversationId ?? conversationId,
                    nextChain
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
        metadata?: AgentResponseMetadata,
        progressMessageId?: string | null
    ): Promise<void> {
        const responseText = this.extractResponseText(result);
        const fullResponse = multiAgentNote
            ? multiAgentNote + '\n\n' + responseText
            : responseText;

        const formatted = await this.formatResponse(result, agent, fullResponse, metadata);
        if (progressMessageId) {
            await this.updateFinalMessage(message, progressMessageId, formatted);
        } else {
            await this.sendFinalMessage(message, formatted);
        }

        // Deliver binary output as real platform files, AFTER the text reply is posted.
        //
        // Two sources, neither of which the message renderers can show:
        //   - `mediaOutputs` — generated images arrive as base64, and the block/card builders can
        //     only render media that already has a public https URL, so they were silently dropped.
        //   - inlined file data URIs on actionable commands — MJ's document actions embed a whole
        //     generated file as `data:<mime>;base64,...` when no file storage account is
        //     configured. Unusable as a link (see isOpenableURI), but the bytes are right there.
        //
        // Failures are logged and swallowed: the text reply has already posted, and an upload
        // problem must not turn a delivered answer into an error.
        if (this.uploadMediaOutputs) {
            // De-duplicated by payload, in preference order. A document action puts the file in
            // `fileOutputs` AND the model often repeats the same base64 back as an `open:url`
            // command, so an un-deduped union uploads the identical file twice — and both copies
            // count against the platform's per-reply file cap.
            const attachments: UploadableFile[] = [];
            const seen = new Set<string>();
            for (const file of [
                ...(result.mediaOutputs ?? []),
                ...this.collectFileOutputAttachments(result),
                ...this.collectInlineFileAttachments(result),
            ]) {
                if (file.data && seen.has(file.data)) continue;
                if (file.data) seen.add(file.data);
                attachments.push(file);
            }
            if (attachments.length > 0) {
                try {
                    await this.uploadMediaOutputs(message, attachments);
                } catch (error) {
                    LogError('Failed to upload agent output files (the text reply already posted):', undefined, error);
                }
            }
        }
    }

    /**
     * Collect the files an agent produced, from the run's own `fileOutputs`.
     *
     * This is the canonical source — `fileOutputs` is what MJ turns into file artifacts — and it
     * carries the real filename and MIME type rather than leaving them to be guessed. Entries
     * already saved to storage (`fileId`, no `fileData`) are skipped: those have a durable
     * location, and re-uploading their bytes to chat is not this method's job.
     *
     * Preferred over {@link collectInlineFileAttachments}, which depends on the model choosing to
     * emit a `data:` URI — it does so only sometimes, so relying on it meant a generated document
     * reached chat on one run and not the next.
     */
    protected collectFileOutputAttachments(result: ExecuteAgentResult): UploadableFile[] {
        return (result.fileOutputs ?? [])
            .filter((o: FileOutputRef): o is FileOutputRef & { fileData: string } => !!o.fileData)
            .map((o) => ({
                modality: 'file',
                mimeType: o.mimeType,
                data: o.fileData,
                fileName: o.fileName,
                label: o.fileName,
            }));
    }

    /**
     * Harvest files that an agent inlined as `data:` URIs on its actionable commands.
     *
     * MJ's document actions fall back to embedding the generated file itself when no file storage
     * account is configured. That URI cannot be opened from a chat client, so the file is decoded
     * here and handed to the platform's uploader as an ordinary attachment.
     */
    protected collectInlineFileAttachments(result: ExecuteAgentResult): UploadableFile[] {
        const files: UploadableFile[] = [];

        for (const cmd of result.actionableCommands ?? []) {
            if (cmd.type !== 'open:url') continue;
            // The scheme is lower-cased first: the guard that DROPS these buttons is
            // case-insensitive, so an upper-case `DATA:` URI would otherwise be suppressed as a
            // link and never collected as a file — the note would promise an attachment that
            // never arrives.
            const parsed = parseBase64DataUrl(cmd.url.trim().replace(/^data:/i, 'data:'));
            if (!parsed) continue;
            files.push({
                modality: 'file',
                mimeType: parsed.mediaType,
                data: parsed.data,
                label: cmd.label,
                // No fileName: `OpenURLCommand` does not declare one, nothing in the repo emits
                // one, and the model-facing command contract never mentions the field — so the
                // adapter derives the name from the label and the MIME type instead.
            });
        }
        return files;
    }

    /**
     * Extract the user-facing response text from an `ExecuteAgentResult`.
     *
     * Mirrors MJ Explorer's approach: the data model itself tells us what's user-facing.
     * `agentRun.Message` is the field agents explicitly set for the user. Everything
     * else (structured payloads, step outputs) is internal agent state.
     *
     * We do NOT mine payloads for content — that approach requires hardcoding
     * agent-specific payload shapes and inevitably leaks internal LLM state
     * (research plans, orchestration metadata, etc.) to the user.
     *
     * When `Message` is a JSON blob (some agents dump structured payloads there),
     * we don't try to extract content from it. If an artifact exists, the
     * "View in MJ Explorer" link handles rendering. If not, we fall through
     * to a generic message rather than showing raw JSON.
     *
     * Fallback chain (only when Message is absent or is raw JSON):
     * 1. `agentRun.Message` — the primary human-readable field (skipped if JSON)
     * 2. `agentRun.FinalPayload` (`Result` on older rows) — simple string payload (skipped if JSON)
     * 3. Generic fallback message
     */
    private extractResponseText(result: ExecuteAgentResult): string {
        if (!result.success) {
            return this.extractErrorText(result);
        }

        // Primary: agentRun.Message — the explicit user-facing field
        const message = result.agentRun?.Message;
        if (message && typeof message === 'string' && message.trim()) {
            if (!this.looksLikeJSON(message)) {
                return message;
            }
            // Message is JSON — skip it, fall through to friendlier alternatives
        }

        // Fallback: the run payload as a simple string (Result on older rows)
        const runPayload = result.agentRun?.FinalPayload ?? result.agentRun?.Result;
        if (runPayload && typeof runPayload === 'string' && runPayload.trim()) {
            if (!this.looksLikeJSON(runPayload)) {
                return runPayload;
            }
        }

        return "I've completed your request. View the full result in MJ Explorer.";
    }

    /**
     * Quick check: does this string look like a JSON object or array?
     * Used to avoid showing raw JSON to users when agents dump structured
     * payloads into the Message field instead of human-readable text.
     */
    private looksLikeJSON(text: string): boolean {
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
        try {
            JSON.parse(trimmed);
            return true;
        } catch {
            return false;
        }
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
        } catch {
            LogStatus(`${this.PlatformName}: typing indicator failed (non-critical), continuing`);
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
        const messages: ChatMessage[] = [];

        for (const msg of history) {
            // Another bot's message is neither this agent's own turn nor anything the user said.
            // Left as a 'user' turn it fed a different agent's self-description into this
            // agent's context, and the model imitated it.
            if (!this.isSelf(msg.SenderID) && this.isBotAuthored(msg)) continue;
            const role = this.isSelf(msg.SenderID) ? 'assistant' : 'user';
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
            ExtraFilter: `Name='${EscapeSQLString(agentName)}'`,
            ResultType: 'entity_object'
        }, this.fallbackContextUser!);
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Default agent '${agentName}' not found. Verify the DefaultAgentName in your messaging adapter config.`);
        }
        const loaded = result.Results[0];
        if (!AIAgentPermissionHelper.IsDirectlyDiscoverable(loaded)) {
            throw new Error(
                `Default agent '${agentName}' (${loaded.ID}) is not directly discoverable (sub-agent, child agent, or instantiation-required template).`
            );
        }
        if (!this.isAgentAllowedByConfig(loaded.ID)) {
            throw new Error(
                `Default agent '${agentName}' (${loaded.ID}) is not in AllowedAgentIDs.`
            );
        }
        this.defaultAgent = loaded;
    }

    /**
     * Load all active agents and narrow `availableAgents` to directly-discoverable,
     * host-allowed (`AllowedAgentIDs`) agents, sorted longest-name-first to avoid
     * prefix collisions during mention matching.
     */
    private async loadAvailableAgents(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Status='Active'`,
            ResultType: 'entity_object'
        }, this.fallbackContextUser!);

        if (result.Success) {
            this.allActiveAgents = [...result.Results].sort(
                (a, b) => (b.Name?.length ?? 0) - (a.Name?.length ?? 0)
            );
            // Sort longest name first for greedy matching; exclude sub-agents and disallowed IDs
            this.availableAgents = this.allActiveAgents.filter(
                a => AIAgentPermissionHelper.IsDirectlyDiscoverable(a) && this.isAgentAllowedByConfig(a.ID)
            );
        } else {
            LogError('Failed to load available agents for name matching', undefined, result.ErrorMessage);
            this.allActiveAgents = [];
            this.availableAgents = [];
        }
    }

    /**
     * Resolve the fallback context user from the configured email.
     * @throws Error if the configured email cannot be found.
     */
    private async loadFallbackContextUser(): Promise<void> {
        // UserCache.Instance, never `new UserCache()` — see resolveContextUser for why `new`
        // wipes the shared cache. Here it made Initialize fail with "Fallback context user not
        // found" for EVERY configured email, on every deployment.
        const userCache = UserCache.Instance;
        const user = userCache.Users.find(
            (u: UserInfo) => u.Email?.toLowerCase() === this.settings.ContextUserEmail.toLowerCase()
        );

        if (!user) {
            throw new Error(
                `Fallback context user not found: '${this.settings.ContextUserEmail}'. ` +
                `Set the MJ_BOT_CONTEXT_USER_EMAIL environment variable to an email address ` +
                `that exists in your MJ Users table, or set Enabled: false in mj.config.cjs ` +
                `to disable this extension. See SETUP_GUIDE.md for details.`
            );
        }

        this.fallbackContextUser = user;
    }

    // ─── Conversation history, `/new` command, and thread map with idle rollover ──

    /**
     * Check whether the message begins with `/new` (after stripping bot mentions).
     * Supports both bare `/new` and `/new <prompt>`.
     */
    private parseNewConversationCommand(message: IncomingMessage): NewConversationCommandResult {
        const cleaned = this.stripBotMention(message.Text ?? '').trim();
        if (/^\/new$/i.test(cleaned)) {
            return { isNewCommand: true, remainingText: '' };
        }
        const match = /^\/new[ \t\r\n]+([\s\S]+)$/i.exec(cleaned);
        if (match) {
            return { isNewCommand: true, remainingText: match[1].trim() };
        }
        return { isNewCommand: false, remainingText: '' };
    }

    /**
     * Compute the effective idle rollover timeout (ms) for a message's conversation.
     * Rolling conversations (DMs, Teams group chats, Teams meetings) default to 2 hours;
     * explicit channel threads keep 24 hours unless `ConversationIdleTimeoutMs` is shorter.
     */
    private resolveIdleTimeoutMs(message: IncomingMessage): number {
        const configured = this.settings.ConversationIdleTimeoutMs;
        const hasValidConfigured = typeof configured === 'number' && Number.isFinite(configured) && configured > 0;
        if (this.IsRollingConversation(message)) {
            return hasValidConfigured ? configured : BaseMessagingAdapter.DEFAULT_ROLLING_IDLE_TIMEOUT_MS;
        }
        if (hasValidConfigured) {
            return Math.min(configured, BaseMessagingAdapter.THREAD_MAP_TTL_MS);
        }
        return BaseMessagingAdapter.THREAD_MAP_TTL_MS;
    }

    /**
     * Append the current incoming message (with bot mentions stripped) to an existing
     * list of prior `ChatMessage` turns.
     */
    private appendCurrentUserMessage(priorMessages: ChatMessage[], currentMessage: IncomingMessage): ChatMessage[] {
        const messages = [...priorMessages];
        const currentText = this.stripBotMention(currentMessage.Text).trim();
        if (currentText) {
            messages.push({ role: 'user', content: currentText });
        }
        return messages;
    }

    /**
     * Load prior completed User/AI turns for an MJ Conversation from `MJ: Conversation Details`,
     * running strictly as `contextUser` so MJ RLS and FLS apply to the calling user.
     */
    private async loadConversationHistoryFromDB(
        conversationId: string,
        contextUser: UserInfo
    ): Promise<{ messages: ChatMessage[]; lastAgentId?: string }> {
        try {
            const maxMessages = this.settings.MaxThreadMessages ?? 50;
            const res = await new RunView().RunView<ConversationDetailHistoryRow>(
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${EscapeSQLString(conversationId)}' AND HiddenToUser=0 AND Status='Complete' AND Role IN ('User','AI')`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: maxMessages,
                    Fields: ['ID', 'Role', 'Message', 'AgentID', '__mj_CreatedAt'],
                    ResultType: 'simple',
                    SkipTotalRowCount: true,
                },
                contextUser
            );

            if (!res.Success || !res.Results || res.Results.length === 0) {
                return { messages: [] };
            }

            // Query returns newest-first for bounded MaxRows; reverse to chronological order.
            const chronological = [...res.Results].reverse();
            const messages: ChatMessage[] = [];
            let lastAgentId: string | undefined;

            for (const row of chronological) {
                if (row.Role === 'AI' && row.AgentID) {
                    lastAgentId = row.AgentID;
                }
                const text = row.Message?.trim();
                if (!text) continue;
                messages.push({
                    role: row.Role === 'AI' ? 'assistant' : 'user',
                    content: text,
                });
            }

            return { messages, lastAgentId };
        } catch (error) {
            LogError(`Failed to load MJ: Conversation Details history for conversation ${conversationId}:`, undefined, error);
            return { messages: [] };
        }
    }

    /**
     * Get the active thread→conversation entry, rolling over (returning `undefined`)
     * once the sliding idle window `idleTimeoutMs` has elapsed.
     */
    private getThreadConversationEntry(
        threadKey: string,
        idleTimeoutMs: number = BaseMessagingAdapter.THREAD_MAP_TTL_MS
    ): ThreadConversationEntry | undefined {
        const entry = this.threadConversationMap.get(threadKey);
        if (!entry) return undefined;
        if (Date.now() - entry.lastActivityAt > idleTimeoutMs) {
            this.threadConversationMap.delete(threadKey);
            return undefined;
        }
        return entry;
    }

    /**
     * Get a conversation ID from the thread map, respecting idle timeout.
     */
    private getThreadConversationId(
        threadKey: string,
        idleTimeoutMs: number = BaseMessagingAdapter.THREAD_MAP_TTL_MS
    ): string | undefined {
        return this.getThreadConversationEntry(threadKey, idleTimeoutMs)?.conversationId;
    }

    /**
     * Store or refresh a conversation ID (and optional answering agent ID) in the thread map,
     * updating the sliding `lastActivityAt` timestamp and running max-size/TTL eviction.
     */
    private setThreadConversationId(
        threadKey: string,
        conversationId: string,
        lastAgentId?: string,
        idleTimeoutMs?: number
    ): void {
        const prev = this.threadConversationMap.get(threadKey);
        this.threadConversationMap.set(threadKey, {
            conversationId,
            lastActivityAt: Date.now(),
            idleTimeoutMs: idleTimeoutMs ?? prev?.idleTimeoutMs ?? BaseMessagingAdapter.THREAD_MAP_TTL_MS,
            lastAgentId: lastAgentId ?? prev?.lastAgentId,
        });
        this.evictExpiredThreadEntries();
    }

    /** Clear any active MJ Conversation mapping for `threadKey` (used by `/new`). */
    private clearThreadConversation(threadKey: string): boolean {
        return this.threadConversationMap.delete(threadKey);
    }

    /**
     * Evict expired and overflow entries from the thread conversation map.
     * Respects each entry's own configured `idleTimeoutMs` so configured rolling timeouts
     * above 24 hours are not prematurely evicted.
     */
    private evictExpiredThreadEntries(): void {
        const now = Date.now();
        for (const [key, entry] of this.threadConversationMap) {
            if (now - entry.lastActivityAt > entry.idleTimeoutMs) {
                this.threadConversationMap.delete(key);
            }
        }
        // If still over max size, evict oldest entries
        if (this.threadConversationMap.size > BaseMessagingAdapter.THREAD_MAP_MAX_SIZE) {
            const sorted = [...this.threadConversationMap.entries()].sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
            const toRemove = sorted.slice(0, sorted.length - BaseMessagingAdapter.THREAD_MAP_MAX_SIZE);
            for (const [key] of toRemove) {
                this.threadConversationMap.delete(key);
            }
        }
    }

    /**
     * Escape special regex characters in a string.
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
