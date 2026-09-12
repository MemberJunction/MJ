/**
 * @module @memberjunction/telephony-adapters
 * @description Vonage Telephony Server Extension.
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
import type { VonageTelephonyConfig } from '../types.js';
import {
    createVonageTelephonyHandler,
    VONAGE_TELEPHONY_MOUNT_PATH,
    VONAGE_MEDIA_WSS_PATH,
    SetVonageTelephonyService,
    VonageTelephonyService,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'VonageTelephonyExtension')
export class VonageTelephonyExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: VonageTelephonyService | null = null;
    private config: VonageTelephonyConfig | null = null;

    public async Initialize(
        contextOrApp: ServerExtensionInitContext,
        _config?: ServerExtensionConfig
    ): Promise<ExtensionInitResult> {
        const context = contextOrApp;
        const rawSettings = context.config.Settings as unknown as Partial<VonageTelephonyConfig>;

        if (!rawSettings?.mediaPublicUrl) {
            return {
                Success: false,
                Skipped: true,
                Message: 'Vonage telephony is not configured (missing mediaPublicUrl)',
            };
        }

        const config: VonageTelephonyConfig = {
            applicationId: rawSettings.applicationId,
            privateKey: rawSettings.privateKey,
            apiKey: rawSettings.apiKey,
            apiSecret: rawSettings.apiSecret,
            mediaPublicUrl: rawSettings.mediaPublicUrl,
            signatureSecret: rawSettings.signatureSecret,
            eventUrl: rawSettings.eventUrl,
        };
        this.config = config;

        const rootPath = context.config.RootPath || VONAGE_TELEPHONY_MOUNT_PATH;
        const publicUrl = context.publicUrl || 'http://localhost:4000';

        const handler = createVonageTelephonyHandler(publicUrl, config);
        this.service = handler.service;

        // Mount public webhook router
        context.app.use(rootPath, cors<cors.CorsRequest>(), handler.publicRouter);

        // Attach media stream WebSocket server
        handler.attachMediaStreamServer();

        // Bind runtime holder for GraphQL resolvers
        SetVonageTelephonyService(handler.service);

        LogStatus(`[Telephony] Vonage routes registered at ${rootPath}/answer + /event + media WSS at ${VONAGE_MEDIA_WSS_PATH}`);

        return {
            Success: true,
            Message: `Vonage telephony routes registered at ${rootPath}/answer + /event`,
            RegisteredRoutes: [
                `POST ${rootPath}/answer`,
                `POST ${rootPath}/event`,
                `WSS ${VONAGE_MEDIA_WSS_PATH}`,
            ],
            Service: {
                key: 'VonageTelephonyService',
                instance: handler.service,
            },
        };
    }

    public async Shutdown(): Promise<void> {
        SetVonageTelephonyService(undefined);
        this.service = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'VonageTelephonyExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                applicationId: this.config?.applicationId,
            },
        };
    }
}
