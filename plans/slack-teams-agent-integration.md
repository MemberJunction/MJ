# Slack & Teams ↔ MJ AI Agent Integration

## PRD — Product Requirements Document

### Overview

Enable MJ AI agents to be invoked from Slack and Microsoft Teams as interactive chatbots. Users send messages in a Slack/Teams channel or DM; a lightweight adapter translates the incoming event into an `AgentRunner.RunAgent()` call, streams the response back to the platform, and posts the final reply. Conversation history is maintained **entirely within the messaging platform** — MJ treats each request as stateless, reconstructing context from the platform's thread history on every invocation.

### Problem Statement

MJ already has powerful AI agent infrastructure (`AgentRunner`, `BaseAgent`, prompt templates, actions, memory, streaming) and outbound Slack/Teams webhook actions. What's missing is the **inbound** path: receiving messages from these platforms and routing them through the agent execution pipeline so that users can converse with MJ agents directly from their team collaboration tools without opening the MJ Explorer UI.

### Goals

1. **Two-way conversational agents** in Slack and Teams channels/DMs
2. **Streaming responses** — show typing indicator / progressive message updates so users aren't staring at a blank screen
3. **Thread-based context** — each Slack thread or Teams reply chain is one logical conversation; the adapter fetches thread history and passes it as `conversationMessages`
4. **Agent selection** — configurable default agent per channel/workspace, with the ability to mention specific agents
5. **Zero MJ-side conversation persistence** — the messaging platform is the system of record for conversation history
6. **Rich formatting** — translate agent Markdown output to Slack Block Kit / Teams Adaptive Cards
7. **Extensible architecture** — a shared base adapter with platform-specific subclasses, ready for Discord, WhatsApp, etc. in the future

### Non-Goals (Explicitly Out of Scope)

- Persisting conversation history in MJ's Conversation entities (possible future phase)
- Creating MJ Artifacts from Slack/Teams interactions
- File/image upload handling from platform → agent (text-only for v1)
- OAuth-based per-user identity mapping (v1 uses a single service account `contextUser`)
- Slash command registration in Slack/Teams (v1 uses @-mention or DM only)
- Admin UI in MJ Explorer for managing bot configurations

### User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Slack user | @mention the MJ bot in a channel and ask a question | I get an AI-powered answer without leaving Slack |
| US-2 | Teams user | DM the MJ bot and have a multi-turn conversation | I can iterate on complex questions in a threaded reply chain |
| US-3 | Slack user | See the bot "typing" while the agent thinks | I know the bot is working and haven't been ignored |
| US-4 | Admin | Configure which MJ agent backs the bot in a specific workspace/channel | Different teams get domain-specific agents |
| US-5 | Slack/Teams user | Continue a conversation in an existing thread | The bot remembers what we discussed earlier in the thread |
| US-6 | Developer | Add a new messaging platform adapter | I follow a clear base class pattern without reimplementing common logic |

### Success Metrics

- Bot responds to a Slack/Teams message within 2 seconds (initial typing indicator)
- Full response delivered within the agent's normal execution time + < 500ms overhead
- Thread context correctly reconstructed for conversations up to 50 messages deep
- Zero MJ database writes for conversation storage (platform is the record)

---

## TDD — Technical Design Document

### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────────────┐
│  Slack / Teams   │     │   MJAPI Server    │     │     MJ Agent Infrastructure     │
│  (Event API /    │────▶│   /webhook/slack  │────▶│                                 │
│   Bot Framework) │     │   /webhook/teams  │     │  AgentRunner.RunAgent()         │
│                  │◀────│                   │◀────│    ├─ BaseAgent.Execute()        │
│  Typing indicator│     │  Platform Adapter │     │    ├─ Prompts, Actions, Memory   │
│  Final message   │     │  (Slack/Teams)    │     │    └─ Streaming callbacks        │
└─────────────────┘     └──────────────────┘     └─────────────────────────────────┘
```

### Key Design Decision: `RunAgent` (not `RunAgentInConversation`)

We use `AgentRunner.RunAgent()` rather than `RunAgentInConversation()` because:

1. **No MJ conversation persistence needed** — the messaging platform owns the conversation record
2. **No artifact creation** — Slack/Teams messages are the output, not MJ artifacts
3. **Simpler execution path** — `RunAgent` is a thin wrapper that delegates directly to `BaseAgent.Execute()`
4. **Thread history → `conversationMessages`** — we reconstruct the `ChatMessage[]` array from the platform's thread history on each invocation, giving the agent full context without MJ needing to store anything

### Conversation History Flow

```mermaid
sequenceDiagram
    participant User as Slack/Teams User
    participant Platform as Messaging Platform
    participant Adapter as Platform Adapter
    participant API as Slack/Teams API
    participant Runner as AgentRunner

    User->>Platform: Sends message in thread
    Platform->>Adapter: Event webhook (message + thread_ts)
    Adapter->>API: Fetch thread history (conversations.replies / Graph API)
    API-->>Adapter: Previous messages in thread
    Adapter->>Adapter: Convert to ChatMessage[] array
    Note over Adapter: Map platform messages to<br/>role: user | assistant<br/>based on sender (bot vs human)
    Adapter->>Runner: RunAgent({ conversationMessages, agent, contextUser, ... })
    Runner-->>Adapter: Streaming chunks via onStreaming callback
    Adapter->>Platform: Update message with progressive content
    Runner-->>Adapter: Final ExecuteAgentResult
    Adapter->>Platform: Final formatted message (Block Kit / Adaptive Card)
