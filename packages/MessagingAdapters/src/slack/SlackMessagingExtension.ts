/**
 * @module @memberjunction/messaging-adapters
 * @description Slack Server Extension — registers webhook routes and delegates to SlackAdapter.
 *
 * This is the entry point for Slack integration. It extends `BaseServerExtension`
 * to plug into MJServer's extension framework, registering a POST webhook endpoint
 * that receives Slack Events API payloads.
 *
 * ## Slack App Setup
 *
 * 1. Create a Slack App at https://api.slack.com/apps
 * 2. Enable Event Subscriptions and point the Request URL to `{your-server}/webhook/slack`
 * 3. Subscribe to bot events: `message.im`, `message.channels`, `message.groups`, `app_mention`
 *    - `message.im` — direct messages to the bot
 *    - `message.channels` / `message.groups` — thread replies in public/private channels
 *    - `app_mention` — @mentions of the bot in channels
 * 4. Add OAuth scopes: `chat:write`, `channels:history`, `groups:history`,
 *    `im:history`, `users:read`, `users:read.email`, `app_mentions:read`
 * 5. Install the app to your workspace
 * 6. Copy the Bot User OAuth Token and Signing Secret to your `mj.config.cjs`
 *
 * ## Configuration
 *
 * ```javascript
 * // mj.config.cjs
 * serverExtensions: [{
 *     Enabled: true,
 *     DriverClass: 'SlackMessagingExtension',
 *     RootPath: '/webhook/slack',
 *     Settings: {
 *         DefaultAgentName: 'Sage',
 *         ContextUserEmail: 'bot@company.com',
 *         BotToken: process.env.SLACK_BOT_TOKEN,
 *         SigningSecret: process.env.SLACK_SIGNING_SECRET,
 *         ConnectionMode: 'http',  // or 'socket' for Socket Mode
 *         MaxThreadMessages: 50,
 *         StreamingUpdateIntervalMs: 1500,
 *     }
 * }]
 * ```
 */

import express, { Application, Request, Response, Router } from 'express';
import { WebClient } from '@slack/web-api';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { SocketModeClient } from '@slack/socket-mode';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ExtensionInitResult,
    ExtensionHealthResult
} from '@memberjunction/server-extensions-core';
import { SlackAdapter } from './SlackAdapter.js';
import { MessagingAdapterSettings, RequestWithRawBody } from '../base/types.js';
import { verifySlackSignature } from './slack-routes.js';
import { handleSlackInteraction } from './slack-interactivity.js';

/**
 * Server Extension that registers Slack webhook routes and delegates
 * message handling to the `SlackAdapter`.
 *
 * Supports two connection modes:
 * - **HTTP** (default): Registers a POST endpoint for Slack Events API webhooks
 * - **Socket Mode**: Uses Slack's WebSocket-based Socket Mode (no public URL needed,
 *   ideal for local development)
 *
 * @example
 * ```typescript
 * // Auto-discovered by MJServer when package is imported and config is present
 * // No manual instantiation needed — just add to mj.config.cjs
 * ```
 */
@RegisterClass(BaseServerExtension, 'SlackMessagingExtension')
export class SlackMessagingExtension extends BaseServerExtension {
    /** The Slack adapter handling message processing. */
    private adapter: SlackAdapter | null = null;

    /** Slack WebClient for interactivity handlers (modals, etc.). */
    private interactClient: WebClient | null = null;

    /** The signing secret for webhook verification. */
    private signingSecret: string = '';

    /** Slash command → agent name mapping from config. */
    private slashCommands: Record<string, string> = {};

    /** Socket Mode client (only used when ConnectionMode is 'socket'). */
    private socketModeClient: SocketModeClient | null = null;

    /** The active connection mode for health reporting. */
    private connectionMode: 'http' | 'socket' = 'http';

