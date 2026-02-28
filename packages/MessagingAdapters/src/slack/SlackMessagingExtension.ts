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
 * 3. Subscribe to bot events: `message.im`, `app_mention`
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
 *         AgentID: 'your-agent-guid',
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

import { Application, Request, Response, Router } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ExtensionInitResult,
    ExtensionHealthResult
} from '@memberjunction/server-extensions-core';
import { SlackAdapter } from './SlackAdapter.js';
import { MessagingAdapterSettings } from '../base/types.js';
import { verifySlackSignature } from './slack-routes.js';

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
    private Adapter: SlackAdapter | null = null;

    /** The signing secret for webhook verification. */
    private SigningSecret: string = '';

    /**
     * Initialize the Slack extension.
     *
     * Creates and initializes the `SlackAdapter`, then registers the webhook
     * route on the Express app for receiving Slack Events API payloads.
     */
    async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const settings = config.Settings as unknown as MessagingAdapterSettings;
            this.SigningSecret = settings.SigningSecret ?? '';

            // Create and initialize the Slack adapter
            this.Adapter = new SlackAdapter(settings);
            await this.Adapter.Initialize();

            // Register HTTP webhook routes
            const router = Router();
            router.post('/', this.handleWebhook.bind(this));
            app.use(config.RootPath, router);

            const routes = [`POST ${config.RootPath}`];

            // TODO: Socket Mode support would be added here
            // if (settings.ConnectionMode === 'socket') { ... }

            return {
                Success: true,
                Message: `Slack messaging extension loaded for agent ${settings.AgentID}`,
                RegisteredRoutes: routes
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                Message: `Failed to initialize Slack extension: ${message}`
            };
        }
    }

    /**
     * Shut down the Slack extension. Releases the adapter and any connections.
     */
    async Shutdown(): Promise<void> {
        LogStatus('Shutting down Slack messaging extension');
        this.Adapter = null;
    }

    /**
     * Health check for the Slack extension.
     * Reports whether the adapter is initialized and ready.
     */
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this.Adapter !== null,
            Name: 'SlackMessagingExtension',
            Details: {
                adapterInitialized: this.Adapter !== null,
                signatureVerificationEnabled: this.SigningSecret.length > 0
            }
        };
    }

    /**
     * Handle an incoming Slack webhook request.
     *
     * Performs these steps:
     * 1. Verify the request signature (if signing secret is configured)
     * 2. Handle URL verification challenges (Slack sends these during setup)
     * 3. Acknowledge immediately (Slack requires response within 3 seconds)
     * 4. Process the message asynchronously via the adapter
     *
     * @param req - Express request with Slack event payload.
     * @param res - Express response.
     */
    private async handleWebhook(req: Request, res: Response): Promise<void> {
        // 1. Verify signature
        if (this.SigningSecret && !verifySlackSignature(req, this.SigningSecret)) {
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
        const event = req.body?.event as Record<string, unknown> | undefined;
        if (!event) return;

        const eventType = event.type as string;

        // Only handle message and app_mention events
        if (eventType !== 'message' && eventType !== 'app_mention') return;

        // Skip bot messages (prevent loops) and message edits/deletes
        if (event.bot_id || event.subtype) return;

        try {
            const incomingMessage = this.Adapter!.MapSlackEvent(event);
            await this.Adapter!.HandleMessage(incomingMessage);
        } catch (error) {
            LogError('Error handling Slack webhook event:', undefined, error);
        }
    }
}