```

### Package Structure

```
packages/
└── MessagingAdapters/
    ├── core/                              # @memberjunction/messaging-adapters-core
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── BaseMessagingAdapter.ts     # Abstract base class
    │       ├── types.ts                   # Shared types & interfaces
    │       ├── message-formatter.ts       # Markdown → platform format utils
    │       └── thread-history.ts          # Thread → ChatMessage[] conversion
    │
    ├── slack/                             # @memberjunction/messaging-adapter-slack
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── SlackAdapter.ts            # Slack-specific adapter
    │       ├── slack-formatter.ts         # Markdown → Block Kit
    │       ├── slack-routes.ts            # Express route handlers
    │       └── slack-types.ts             # Slack event types
    │
    └── teams/                             # @memberjunction/messaging-adapter-teams
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── TeamsAdapter.ts            # Teams-specific adapter
            ├── teams-formatter.ts         # Markdown → Adaptive Card
            ├── teams-routes.ts            # Express route handlers
            └── teams-types.ts             # Bot Framework types
```

### Core Types

```typescript
// packages/MessagingAdapters/core/src/types.ts

import { ChatMessage } from '@memberjunction/ai';
import { UserInfo } from '@memberjunction/core';

/**
 * Configuration for a messaging adapter instance.
 * Loaded from environment variables or mj.config.cjs.
 */
export interface MessagingAdapterConfig {
    /** MJ Agent ID to use for this adapter */
    AgentID: string;

    /** MJ User to run the agent as (service account) */
    ContextUserEmail: string;

    /** Platform-specific bot token / credentials */
    BotToken: string;

    /** Optional signing secret for webhook verification */
    SigningSecret?: string;

    /** Optional app-level token (Slack Socket Mode) */
    AppToken?: string;

    /** Maximum thread messages to fetch for context (default: 50) */
    MaxThreadMessages?: number;

    /** Whether to show typing indicators (default: true) */
    ShowTypingIndicator?: boolean;

    /** Streaming update interval in ms (default: 1000) */
    StreamingUpdateIntervalMs?: number;
}

/**
 * Normalized representation of an incoming message from any platform.
 */
export interface IncomingMessage {
    /** Platform-specific message ID */
    MessageID: string;

    /** The text content of the message */
    Text: string;

    /** Platform-specific user ID of the sender */
    SenderID: string;

    /** Display name of the sender */
    SenderName: string;

    /** Channel/conversation ID where the message was sent */
    ChannelID: string;

    /** Thread ID for threaded conversations (null for top-level) */
    ThreadID: string | null;

    /** Whether this is a direct message to the bot */
    IsDirectMessage: boolean;

    /** Whether the bot was explicitly @mentioned */
    IsBotMention: boolean;

    /** Timestamp of the message */
    Timestamp: Date;

    /** Raw platform-specific event payload for adapter-specific logic */
    RawEvent: Record<string, unknown>;
}

/**
 * Result of converting thread history to ChatMessage array.
 */
export interface ThreadHistoryResult {
    /** The converted messages ready for AgentRunner */
    Messages: ChatMessage[];

    /** Number of messages that were truncated due to MaxThreadMessages */
    TruncatedCount: number;
}

/**
 * Represents a formatted response ready to send to the platform.
 */
export interface FormattedResponse {
    /** Plain text fallback */
    PlainText: string;

    /** Platform-specific rich format payload (Block Kit / Adaptive Card) */
    RichPayload: Record<string, unknown>;
}
```

### Base Adapter Class

```typescript
// packages/MessagingAdapters/core/src/BaseMessagingAdapter.ts

import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessage, ChatMessageRole } from '@memberjunction/ai';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/core-entities';
import {
    MessagingAdapterConfig,
    IncomingMessage,
    ThreadHistoryResult,
    FormattedResponse
} from './types';

/**
 * Abstract base class for messaging platform adapters.
 * Handles the common flow: receive message → fetch thread → run agent → send reply.
 * Platform subclasses implement the abstract methods for platform-specific operations.
 */
