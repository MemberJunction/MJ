/**
 * @module @memberjunction/messaging-adapters
 * @description Microsoft Teams Server Extension — registers Bot Framework webhook
 * route and delegates to TeamsAdapter.
 *
 * This is the entry point for Teams integration. It extends `BaseServerExtension`
 * to plug into MJServer's extension framework, registering a POST webhook endpoint
 * that receives Bot Framework activities.
 *
 * ## Azure Bot Setup
 *
 * 1. Register a bot in the Azure Bot Service
 * 2. Set the messaging endpoint to `{your-server}/webhook/teams`
 * 3. Note the Microsoft App ID and Password
 * 4. Create a Teams app manifest pointing to the bot registration
 * 5. Install the app in your Teams organization
 * 6. Configure the App ID and Password in `mj.config.cjs`
 *
 * ## Configuration
 *
 * ```javascript
 * // mj.config.cjs
 * serverExtensions: [{
 *     Enabled: true,
 *     DriverClass: 'TeamsMessagingExtension',
 *     RootPath: '/webhook/teams',
 *     Settings: {
 *         DefaultAgentName: 'Sage',
 *         ContextUserEmail: 'bot@company.com',
 *         MicrosoftAppId: process.env.MICROSOFT_APP_ID,
 *         MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
 *         MaxThreadMessages: 50,
 *         StreamingUpdateIntervalMs: 2000,
 *     }
 * }]
 * ```
 */

import express, { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    TurnContext,
    ActivityTypes,
} from 'botbuilder';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ExtensionInitResult,
    ExtensionHealthResult
} from '@memberjunction/server-extensions-core';
import { TeamsAdapter } from './TeamsAdapter.js';
import { MessagingAdapterSettings } from '../base/types.js';

/**
 * Server Extension that registers the Bot Framework webhook route and delegates
 * message handling to the `TeamsAdapter`.
 *
 * Uses the Bot Framework SDK's `CloudAdapter` for authentication and activity
 * processing, which handles JWT token validation automatically.
 *
 * @example
 * ```typescript
 * // Auto-discovered by MJServer when package is imported and config is present
 * // No manual instantiation needed — just add to mj.config.cjs
 * ```
 */
@RegisterClass(BaseServerExtension, 'TeamsMessagingExtension')
export class TeamsMessagingExtension extends BaseServerExtension {
    /** The Teams adapter handling message processing. */
    private adapter: TeamsAdapter | null = null;

    /** The Bot Framework cloud adapter for JWT validation and activity processing. */
    private cloudAdapterInstance: CloudAdapter | null = null;

    /**
     * Initialize the Teams extension.
     *
     * Creates the Bot Framework `CloudAdapter` for authentication,
     * initializes the `TeamsAdapter`, and registers the webhook route.
     */
    async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const settings = config.Settings as unknown as MessagingAdapterSettings;

            const appId = settings.MicrosoftAppId ?? process.env.MICROSOFT_APP_ID ?? '';
            const appPassword = settings.MicrosoftAppPassword ?? process.env.MICROSOFT_APP_PASSWORD ?? '';

            // Create Bot Framework authentication
            const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication({
                MicrosoftAppId: appId,
                MicrosoftAppPassword: appPassword,
            });

            this.cloudAdapterInstance = new CloudAdapter(botFrameworkAuth);

            // Set up error handler for the cloud adapter
            this.cloudAdapterInstance.onTurnError = async (context: TurnContext, error: Error) => {
                LogError(`Teams Bot Framework error: ${error.message}`, undefined, error);
                await context.sendActivity('Sorry, an error occurred processing your message.');
            };

            // Create and initialize the Teams adapter
            this.adapter = new TeamsAdapter(settings);
            await this.adapter.Initialize();

            // Register the Bot Framework webhook route
            const adapter = this.adapter;
            const cloudAdapter = this.cloudAdapterInstance;

            app.post(config.RootPath, express.json(), async (req, res) => {
                try {
                    await cloudAdapter.process(req, res, async (turnContext: TurnContext) => {
                        if (turnContext.activity.type === ActivityTypes.Message) {
                            const incomingMessage = adapter.MapTeamsActivity(turnContext);
                            await adapter.HandleMessage(incomingMessage);
                        }
                    });
                } catch (error) {
                    LogError('Error processing Teams webhook:', undefined, error);
                    if (!res.headersSent) {
                        res.status(500).send('Internal Server Error');
                    }
                }
            });

            return {
                Success: true,
                Message: `Teams messaging extension loaded for agent ${settings.DefaultAgentName}`,
                RegisteredRoutes: [`POST ${config.RootPath}`]
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                Message: `Failed to initialize Teams extension: ${message}`
            };
        }
    }

    /**
     * Shut down the Teams extension. Releases the adapter and cloud adapter.
     */
    async Shutdown(): Promise<void> {
        LogStatus('Shutting down Teams messaging extension');
        this.adapter = null;
        this.cloudAdapterInstance = null;
    }

    /**
     * Health check for the Teams extension.
     * Reports whether the adapter and cloud adapter are initialized.
     */
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this.adapter !== null && this.cloudAdapterInstance !== null,
            Name: 'TeamsMessagingExtension',
            Details: {
                adapterInitialized: this.adapter !== null,
                cloudAdapterInitialized: this.cloudAdapterInstance !== null
            }
        };
    }
}