    /**
     * Initialize the Slack extension.
     *
     * Creates and initializes the `SlackAdapter`, then sets up either:
     * - **HTTP mode** (default): POST webhook endpoint for Slack Events API
     * - **Socket Mode**: WebSocket connection using an App-Level Token (no public URL needed)
     */
    async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            // The Zod config pipeline may strip unknown keys from Settings, so we
            // fall back to env vars for settings that may be missing.
            const settings = config.Settings as unknown as MessagingAdapterSettings;
            if (!settings.ExplorerBaseURL && process.env.MJ_EXPLORER_BASE_URL) {
                settings.ExplorerBaseURL = process.env.MJ_EXPLORER_BASE_URL;
            }
            LogStatus(`[Slack] Extension settings keys: ${Object.keys(settings).join(', ')}, ExplorerBaseURL=${settings.ExplorerBaseURL ?? 'NOT SET'}`);
            this.signingSecret = settings.SigningSecret ?? '';
            this.connectionMode = settings.ConnectionMode ?? 'http';

            // Create and initialize the Slack adapter + interactivity client
            this.adapter = new SlackAdapter(settings);
            this.interactClient = new WebClient(settings.BotToken);
            await this.adapter.Initialize();

            // Build slash command map: auto-generate from loaded agents + merge config overrides
            this.slashCommands = this.buildSlashCommandMap(settings.SlashCommands);