export abstract class BaseMessagingAdapter {
    protected Config: MessagingAdapterConfig;
    protected ContextUser: UserInfo | null = null;
    protected Agent: MJAIAgentEntityExtended | null = null;

    constructor(config: MessagingAdapterConfig) {
        this.Config = config;
    }

    /**
     * Initialize the adapter: load the MJ agent entity and resolve the context user.
     * Must be called before handling any messages.
     */
    public async Initialize(): Promise<void> {
        await this.loadAgent();
        await this.loadContextUser();
        await this.onInitialize();
    }

    /**
     * Main entry point: handle an incoming message from the platform.
     * Orchestrates the full flow from message receipt to response delivery.
     */
    public async HandleMessage(message: IncomingMessage): Promise<void> {
        // 1. Should we respond to this message?
        if (!this.shouldRespond(message)) {
            return;
        }

        // 2. Show typing indicator
        if (this.Config.ShowTypingIndicator !== false) {
            await this.showTypingIndicator(message);
        }

        // 3. Fetch thread history and convert to ChatMessage[]
        const threadHistory = await this.getThreadHistory(message);
        const conversationMessages = this.buildConversationMessages(
            threadHistory,
            message
        );

        // 4. Run the agent with streaming
        const runner = new AgentRunner();
        let streamBuffer = '';
        let lastUpdateTime = 0;
        const updateInterval = this.Config.StreamingUpdateIntervalMs ?? 1000;
        let progressMessageId: string | null = null;

        const result = await runner.RunAgent({
            agent: this.Agent!,
            conversationMessages,
            contextUser: this.ContextUser!,
            onStreaming: async (chunk) => {
                streamBuffer += chunk.content;
                const now = Date.now();
                if (now - lastUpdateTime >= updateInterval && !chunk.isComplete) {
                    lastUpdateTime = now;
                    progressMessageId = await this.sendOrUpdateStreamingMessage(
                        message,
                        streamBuffer,
                        progressMessageId
                    );
                }
            }
        });

        // 5. Format and send final response
        const responseText = this.extractResponseText(result);
        const formatted = await this.formatResponse(responseText);

        if (progressMessageId) {
            await this.updateFinalMessage(message, progressMessageId, formatted);
        } else {
            await this.sendFinalMessage(message, formatted);
        }
    }

    // ─── Abstract methods (platform-specific) ─────────────────────────

    /** Platform-specific initialization (e.g., register event handlers) */
    protected abstract onInitialize(): Promise<void>;

    /** Show a typing/thinking indicator in the channel */
    protected abstract showTypingIndicator(message: IncomingMessage): Promise<void>;

    /** Fetch the thread history for the given message from the platform API */
    protected abstract fetchThreadHistory(
        channelId: string,
        threadId: string
    ): Promise<IncomingMessage[]>;

