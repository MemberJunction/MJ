import type { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerExtension } from '@memberjunction/server-extensions-core';
import type {
    ExtensionHealthResult, ExtensionInitResult, ServerExtensionConfig, ServerExtensionInitContext, ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { WorkQueueHost } from '@memberjunction/work-queue-engine';
import { ParseServerSettings } from './publishRequests';
import { CreateDefaultPublishDependencies, CreateWorkQueuePublishRouter } from './router';

/** Adds a leading slash and drops trailing ones. The loader always supplies a non-blank RootPath. */
export function NormalizeRootPath(rootPath: string | undefined): string {
    const trimmed = (rootPath ?? '').trim().replace(/\/+$/, '');
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Mounts `POST {RootPath}/topics/{topic}/messages` after MJServer's unified authentication (03 §9). Its health
 * check also reports this process's WorkQueueHost, when one is running.
 */
@RegisterClass(BaseServerExtension, 'WorkQueueServerExtension')
export class WorkQueueServerExtension extends BaseServerExtension {
    private routes: string[] = [];

    public override get DefaultPhase(): ServerExtensionPhase {
        return 'post-auth';
    }

    public async Initialize(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const { App, Config } = ResolveInit(contextOrApp, config);
            const rootPath = NormalizeRootPath(Config.RootPath);
            const settings = ParseServerSettings(Config.Settings ?? {});
            App.use(rootPath, CreateWorkQueuePublishRouter(CreateDefaultPublishDependencies(settings)));
            this.routes = [`POST ${rootPath}/topics/:topic/messages`];
            return { Success: true, Message: `Work queue publish endpoint mounted at ${rootPath}`, RegisteredRoutes: [...this.routes] };
        } catch (error) {
            return { Success: false, Message: error instanceof Error ? error.message : String(error) };
        }
    }

    public async Shutdown(): Promise<void> {
        // Stateless: in-flight requests finish with the HTTP server; the host shuts down through ShutdownRegistry.
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const host = WorkQueueHost.Active?.GetHealth() ?? null;
        return {
            Healthy: host === null || host.Subscriptions.every(s => s.State !== 'Error'),
            Name: 'WorkQueueServerExtension',
            Details: { Routes: [...this.routes], Host: host },
        };
    }
}

function ResolveInit(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): { App: Application; Config: ServerExtensionConfig } {
    if (typeof contextOrApp === 'function') {
        if (!config) {
            throw new Error('WorkQueueServerExtension.Initialize(app, config) requires a config');
        }
        return { App: contextOrApp, Config: config };
    }
    return { App: contextOrApp.app, Config: contextOrApp.config };
}