            if (this.connectionMode === 'socket') {
                return await this.initializeSocketMode(settings);
            } else {
                return this.initializeHttpMode(app, config, settings);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                Message: `Failed to initialize Slack extension: ${message}`
            };
        }
    }

    /**
     * Shut down the Slack extension. Releases the adapter and disconnects Socket Mode.
     */
    async Shutdown(): Promise<void> {
        LogStatus('Shutting down Slack messaging extension');
        if (this.socketModeClient) {
            await this.socketModeClient.disconnect();
            this.socketModeClient = null;
        }
        this.adapter = null;
    }

    /**
     * Health check for the Slack extension.
     * Reports whether the adapter is initialized and ready.
     */
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this.adapter !== null,
            Name: 'SlackMessagingExtension',
            Details: {
                adapterInitialized: this.adapter !== null,
                connectionMode: this.connectionMode,
                signatureVerificationEnabled: this.signingSecret.length > 0,
                socketModeConnected: this.socketModeClient !== null
            }
        };
    }

    // ─── HTTP Mode ───────────────────────────────────────────────────────

    /**
     * Set up HTTP webhook mode: register POST endpoints for Slack Events API
     * and Slack Interactivity payloads.
     */
    private initializeHttpMode(
        app: Application,
        config: ServerExtensionConfig,
        settings: MessagingAdapterSettings
    ): ExtensionInitResult {
        const router = Router();
        router.use(express.json({
            limit: '1mb',
            verify: (req: Request, _res, buf) => {
                (req as RequestWithRawBody).rawBody = buf.toString('utf-8');
            }
        }));
        router.post('/', this.handleWebhook.bind(this));

        // Interactivity endpoint for button clicks, modal submissions, etc.
        // Slack sends these as application/x-www-form-urlencoded with a `payload` JSON field
        const interactRouter = Router();
        interactRouter.use(express.urlencoded({ extended: true }));
        interactRouter.post('/', this.handleInteraction.bind(this));
        app.use(config.RootPath + '/interact', interactRouter);

        // Slash command endpoint — Slack sends these as application/x-www-form-urlencoded
        const slashRouter = Router();
        slashRouter.use(express.urlencoded({ extended: true }));
        slashRouter.post('/', this.handleSlashCommand.bind(this));
        app.use(config.RootPath + '/slash', slashRouter);

        app.use(config.RootPath, router);

        const registeredRoutes = [
            `POST ${config.RootPath}`,
            `POST ${config.RootPath}/interact`,
            `POST ${config.RootPath}/slash`,
        ];

        return {
            Success: true,
            Message: `Slack extension loaded (HTTP mode) for agent ${settings.DefaultAgentName}`,
            RegisteredRoutes: registeredRoutes
        };
    }

    /**
     * Handle an incoming Slack webhook request (HTTP mode).
     *
     * 1. Verify the request signature (if signing secret is configured)
     * 2. Handle URL verification challenges (Slack sends these during setup)
     * 3. Acknowledge immediately (Slack requires response within 3 seconds)
     * 4. Process the message asynchronously via the adapter
     */
    private async handleWebhook(req: Request, res: Response): Promise<void> {
        // 1. Verify signature
        if (this.signingSecret && !verifySlackSignature(req, this.signingSecret)) {
            res.status(401).send('Invalid signature');
            return;
        }

        // 2. Handle URL verification challenge (sent during app setup)
        if (req.body?.type === 'url_verification') {
            res.json({ challenge: req.body.challenge });
            return;
        }

        // 3. Acknowledge immediately (Slack requires < 3s response)
        res.status(200).send();

        // 4. Process asynchronously
        await this.processSlackEvent(req.body?.event as Record<string, unknown> | undefined);
    }

    // ─── Socket Mode ─────────────────────────────────────────────────────

    /**
     * Set up Socket Mode: connect via WebSocket using an App-Level Token.
     *
     * Socket Mode is ideal for local development — no public URL or ngrok needed.
     * Requires an App-Level Token (`xapp-...`) with `connections:write` scope.
     */
    private async initializeSocketMode(settings: MessagingAdapterSettings): Promise<ExtensionInitResult> {
        const appToken = settings.AppToken;
        if (!appToken) {
            return {
                Success: false,
                Message: 'Socket Mode requires an AppToken (xapp-...) in Settings'
            };
        }

        this.socketModeClient = new SocketModeClient({ appToken });

        // Listen for message and app_mention events
        this.socketModeClient.on('message', async ({ event, ack }) => {
            await ack();
            await this.processSlackEvent(event as Record<string, unknown>);
        });

        this.socketModeClient.on('app_mention', async ({ event, ack }) => {
            await ack();
            await this.processSlackEvent(event as Record<string, unknown>);
        });

        await this.socketModeClient.start();
        LogStatus('Slack Socket Mode connected');

        return {
            Success: true,
            Message: `Slack extension loaded (Socket Mode) for agent ${settings.DefaultAgentName}`,
            RegisteredRoutes: ['WebSocket (Socket Mode)']
        };
    }

    // ─── Interactivity ─────────────────────────────────────────────────────

    /**
     * Handle Slack interactivity payloads (button clicks, modal submissions).
     * Slack sends these as `application/x-www-form-urlencoded` with a `payload` JSON field.
     */
    private async handleInteraction(req: Request, res: Response): Promise<void> {
        // Acknowledge immediately
        res.status(200).send();

        const payloadStr = req.body?.payload as string | undefined;
        if (!payloadStr) {
            LogStatus('Slack interact: no payload in request');
            return;
        }

        try {
            await handleSlackInteraction(payloadStr, this.interactClient!, this.adapter ?? undefined);
        } catch (error) {
            LogError('Error handling Slack interaction:', undefined, error);
        }
    }

    // ─── Slash Commands ─────────────────────────────────────────────────

    /**
     * Handle a Slack slash command (e.g., `/research what is quantum computing?`).
     *
     * Slack sends slash commands as `application/x-www-form-urlencoded` with fields:
     * `command`, `text`, `user_id`, `user_name`, `channel_id`, `channel_name`, `trigger_id`.
     *
     * Must respond within 3 seconds. We acknowledge immediately with a brief message,
     * then route to the agent pipeline asynchronously (which posts results to the channel).
     */
    private async handleSlashCommand(req: Request, res: Response): Promise<void> {
        const { command, text, user_id, user_name, channel_id } = req.body as Record<string, string>;

        LogStatus(`Slack slash command: command=${command}, text="${text}", user=${user_id}, channel=${channel_id}`);

        // Look up the agent for this command
        const agentName = this.resolveSlashCommandAgent(command);
        if (!agentName) {
            res.json({
                response_type: 'ephemeral',
                text: `Unknown command \`${command}\`. Configured commands: ${this.listSlashCommands()}`
            });
            return;
        }

        // Acknowledge within 3 seconds — visible only to the user
        res.json({
            response_type: 'ephemeral',
            text: `_Routing to *${agentName}*..._`
        });

        // Process asynchronously — post a thread-root message first, then route to the agent
        this.processSlashCommandAsync(agentName, text ?? '', user_id, user_name, channel_id).catch(error => {
            LogError(`Error processing slash command for agent '${agentName}':`, undefined, error);
        });
    }

    /**
     * Resolve a slash command string (e.g., `/research`) to an agent name.
     * Tries exact match first, then strips the leading `/` and matches case-insensitively.
     */
    private resolveSlashCommandAgent(command: string): string | null {
        // Exact match (e.g., `/research` → 'Research Agent')
        if (this.slashCommands[command]) {
            return this.slashCommands[command];
        }

        // Case-insensitive match
        const lowerCmd = command.toLowerCase();
        for (const [key, value] of Object.entries(this.slashCommands)) {
            if (key.toLowerCase() === lowerCmd) {
                return value;
            }
        }

        return null;
    }

    /**
     * Build the slash command → agent name map.
     * Auto-generates a command for every loaded agent using its first word
     * (e.g., "Research Agent" → `/research`). Explicit config overrides take precedence.
     */
    private buildSlashCommandMap(configuredCommands?: Record<string, string>): Record<string, string> {
        const autoCommands: Record<string, string> = {};
        for (const name of this.adapter!.AvailableAgentNames) {
            const firstWord = name.split(/\s+/)[0].toLowerCase();
            const cmd = `/${firstWord}`;
            if (!autoCommands[cmd]) {
                autoCommands[cmd] = name;
            }
        }

        const merged = { ...autoCommands, ...(configuredCommands ?? {}) };
        LogStatus(`Slack slash commands: ${Object.keys(merged).length} available (${Object.keys(configuredCommands ?? {}).length} from config, ${Object.keys(autoCommands).length} auto-generated)`);
        return merged;
    }

    /** Format the list of configured slash commands for display. */
    private listSlashCommands(): string {
        const entries = Object.entries(this.slashCommands);
        if (entries.length === 0) return '_none configured_';
        return entries.map(([cmd, agent]) => `\`${cmd}\` → ${agent}`).join(', ');
    }

    /**
     * Post a visible thread-root message for the slash command, then construct
     * an IncomingMessage with that thread's `ts` so all responses appear as replies.
     */
    private async processSlashCommandAsync(
        agentName: string,
        text: string,
        userId: string,
        userName: string,
        channelId: string,
    ): Promise<void> {
        const now = new Date();

        // Post a visible message to serve as the thread root
        let threadRootTs: string | undefined;
        if (this.interactClient) {
            try {
                const displayText = text || `(invoked via slash command)`;
                const result = await this.interactClient.chat.postMessage({
                    channel: channelId,
                    text: `*/${agentName.split(/\s+/)[0].toLowerCase()}* ${displayText}`,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `<@${userId}> used \`/${agentName.split(/\s+/)[0].toLowerCase()}\`\n>${displayText}`
                            }
                        }
                    ]
                });
                threadRootTs = result.ts ?? undefined;
            } catch (error) {
                LogError('Failed to post slash command thread root:', undefined, error);
            }
        }

        const messageTs = threadRootTs ?? (now.getTime() / 1000).toFixed(6);

        const incomingMessage = {
            MessageID: messageTs,
            Text: text || `(invoked via slash command)`,
            SenderID: userId,
            SenderName: userName ?? '',
            ChannelID: channelId,
            ThreadID: threadRootTs ?? null, // Thread under the root message if we posted one
            IsDirectMessage: false,
            IsBotMention: true, // Treat slash commands like @mentions so shouldRespond passes
            MentionedAgentNames: [agentName],
            Timestamp: now,
            RawEvent: { type: 'slash_command', command: agentName, text }
        };

        this.adapter!.HandleMessage(incomingMessage).catch(error => {
            LogError(`Error handling slash command for agent '${agentName}':`, undefined, error);
        });
    }

    // ─── Shared event processing ─────────────────────────────────────────

    /**
     * Process a Slack event from either HTTP webhook or Socket Mode.
     */
    private async processSlackEvent(event: Record<string, unknown> | undefined): Promise<void> {
        if (!event) {
            LogStatus('Slack webhook: no event in payload');
            return;
        }

        const eventType = event.type as string;
        LogStatus(`Slack event received: type=${eventType}, channel=${event.channel}, user=${event.user}`);

        // Only handle message and app_mention events
        if (eventType !== 'message' && eventType !== 'app_mention') {
            LogStatus(`Slack: ignoring event type '${eventType}'`);
            return;
        }

        // Skip bot messages (prevent loops) and message edits/deletes
        if (event.bot_id || event.subtype) {
            LogStatus(`Slack: skipping bot/subtype message (bot_id=${event.bot_id}, subtype=${event.subtype})`);
            return;
        }

        try {
            const incomingMessage = this.adapter!.MapSlackEvent(event);
            await this.adapter!.HandleMessage(incomingMessage);
        } catch (error) {
            LogError('Error handling Slack event:', undefined, error);
        }
    }
}