    /** Send or update a streaming progress message; returns the message ID */
    protected abstract sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
    ): Promise<string>;

    /** Send the final formatted response as a new message */
    protected abstract sendFinalMessage(
        originalMessage: IncomingMessage,
        response: FormattedResponse
    ): Promise<void>;

    /** Update an existing streaming message with the final formatted response */
    protected abstract updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void>;

    /** Convert Markdown text to platform-specific rich format */
    protected abstract formatResponse(markdownText: string): Promise<FormattedResponse>;

    /** Get the bot's own user ID on this platform (to identify bot messages in thread) */
    protected abstract getBotUserId(): string;

    // ─── Protected helper methods ─────────────────────────────────────

    /**
     * Determine whether the bot should respond to this message.
     * Default: respond to DMs and explicit @mentions. Subclasses can override.
     */
    protected shouldRespond(message: IncomingMessage): boolean {
        return message.IsDirectMessage || message.IsBotMention;
    }

    /**
     * Strip the bot @mention from the message text so the agent sees clean input.
     */
    protected abstract stripBotMention(text: string): string;

    /**
     * Fetch thread history and convert platform messages to IncomingMessage[].
     */
    private async getThreadHistory(message: IncomingMessage): Promise<IncomingMessage[]> {
        if (!message.ThreadID) {
            return []; // Top-level message, no prior history
        }
        const maxMessages = this.Config.MaxThreadMessages ?? 50;
        const history = await this.fetchThreadHistory(message.ChannelID, message.ThreadID);
        // Return up to maxMessages, excluding the current message (it's added separately)
        return history
            .filter(m => m.MessageID !== message.MessageID)
            .slice(-maxMessages);
    }

    /**
     * Convert thread history + current message into ChatMessage[] for AgentRunner.
     */
    private buildConversationMessages(
        history: IncomingMessage[],
        currentMessage: IncomingMessage
    ): ChatMessage[] {
        const botUserId = this.getBotUserId();
        const messages: ChatMessage[] = [];

        for (const msg of history) {
            const role: ChatMessageRole = msg.SenderID === botUserId ? 'assistant' : 'user';
            messages.push({
                role,
                content: role === 'user' ? this.stripBotMention(msg.Text) : msg.Text
            });
        }

        // Add the current message
        messages.push({
            role: 'user',
            content: this.stripBotMention(currentMessage.Text)
        });

        return messages;
    }

    /**
     * Extract the response text from an ExecuteAgentResult.
     */
    private extractResponseText(result: { success: boolean; agentRun: { Steps?: Array<{ Output?: string }> }; payload?: unknown }): string {
        if (!result.success) {
            return "I'm sorry, I encountered an error processing your request. Please try again.";
        }

        // Get the last prompt step's output as the response
        const steps = result.agentRun.Steps ?? [];
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].Output) {
                return steps[i].Output!;
            }
        }

        // Fallback to payload if it's a string
        if (typeof result.payload === 'string') {
            return result.payload;
        }

        return "I processed your request but have no response to show.";
    }

    /**
     * Load the MJ agent entity from database.
     */
    private async loadAgent(): Promise<void> {
        const md = new Metadata();
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
            EntityName: 'AI Agents',
            ExtraFilter: `ID='${this.Config.AgentID}'`,
            ResultType: 'entity_object'
        });
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Agent not found: ${this.Config.AgentID}`);
        }
        this.Agent = result.Results[0];
    }

    /**
     * Resolve the context user from the configured email.
     */
    private async loadContextUser(): Promise<void> {
        const md = new Metadata();
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Users',
            ExtraFilter: `Email='${this.Config.ContextUserEmail}'`,
            ResultType: 'entity_object'
        });
        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Context user not found: ${this.Config.ContextUserEmail}`);
        }
        this.ContextUser = result.Results[0] as unknown as UserInfo;
    }
}
```

### Slack Adapter (Key Sections)

```typescript
// packages/MessagingAdapters/slack/src/SlackAdapter.ts

import { WebClient } from '@slack/web-api';
import { BaseMessagingAdapter } from '@memberjunction/messaging-adapters-core';
import {
    IncomingMessage,
    FormattedResponse,
    MessagingAdapterConfig
} from '@memberjunction/messaging-adapters-core';
import { markdownToBlocks } from './slack-formatter';

export class SlackAdapter extends BaseMessagingAdapter {
    private Client: WebClient;
    private BotUserID: string = '';

    constructor(config: MessagingAdapterConfig) {
        super(config);
        this.Client = new WebClient(config.BotToken);
    }

    protected async onInitialize(): Promise<void> {
        // Fetch bot's own user ID for thread history role mapping
        const authResult = await this.Client.auth.test();
        this.BotUserID = authResult.user_id as string;
    }

    protected getBotUserId(): string {
        return this.BotUserID;
    }

    protected async showTypingIndicator(message: IncomingMessage): Promise<void> {
        // Slack doesn't have a persistent typing API for bots,
        // so we post a temporary "thinking" message that gets updated
        // This is handled by sendOrUpdateStreamingMessage on first call
    }

    protected async fetchThreadHistory(
        channelId: string,
        threadId: string
    ): Promise<IncomingMessage[]> {
        const result = await this.Client.conversations.replies({
            channel: channelId,
            ts: threadId,
            limit: this.Config.MaxThreadMessages ?? 50
        });

        return (result.messages ?? []).map(msg => ({
            MessageID: msg.ts!,
            Text: msg.text ?? '',
            SenderID: msg.user ?? msg.bot_id ?? '',
            SenderName: msg.username ?? '',
            ChannelID: channelId,
            ThreadID: threadId,
            IsDirectMessage: false,
            IsBotMention: false,
            Timestamp: new Date(parseFloat(msg.ts!) * 1000),
            RawEvent: msg as Record<string, unknown>
        }));
    }

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

    protected async sendFinalMessage(
        originalMessage: IncomingMessage,
        response: FormattedResponse
    ): Promise<void> {
        const threadTs = originalMessage.ThreadID ?? originalMessage.MessageID;
        await this.Client.chat.postMessage({
            channel: originalMessage.ChannelID,
            thread_ts: threadTs,
            text: response.PlainText,
            blocks: response.RichPayload.blocks as []
        });
    }

    protected async updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        await this.Client.chat.update({
            channel: originalMessage.ChannelID,
            ts: messageId,
            text: response.PlainText,
            blocks: response.RichPayload.blocks as []
        });
    }

    protected async formatResponse(markdownText: string): Promise<FormattedResponse> {
        return {
            PlainText: markdownText,
            RichPayload: { blocks: markdownToBlocks(markdownText) }
        };
    }

    protected stripBotMention(text: string): string {
        // Remove <@BOTID> mention pattern from Slack messages
        return text.replace(new RegExp(`<@${this.BotUserID}>`, 'g'), '').trim();
    }
}
```

### Teams Adapter (Key Sections)

```typescript
// packages/MessagingAdapters/teams/src/TeamsAdapter.ts

