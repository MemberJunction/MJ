/**
 * @module @memberjunction/telephony-adapters
 * @description RingCentral Telephony Server Extension.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ServerExtensionPhase,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
} from '@memberjunction/server-extensions-core';
import type { RingCentralTelephonyConfig } from '../types.js';
import {
    RingCentralTelephonyService,
    SetRingCentralTelephonyService,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'RingCentralTelephonyExtension')
export class RingCentralTelephonyExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: RingCentralTelephonyService | null = null;
    private config: RingCentralTelephonyConfig | null = null;

    public async Initialize(
        contextOrApp: ServerExtensionInitContext,
        _config?: ServerExtensionConfig
    ): Promise<ExtensionInitResult> {
        const context = contextOrApp;
        const rawSettings = context.config.Settings as unknown as Partial<RingCentralTelephonyConfig>;

        if (!rawSettings?.sipUsername || !rawSettings?.sipPassword) {
            return {
                Success: false,
                Skipped: true,
                Message: 'RingCentral telephony is not configured (missing sipUsername or sipPassword)',
            };
        }

        const config: RingCentralTelephonyConfig = {
            sipDomain: rawSettings.sipDomain ?? '',
            sipOutboundProxy: rawSettings.sipOutboundProxy ?? '',
            sipUsername: rawSettings.sipUsername,
            sipPassword: rawSettings.sipPassword,
            sipAuthorizationId: rawSettings.sipAuthorizationId ?? '',
            codec: rawSettings.codec,
            ignoreTlsCertErrors: rawSettings.ignoreTlsCertErrors,
        };
        this.config = config;

        const service = new RingCentralTelephonyService(config);
        this.service = service;

        // Bind runtime holder for GraphQL resolvers
        SetRingCentralTelephonyService(service);

        // Start SIP softphone registration (fire-and-forget)
        void service.start();

        LogStatus(`[Telephony] RingCentral SIP softphone starting (codec ${config.codec ?? 'OPUS/16000'})`);

        return {
            Success: true,
            Message: 'RingCentral SIP softphone started',
            RegisteredRoutes: [],
            Service: {
                key: 'RingCentralTelephonyService',
                instance: service,
            },
        };
    }

    public async Shutdown(): Promise<void> {
        this.service?.dispose();
        SetRingCentralTelephonyService(undefined);
        this.service = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'RingCentralTelephonyExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                sipUsername: this.config?.sipUsername,
            },
        };
    }
}
