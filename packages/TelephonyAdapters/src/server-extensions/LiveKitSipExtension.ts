/**
 * @module @memberjunction/telephony-adapters
 * @description LiveKit SIP Telephony Server Extension: phone calls carried by a SIP trunk, landed in LiveKit rooms.
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
import { LiveKitAgentRoomCoordinator, LiveKitSipService, LiveKitWebhookParser } from '@memberjunction/livekit-room-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import type { LiveKitSipSettings } from '../types.js';
import {
    CreateLiveKitSipRouter,
    LIVEKIT_SIP_MOUNT_PATH,
    LiveKitSipTelephonyService,
    ReadSharedTelephonySettings,
    SetLiveKitSipTelephonyService,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'LiveKitSipExtension')
export class LiveKitSipExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: LiveKitSipTelephonyService | null = null;
    private config: LiveKitSipSettings | null = null;

    public async Initialize(contextOrApp: ServerExtensionInitContext, _config?: ServerExtensionConfig): Promise<ExtensionInitResult> {
        const context = contextOrApp;
        const rawSettings = context.config.Settings as unknown as Partial<LiveKitSipSettings>;
        const sip = new LiveKitSipService({ ServerUrl: rawSettings?.serverUrl, ApiKey: rawSettings?.apiKey, ApiSecret: rawSettings?.apiSecret });
        if (!sip.IsConfigured) {
            return {
                Success: false,
                Skipped: true,
                Message: 'LiveKit SIP is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET, or telephony.livekitSip.serverUrl / apiKey / apiSecret)',
            };
        }

        const rootPath = context.config.RootPath || LIVEKIT_SIP_MOUNT_PATH;
        const config: LiveKitSipSettings = {
            serverUrl: rawSettings.serverUrl,
            apiKey: rawSettings.apiKey,
            apiSecret: rawSettings.apiSecret,
            roomPrefix: rawSettings.roomPrefix,
            numbers: rawSettings.numbers,
            inboundTrunkId: rawSettings.inboundTrunkId,
            outboundTrunkId: rawSettings.outboundTrunkId,
            outboundFromNumber: rawSettings.outboundFromNumber,
            autoProvision: rawSettings.autoProvision,
            allowedAddresses: rawSettings.allowedAddresses,
            carrier: rawSettings.carrier,
            ...ReadSharedTelephonySettings(rawSettings),
        };
        this.config = config;

        // The room coordinator opens the agent's model session through this factory. MJServer binds the same function;
        // binding it here too means a host that loads this extension does not depend on that import order.
        LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(CreateBridgeRealtimeSession);

        const service = new LiveKitSipTelephonyService(config, { sip });
        this.service = service;
        const parser = new LiveKitWebhookParser({ ServerUrl: config.serverUrl, ApiKey: config.apiKey, ApiSecret: config.apiSecret });
        context.app.use(rootPath, cors<cors.CorsRequest>(), CreateLiveKitSipRouter(service, parser, config));
        SetLiveKitSipTelephonyService(service);
        void service.Initialize();

        LogStatus(`[Telephony] LiveKit SIP webhook registered at ${rootPath}/webhook`);
        return {
            Success: true,
            Message: `LiveKit SIP webhook registered at ${rootPath}/webhook`,
            RegisteredRoutes: [`POST ${rootPath}/webhook`],
            Service: { key: 'LiveKitSipTelephonyService', instance: service },
        };
    }

    public async Shutdown(): Promise<void> {
        this.service?.Dispose();
        SetLiveKitSipTelephonyService(undefined);
        this.service = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'LiveKitSipExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                numbers: this.config?.numbers?.length ?? 0,
                outboundTrunk: Boolean(this.config?.outboundTrunkId),
            },
        };
    }
}