import {
    CloudAdapter,
    TurnContext,
    Activity,
    ActivityTypes
} from 'botbuilder';
import { BaseMessagingAdapter } from '@memberjunction/messaging-adapters-core';
import {
    IncomingMessage,
    FormattedResponse,
    MessagingAdapterConfig
} from '@memberjunction/messaging-adapters-core';
import { markdownToAdaptiveCard } from './teams-formatter';

export class TeamsAdapter extends BaseMessagingAdapter {
    private BotAdapter: CloudAdapter;
    private BotID: string = '';

    constructor(config: MessagingAdapterConfig) {
        super(config);
        this.BotAdapter = new CloudAdapter(); // Configured via env vars
    }

    protected async onInitialize(): Promise<void> {
        this.BotID = process.env.MicrosoftAppId ?? '';
    }

    protected getBotUserId(): string {
        return this.BotID;
    }

    protected async showTypingIndicator(message: IncomingMessage): Promise<void> {
        // Teams supports a native typing indicator activity
        const turnContext = message.RawEvent['turnContext'] as TurnContext;
        if (turnContext) {
            await turnContext.sendActivity({ type: ActivityTypes.Typing });
        }
    }

    protected async fetchThreadHistory(
        channelId: string,
        threadId: string
    ): Promise<IncomingMessage[]> {
        // Teams thread history is fetched via the Bot Framework's
        // conversation API or Microsoft Graph API
        // Implementation uses Graph API: GET /teams/{id}/channels/{id}/messages/{id}/replies
        // Details in teams-routes.ts
        return []; // Placeholder — full implementation in actual code
    }

    protected async sendOrUpdateStreamingMessage(
        originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
    ): Promise<string> {
        const turnContext = originalMessage.RawEvent['turnContext'] as TurnContext;
        if (existingMessageId) {
            const activity = {
                id: existingMessageId,
                type: ActivityTypes.Message,
                text: currentContent + ' ...'
            };
            await turnContext.updateActivity(activity);
            return existingMessageId;
        } else {
            const response = await turnContext.sendActivity(currentContent + ' ...');
            return response?.id ?? '';
        }
    }

    protected async sendFinalMessage(
        originalMessage: IncomingMessage,
        response: FormattedResponse
    ): Promise<void> {
        const turnContext = originalMessage.RawEvent['turnContext'] as TurnContext;
        const activity: Partial<Activity> = {
            type: ActivityTypes.Message,
            text: response.PlainText,
            attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: response.RichPayload
            }]
        };
        await turnContext.sendActivity(activity);
    }

    protected async updateFinalMessage(
        originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        const turnContext = originalMessage.RawEvent['turnContext'] as TurnContext;
        const activity: Partial<Activity> = {
            id: messageId,
            type: ActivityTypes.Message,
            text: response.PlainText,
            attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: response.RichPayload
            }]
        };
        await turnContext.updateActivity(activity as Activity);
    }

    protected async formatResponse(markdownText: string): Promise<FormattedResponse> {
        return {
            PlainText: markdownText,
            RichPayload: markdownToAdaptiveCard(markdownText)
        };
    }

    protected stripBotMention(text: string): string {
        // Remove <at>BotName</at> mention pattern from Teams messages
        return text.replace(/<at>[^<]+<\/at>/g, '').trim();
    }
}
```

### MJAPI Integration — Route Registration

The adapters register Express routes on the existing MJAPI server. No new server process is needed.

```typescript
// packages/MessagingAdapters/slack/src/slack-routes.ts

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SlackAdapter } from './SlackAdapter';
import { IncomingMessage } from '@memberjunction/messaging-adapters-core';

export function createSlackRoutes(adapter: SlackAdapter, signingSecret: string): Router {
    const router = Router();

    // Slack sends a URL verification challenge on first setup
    // and event payloads for messages
    router.post('/webhook/slack', async (req: Request, res: Response) => {
        // 1. Verify request signature
        if (!verifySlackSignature(req, signingSecret)) {
            res.status(401).send('Invalid signature');
            return;
        }

        const body = req.body;

        // 2. Handle URL verification challenge
        if (body.type === 'url_verification') {
            res.json({ challenge: body.challenge });
            return;
        }

        // 3. Acknowledge immediately (Slack requires < 3s response)
        res.status(200).send();

        // 4. Process the event asynchronously
        if (body.event?.type === 'message' || body.event?.type === 'app_mention') {
            // Skip bot's own messages, message edits, and deletions
            if (body.event.bot_id || body.event.subtype) {
                return;
            }

            const incomingMessage: IncomingMessage = {
                MessageID: body.event.ts,
                Text: body.event.text ?? '',
                SenderID: body.event.user,
                SenderName: '', // Resolved later if needed
                ChannelID: body.event.channel,
                ThreadID: body.event.thread_ts ?? null,
                IsDirectMessage: body.event.channel_type === 'im',
                IsBotMention: body.event.type === 'app_mention',
                Timestamp: new Date(parseFloat(body.event.ts) * 1000),
                RawEvent: body.event
            };

            // Fire and forget — errors are logged, not sent to Slack
            adapter.HandleMessage(incomingMessage).catch(err => {
                console.error('Error handling Slack message:', err);
            });
        }
    });

    return router;
}

