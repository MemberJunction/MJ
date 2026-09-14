/**
 * @module @memberjunction/telephony-adapters
 * @description Twilio Telephony Server Extension.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import cors from 'cors';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ServerExtensionPhase,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
} from '@memberjunction/server-extensions-core';
import type { TwilioTelephonyConfig } from '../types.js';
import {
    createTwilioTelephonyHandler,
    TWILIO_TELEPHONY_MOUNT_PATH,
    TWILIO_MEDIA_WSS_PATH,
    SetTwilioTelephonyService,
    TwilioTelephonyService,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'TwilioTelephonyExtension')
export class TwilioTelephonyExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: TwilioTelephonyService | null = null;
    private config: TwilioTelephonyConfig | null = null;

    public async Initialize(
        contextOrApp: ServerExtensionInitContext,
        _config?: ServerExtensionConfig
    ): Promise<ExtensionInitResult> {
        const context = contextOrApp;
        const rawSettings = context.config.Settings as unknown as Partial<TwilioTelephonyConfig>;

        if (!rawSettings?.accountSid || !rawSettings?.streamPublicUrl) {
            return {
                Success: false,
                Skipped: true,
                Message: 'Twilio telephony is not configured (missing accountSid or streamPublicUrl)',
            };
        }

        const config: TwilioTelephonyConfig = {
            accountSid: rawSettings.accountSid,
            authToken: rawSettings.authToken,
            apiKeySid: rawSettings.apiKeySid,
            apiKeySecret: rawSettings.apiKeySecret,
            streamPublicUrl: rawSettings.streamPublicUrl,
            webhookSigningSecret: rawSettings.webhookSigningSecret,
            statusCallbackUrl: rawSettings.statusCallbackUrl,
        };
        this.config = config;

        const rootPath = context.config.RootPath || TWILIO_TELEPHONY_MOUNT_PATH;
        const publicUrl = context.publicUrl || 'http://localhost:4000';

        const handler = createTwilioTelephonyHandler(publicUrl, config);
        this.service = handler.service;

        // Mount public webhook router
        context.app.use(rootPath, cors<cors.CorsRequest>(), handler.publicRouter);

        // Attach media stream WebSocket server
        handler.attachMediaStreamServer();

        // Bind runtime holder for GraphQL resolvers
        SetTwilioTelephonyService(handler.service);

        LogStatus(`[Telephony] Twilio routes registered at ${rootPath}/voice + Media-Streams WSS at ${TWILIO_MEDIA_WSS_PATH}`);

        return {
            Success: true,
            Message: `Twilio telephony routes registered at ${rootPath}/voice`,
            RegisteredRoutes: [
                `POST ${rootPath}/voice`,
                `WSS ${TWILIO_MEDIA_WSS_PATH}`,
            ],
            Service: {
                key: 'TwilioTelephonyService',
                instance: handler.service,
            },
        };
    }

    public async Shutdown(): Promise<void> {
        SetTwilioTelephonyService(undefined);
        this.service = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'TwilioTelephonyExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                accountSid: this.config?.accountSid ? `${this.config.accountSid.slice(0, 4)}...` : undefined,
            },
        };
    }
}
