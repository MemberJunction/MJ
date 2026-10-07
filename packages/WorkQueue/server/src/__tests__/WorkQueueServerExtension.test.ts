import { describe, it, expect } from 'vitest';
import type { Application } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { BaseServerExtension } from '@memberjunction/server-extensions-core';
import type { ServerExtensionConfig, ServerExtensionInitContext } from '@memberjunction/server-extensions-core';
import { NormalizeRootPath, WorkQueueServerExtension } from '../WorkQueueServerExtension';

interface FakeApp {
    App: Application;
    Uses: string[];
}

function fakeApp(): FakeApp {
    const uses: string[] = [];
    const app = Object.assign(function fakeExpressApp(): void {}, {
        use: (path: string) => {
            uses.push(path);
            return app;
        },
    });
    return { App: app as unknown as Application, Uses: uses };
}

function config(overrides: Partial<ServerExtensionConfig> = {}): ServerExtensionConfig {
    return { Enabled: true, DriverClass: 'WorkQueueServerExtension', RootPath: '/work-queue', Phase: 'post-auth', Settings: {}, ...overrides };
}

describe('WorkQueueServerExtension', () => {
    it('registers under its driver class and mounts after authentication', () => {
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseServerExtension, 'WorkQueueServerExtension')?.SubClass).toBe(WorkQueueServerExtension);
        expect(new WorkQueueServerExtension().DefaultPhase).toBe('post-auth');
    });

    it('mounts the router at the normalized root path (legacy signature) and reports the route', async () => {
        const { App, Uses } = fakeApp();
        const result = await new WorkQueueServerExtension().Initialize(App, config({ RootPath: 'queues/' }));
        expect(Uses).toEqual(['/queues']);
        expect(result).toMatchObject({ Success: true, RegisteredRoutes: ['POST /queues/topics/:topic/messages'] });
        expect(NormalizeRootPath('queues/')).toBe('/queues');
    });

    it('accepts the context signature and reports invalid settings without mounting', async () => {
        const { App, Uses } = fakeApp();
        const context = { app: App, config: config({ Settings: { MaxBatch: 0 } }), phase: 'post-auth' } as unknown as ServerExtensionInitContext;
        const result = await new WorkQueueServerExtension().Initialize(context);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('Settings.MaxBatch');
        expect(Uses).toEqual([]);
    });

    it('reports healthy with no host running in this process', async () => {
        const health = await new WorkQueueServerExtension().HealthCheck();
        expect(health).toEqual({ Healthy: true, Name: 'WorkQueueServerExtension', Details: { Routes: [], Host: null } });
    });
});