function verifySlackSignature(req: Request, signingSecret: string): boolean {
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const signature = req.headers['x-slack-signature'] as string;

    if (!timestamp || !signature) return false;

    // Prevent replay attacks (> 5 min old)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

    const rawBody = JSON.stringify(req.body);
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const mySignature = 'v0=' + crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(signature)
    );
}
```

```typescript
// packages/MessagingAdapters/teams/src/teams-routes.ts

import { Router, Request, Response } from 'express';
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    TurnContext,
    ActivityTypes
} from 'botbuilder';
import { TeamsAdapter } from './TeamsAdapter';
import { IncomingMessage } from '@memberjunction/messaging-adapters-core';

export function createTeamsRoutes(
    adapter: TeamsAdapter,
    botFrameworkAuth: ConfigurationBotFrameworkAuthentication
): Router {
    const router = Router();
    const cloudAdapter = new CloudAdapter(botFrameworkAuth);

    router.post('/webhook/teams', async (req: Request, res: Response) => {
        await cloudAdapter.process(req, res, async (turnContext: TurnContext) => {
            if (turnContext.activity.type === ActivityTypes.Message) {
                const activity = turnContext.activity;
                const incomingMessage: IncomingMessage = {
                    MessageID: activity.id ?? '',
                    Text: activity.text ?? '',
                    SenderID: activity.from?.id ?? '',
                    SenderName: activity.from?.name ?? '',
                    ChannelID: activity.channelId ?? '',
                    ThreadID: activity.conversation?.id ?? null,
                    IsDirectMessage: activity.conversation?.conversationType === 'personal',
                    IsBotMention: (activity.entities ?? []).some(
                        e => e.type === 'mention' && e.mentioned?.id === adapter['BotID']
                    ),
                    Timestamp: new Date(activity.timestamp ?? Date.now()),
                    RawEvent: { ...activity, turnContext } as Record<string, unknown>
                };

                await adapter.HandleMessage(incomingMessage);
            }
        });
    });

    return router;
}
```

### Configuration

Configuration via `mj.config.cjs`:

```javascript
// mj.config.cjs (relevant section)
module.exports = {
    messagingAdapters: {
        slack: {
            enabled: true,
            agentId: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
            contextUserEmail: 'bot-service@company.com',
            botToken: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            appToken: process.env.SLACK_APP_TOKEN, // For Socket Mode (optional)
            maxThreadMessages: 50,
            showTypingIndicator: true,
            streamingUpdateIntervalMs: 1500
        },
        teams: {
            enabled: true,
            agentId: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
            contextUserEmail: 'bot-service@company.com',
            botToken: process.env.TEAMS_BOT_TOKEN, // Not used directly by Bot Framework
            microsoftAppId: process.env.MICROSOFT_APP_ID,
            microsoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
            maxThreadMessages: 50,
            showTypingIndicator: true,
            streamingUpdateIntervalMs: 2000
        }
    }
};
```

### Markdown → Platform Format Conversion

#### Slack (Markdown → Block Kit)

```typescript
// packages/MessagingAdapters/slack/src/slack-formatter.ts

/**
 * Convert Markdown text from an agent response to Slack Block Kit blocks.
 * Handles: headers, bold, italic, code blocks, bullet lists, links.
 */
export function markdownToBlocks(markdown: string): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const sections = splitIntoSections(markdown);

    for (const section of sections) {
        if (section.type === 'code') {
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '```' + section.content + '```' }
            });
        } else if (section.type === 'header') {
            blocks.push({
                type: 'header',
                text: { type: 'plain_text', text: section.content }
            });
        } else {
            // Convert markdown formatting to Slack mrkdwn
            const mrkdwn = convertToSlackMrkdwn(section.content);
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: mrkdwn }
            });
        }
    }

    return blocks;
}

function splitIntoSections(markdown: string): Array<{ type: string; content: string }> {
    // Implementation splits on code fences, headers (# ## ###), and paragraph breaks
    // Returns typed sections for block generation
    // ... (implementation details)
    return [];
}

