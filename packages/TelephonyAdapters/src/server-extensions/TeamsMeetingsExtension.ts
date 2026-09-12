/**
 * @module @memberjunction/telephony-adapters
 * @description Teams Meetings Server Extension.
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
import type { TeamsMeetingsConfig } from '../types.js';
import {
    createTeamsMeetingsHandler,
    TEAMS_MEETINGS_MOUNT_PATH,
    SetTeamsMeetingsService,
    TeamsMeetingsService,
    TeamsAcsMediaRegistry,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'TeamsMeetingsExtension')
export class TeamsMeetingsExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: TeamsMeetingsService | null = null;
    private registry: TeamsAcsMediaRegistry | null = null;
    private config: TeamsMeetingsConfig | null = null;

    public async Initialize(
        contextOrApp: ServerExtensionInitContext,
        _config?: ServerExtensionConfig
    ): Promise<ExtensionInitResult> {
        const context = contextOrApp;
        const rawSettings = context.config.Settings as unknown as Partial<TeamsMeetingsConfig>;

        if (rawSettings?.enabled === false || !rawSettings?.appId) {
            return {
                Success: false,
                Skipped: true,
                Message: 'Teams meetings not configured or disabled',
            };
        }

        const config: TeamsMeetingsConfig = {
            enabled: true,
            appId: rawSettings.appId,
            tenantId: rawSettings.tenantId,
            botAccessToken: rawSettings.botAccessToken,
            notificationClientState: rawSettings.notificationClientState,
            acsSampleRate: rawSettings.acsSampleRate,
            modelSampleRate: rawSettings.modelSampleRate,
        };
        this.config = config;

        const rootPath = context.config.RootPath || TEAMS_MEETINGS_MOUNT_PATH;

        const handler = createTeamsMeetingsHandler(config);
        this.service = handler.service;
        this.registry = handler.registry;

        // Mount public webhook router
        context.app.use(rootPath, cors<cors.CorsRequest>(), handler.publicRouter);

        // Bind runtime holder for GraphQL resolvers
        SetTeamsMeetingsService(handler.service);

        LogStatus(`[Meetings] Teams routes registered at ${rootPath}/notifications`);

        return {
            Success: true,
            Message: `Teams meetings routes registered at ${rootPath}/notifications`,
            RegisteredRoutes: [
                `POST ${rootPath}/notifications`,
            ],
            Service: {
                key: 'TeamsMeetingsService',
                instance: handler.service,
            },
        };
    }

    public async Shutdown(): Promise<void> {
        SetTeamsMeetingsService(undefined);
        this.service = null;
        this.registry = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'TeamsMeetingsExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                appId: this.config?.appId,
            },
        };
    }
}