function convertToSlackMrkdwn(text: string): string {
    // Slack uses slightly different markdown:
    // - Bold: *text* (not **text**)
    // - Italic: _text_ (same)
    // - Strikethrough: ~text~ (same)
    // - Links: <url|text> (not [text](url))
    return text
        .replace(/\*\*(.+?)\*\*/g, '*$1*')                    // Bold
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');       // Links
}
```

#### Teams (Markdown → Adaptive Card)

```typescript
// packages/MessagingAdapters/teams/src/teams-formatter.ts

/**
 * Convert Markdown text from an agent response to a Teams Adaptive Card.
 * Teams Adaptive Cards support a subset of Markdown natively in TextBlock elements.
 */
export function markdownToAdaptiveCard(markdown: string): Record<string, unknown> {
    const bodyElements: Record<string, unknown>[] = [];
    const sections = splitIntoSections(markdown);

    for (const section of sections) {
        if (section.type === 'header') {
            bodyElements.push({
                type: 'TextBlock',
                text: section.content,
                size: 'Large',
                weight: 'Bolder',
                wrap: true
            });
        } else if (section.type === 'code') {
            bodyElements.push({
                type: 'TextBlock',
                text: '```\n' + section.content + '\n```',
                fontType: 'Monospace',
                wrap: true
            });
        } else {
            bodyElements.push({
                type: 'TextBlock',
                text: section.content,
                wrap: true
            });
        }
    }

    return {
        type: 'AdaptiveCard',
        version: '1.4',
        body: bodyElements
    };
}

function splitIntoSections(markdown: string): Array<{ type: string; content: string }> {
    // Same concept as Slack — split into typed sections
    // ... (implementation details)
    return [];
}
```

### Error Handling Strategy

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Error Handling Flow                          │
├────────────────────────┬─────────────────────────────────────────────┤
│ Error Type             │ Behavior                                   │
├────────────────────────┼─────────────────────────────────────────────┤
│ Agent execution fails  │ Send friendly error message to user in     │
│                        │ thread. Log full error server-side.         │
├────────────────────────┼─────────────────────────────────────────────┤
│ Thread history fetch   │ Proceed without history (single-turn).     │
│ fails                  │ Log warning.                                │
├────────────────────────┼─────────────────────────────────────────────┤
│ Streaming update fails │ Silently skip update, continue execution.  │
│ (rate limit, etc.)     │ Final message still sent.                   │
├────────────────────────┼─────────────────────────────────────────────┤
│ Webhook signature      │ Return 401, do not process. Log attempt.   │
│ verification fails     │                                             │
├────────────────────────┼─────────────────────────────────────────────┤
│ Agent not found        │ Fail at startup, not at message time.      │
│                        │ Adapter refuses to initialize.              │
├────────────────────────┼─────────────────────────────────────────────┤
│ Context user not found │ Fail at startup, same as above.            │
└────────────────────────┴─────────────────────────────────────────────┘
```

### Security Considerations

1. **Webhook Signature Verification** — Every incoming Slack request is verified against the signing secret using HMAC-SHA256 with timestamp replay protection. Teams uses Bot Framework's built-in JWT token validation.

2. **Service Account Isolation** — All agent executions run under a dedicated MJ service account, not individual Slack/Teams user identities. This means agent permissions are scoped to what the service account can access.

3. **No Secret Exposure** — Bot tokens, signing secrets, and app credentials are stored in environment variables, never in config files or code.

4. **Input Sanitization** — User messages are passed as-is to the agent (which handles its own prompt injection defenses), but @-mention tags and platform formatting are stripped.

5. **Rate Limiting** — The adapter respects platform rate limits for API calls (Slack: ~1 msg/sec per channel, Teams: similar). Streaming updates are throttled by `StreamingUpdateIntervalMs`.

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@slack/web-api` | ^7.x | Slack API client (posting messages, fetching threads) |
| `@slack/events-api` | ^3.x | Optional: Slack Events API middleware (alternative to raw Express) |
| `botbuilder` | ^4.x | Microsoft Bot Framework SDK for Teams |
| `botframework-connector` | ^4.x | Bot Framework authentication & connector |
| `@memberjunction/ai-agents` | workspace | AgentRunner |
| `@memberjunction/ai` | workspace | ChatMessage types |
| `@memberjunction/core` | workspace | Metadata, RunView, UserInfo |
| `@memberjunction/core-entities` | workspace | Entity types |
| `express` | existing | Route registration (already in MJAPI) |

### Testing Strategy

1. **Unit Tests** (Vitest) — Test the base adapter's `buildConversationMessages`, `shouldRespond`, and `extractResponseText` methods with mocked data. Test formatters (Markdown → Block Kit, Markdown → Adaptive Card) with sample inputs.

2. **Integration Tests** — Mock the Slack/Teams APIs and test the full `HandleMessage` flow end-to-end with a stubbed `AgentRunner`.

3. **Manual Testing** — Use Slack's Socket Mode (no public URL needed) and Bot Framework Emulator for local development testing.

---

## Implementation Phase

### Phase 1: Core + Slack + Teams (Single Phase)

This is the only planned implementation phase. All items are delivered together.

| # | Task | Description |
|---|------|-------------|
| 1.1 | **Create core package** | `@memberjunction/messaging-adapters-core` with `BaseMessagingAdapter`, types, and shared utilities |
| 1.2 | **Implement Slack adapter** | `SlackAdapter`, `slack-formatter`, `slack-routes` with signature verification |
| 1.3 | **Implement Teams adapter** | `TeamsAdapter`, `teams-formatter`, `teams-routes` with Bot Framework auth |
| 1.4 | **MJAPI integration** | Register webhook routes on the existing MJAPI Express server, gated by config flags |
| 1.5 | **Markdown formatters** | `markdownToBlocks` (Slack) and `markdownToAdaptiveCard` (Teams) |
| 1.6 | **Streaming support** | Progressive message updates using `onStreaming` callback |
| 1.7 | **Thread history** | Fetch and convert thread replies to `ChatMessage[]` |
| 1.8 | **Configuration** | `mj.config.cjs` schema for adapter settings |
| 1.9 | **Unit tests** | Tests for base adapter logic, formatters, signature verification |
| 1.10 | **Documentation** | README for each package, setup guide for Slack/Teams app creation |

### Possible Future Phase: MJ Conversation Persistence

> **Status: Under consideration — not committed**

If there's a future need to persist Slack/Teams conversations in MJ's Conversation entities (for analytics, cross-platform history, or artifact creation), the adapter could optionally call `RunAgentInConversation()` instead of `RunAgent()`. This would:

- Create MJ Conversation and ConversationDetail records
- Enable artifact creation from agent responses
- Allow cross-referencing Slack/Teams threads with MJ conversations
- Support conversation analytics and reporting

This would be a configuration toggle (`persistConversations: true`) on the adapter config, switching the internal call from `RunAgent` to `RunAgentInConversation`. The adapter architecture supports this cleanly because the conversation message construction is identical — only the runner call changes.

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/MessagingAdapters/core/package.json` | Create | Core package definition |
| `packages/MessagingAdapters/core/src/BaseMessagingAdapter.ts` | Create | Abstract base class |
| `packages/MessagingAdapters/core/src/types.ts` | Create | Shared types |
| `packages/MessagingAdapters/core/src/message-formatter.ts` | Create | Shared formatter utils |
| `packages/MessagingAdapters/core/src/thread-history.ts` | Create | Thread → ChatMessage conversion |
| `packages/MessagingAdapters/slack/package.json` | Create | Slack package definition |
| `packages/MessagingAdapters/slack/src/SlackAdapter.ts` | Create | Slack adapter implementation |
| `packages/MessagingAdapters/slack/src/slack-formatter.ts` | Create | Markdown → Block Kit |
| `packages/MessagingAdapters/slack/src/slack-routes.ts` | Create | Express routes + signature verification |
| `packages/MessagingAdapters/slack/src/slack-types.ts` | Create | Slack event type definitions |
| `packages/MessagingAdapters/teams/package.json` | Create | Teams package definition |
| `packages/MessagingAdapters/teams/src/TeamsAdapter.ts` | Create | Teams adapter implementation |
| `packages/MessagingAdapters/teams/src/teams-formatter.ts` | Create | Markdown → Adaptive Card |
| `packages/MessagingAdapters/teams/src/teams-routes.ts` | Create | Express routes + Bot Framework |
| `packages/MessagingAdapters/teams/src/teams-types.ts` | Create | Bot Framework type definitions |
| `packages/MJAPI/src/index.ts` (or server setup) | Modify | Register webhook routes conditionally |
| `mj.config.cjs` | Modify | Add `messagingAdapters` config section |
| `package.json` (root) | Modify | Add workspace entries for new packages |

---

## Open Design Questions

1. **Agent-per-channel vs. global agent** — Should we support mapping different agents to different Slack channels, or is a single agent per workspace sufficient for v1?

2. **User identity mapping** — v1 uses a single service account. Should we provide a hook for resolving the Slack/Teams user to an MJ user for proper permission scoping?

3. **Message length limits** — Slack blocks have a 3000-char limit per text element, and messages have a total limit. Should the formatter auto-split long responses into multiple messages?

4. **Socket Mode vs. HTTP** — Slack supports Socket Mode (WebSocket, no public URL needed) which is great for development. Should we support both connection modes?
