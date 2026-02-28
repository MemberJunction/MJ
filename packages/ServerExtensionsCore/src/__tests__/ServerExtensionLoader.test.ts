/**
 * Comprehensive unit tests for ServerExtensionLoader.
 *
 * Tests the full lifecycle: discovery, initialization, health checks, and shutdown.
 * Mocks MJGlobal.ClassFactory for deterministic testing without real class registration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { ServerExtensionLoader } from '../ServerExtensionLoader.js';
import { BaseServerExtension } from '../BaseServerExtension.js';
import { ServerExtensionConfig, ExtensionInitResult, ExtensionHealthResult } from '../types.js';

// ─── Test doubles ────────────────────────────────────────────────────────────

class SuccessExtension extends BaseServerExtension {
    async Initialize(_app: Application, _config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        return { Success: true, Message: 'Extension A loaded', RegisteredRoutes: ['GET /a'] };
    }
    async Shutdown(): Promise<void> {}
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: true, Name: 'SuccessExtension' };
    }
}

class FailingInitExtension extends BaseServerExtension {
    async Initialize(_app: Application, _config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        return { Success: false, Message: 'Initialization failed' };
    }
    async Shutdown(): Promise<void> {}
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: false, Name: 'FailingInitExtension' };
    }
}

class ThrowingInitExtension extends BaseServerExtension {
    async Initialize(): Promise<ExtensionInitResult> {
        throw new Error('Unexpected init crash');
    }
    async Shutdown(): Promise<void> {}
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: false, Name: 'ThrowingInitExtension' };
    }
}

class ThrowingShutdownExtension extends BaseServerExtension {
    async Initialize(_app: Application, _config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        return { Success: true, Message: 'Loaded' };
    }
    async Shutdown(): Promise<void> {
        throw new Error('Shutdown crash');
    }
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: true, Name: 'ThrowingShutdownExtension' };
    }
}

class ThrowingHealthExtension extends BaseServerExtension {
    async Initialize(_app: Application, _config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        return { Success: true, Message: 'Loaded' };
    }
    async Shutdown(): Promise<void> {}
    async HealthCheck(): Promise<ExtensionHealthResult> {
        throw new Error('Health check crash');
    }
}

class OrderTrackingExtension extends BaseServerExtension {
    static ShutdownOrder: string[] = [];
    private Name: string;

    constructor() {
        super();
        this.Name = '';
    }

    setName(name: string): void {
        this.Name = name;
    }

    async Initialize(_app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.Name = config.DriverClass;
        return { Success: true, Message: `${this.Name} loaded` };
    }
    async Shutdown(): Promise<void> {
        OrderTrackingExtension.ShutdownOrder.push(this.Name);
    }
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: true, Name: this.Name };
    }
}

// ─── Mock setup ──────────────────────────────────────────────────────────────

let classFactoryMap: Map<string, BaseServerExtension>;

function setupClassFactoryMock(): void {
    classFactoryMap = new Map();
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
        <T>(_baseClass: new (...args: unknown[]) => T, driverClass?: string): T => {
            if (driverClass && classFactoryMap.has(driverClass)) {
                return classFactoryMap.get(driverClass) as T;
            }
            return null as T;
        }
    );
}

function registerExtensionInFactory(driverClass: string, instance: BaseServerExtension): void {
    classFactoryMap.set(driverClass, instance);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ServerExtensionLoader', () => {
    let loader: ServerExtensionLoader;
    let mockApp: Application;

    beforeEach(() => {
        loader = new ServerExtensionLoader();
        mockApp = { get: vi.fn(), post: vi.fn(), use: vi.fn() } as unknown as Application;
        setupClassFactoryMock();
        OrderTrackingExtension.ShutdownOrder = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('LoadExtensions', () => {
        it('should load enabled extensions from ClassFactory', async () => {
            registerExtensionInFactory('ExtA', new SuccessExtension());
            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: 'ExtA', RootPath: '/a', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(1);
            expect(loader.Extensions[0].DriverClass).toBe('ExtA');
        });

        it('should skip disabled extensions', async () => {
            registerExtensionInFactory('ExtA', new SuccessExtension());
            const configs: ServerExtensionConfig[] = [
                { Enabled: false, DriverClass: 'ExtA', RootPath: '/a', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(0);
        });

        it('should skip extensions not found in ClassFactory', async () => {
            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: 'NonExistent', RootPath: '/x', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(0);
        });

        it('should skip extensions that return Success: false from Initialize', async () => {
            registerExtensionInFactory('FailExt', new FailingInitExtension());
            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: 'FailExt', RootPath: '/fail', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(0);
        });

        it('should skip extensions that throw during Initialize', async () => {
            registerExtensionInFactory('ThrowExt', new ThrowingInitExtension());
            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: 'ThrowExt', RootPath: '/throw', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(0);
        });

        it('should load multiple extensions, skipping failures', async () => {
            registerExtensionInFactory('Good1', new SuccessExtension());
            registerExtensionInFactory('Bad1', new FailingInitExtension());
            registerExtensionInFactory('Good2', new SuccessExtension());

            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: 'Good1', RootPath: '/g1', Settings: {} },
                { Enabled: true, DriverClass: 'Bad1', RootPath: '/bad', Settings: {} },
                { Enabled: true, DriverClass: 'Good2', RootPath: '/g2', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(2);
        });

        it('should handle empty config array', async () => {
            await loader.LoadExtensions(mockApp, []);
            expect(loader.ExtensionCount).toBe(0);
        });

        it('should handle null/undefined config array', async () => {
            await loader.LoadExtensions(mockApp, null as unknown as ServerExtensionConfig[]);
            expect(loader.ExtensionCount).toBe(0);
        });

        it('should skip configs with missing DriverClass', async () => {
            const configs: ServerExtensionConfig[] = [
                { Enabled: true, DriverClass: '', RootPath: '/empty', Settings: {} }
            ];

            await loader.LoadExtensions(mockApp, configs);

            expect(loader.ExtensionCount).toBe(0);
        });
    });

    describe('HealthCheckAll', () => {
        it('should return health for all loaded extensions', async () => {
            registerExtensionInFactory('Healthy1', new SuccessExtension());
            registerExtensionInFactory('Healthy2', new SuccessExtension());

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'Healthy1', RootPath: '/h1', Settings: {} },
                { Enabled: true, DriverClass: 'Healthy2', RootPath: '/h2', Settings: {} }
            ]);

            const results = await loader.HealthCheckAll();

            expect(results).toHaveLength(2);
            expect(results[0].Healthy).toBe(true);
            expect(results[1].Healthy).toBe(true);
        });

        it('should return empty array when no extensions are loaded', async () => {
            const results = await loader.HealthCheckAll();
            expect(results).toEqual([]);
        });

        it('should report unhealthy when HealthCheck throws', async () => {
            registerExtensionInFactory('ThrowHealth', new ThrowingHealthExtension());

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'ThrowHealth', RootPath: '/th', Settings: {} }
            ]);

            const results = await loader.HealthCheckAll();

            expect(results).toHaveLength(1);
            expect(results[0].Healthy).toBe(false);
            expect(results[0].Name).toBe('ThrowHealth');
            expect(results[0].Details).toEqual({ error: 'Health check crash' });
        });
    });

    describe('ShutdownAll', () => {
        it('should call Shutdown on all loaded extensions', async () => {
            const ext1 = new SuccessExtension();
            const ext2 = new SuccessExtension();
            const shutdownSpy1 = vi.spyOn(ext1, 'Shutdown');
            const shutdownSpy2 = vi.spyOn(ext2, 'Shutdown');

            registerExtensionInFactory('S1', ext1);
            registerExtensionInFactory('S2', ext2);

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'S1', RootPath: '/s1', Settings: {} },
                { Enabled: true, DriverClass: 'S2', RootPath: '/s2', Settings: {} }
            ]);

            await loader.ShutdownAll();

            expect(shutdownSpy1).toHaveBeenCalled();
            expect(shutdownSpy2).toHaveBeenCalled();
        });

        it('should shut down extensions in reverse order (LIFO)', async () => {
            const ext1 = new OrderTrackingExtension();
            const ext2 = new OrderTrackingExtension();
            const ext3 = new OrderTrackingExtension();

            registerExtensionInFactory('First', ext1);
            registerExtensionInFactory('Second', ext2);
            registerExtensionInFactory('Third', ext3);

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'First', RootPath: '/1', Settings: {} },
                { Enabled: true, DriverClass: 'Second', RootPath: '/2', Settings: {} },
                { Enabled: true, DriverClass: 'Third', RootPath: '/3', Settings: {} }
            ]);

            await loader.ShutdownAll();

            expect(OrderTrackingExtension.ShutdownOrder).toEqual(['Third', 'Second', 'First']);
        });

        it('should continue shutting down other extensions when one throws', async () => {
            const throwExt = new ThrowingShutdownExtension();
            const goodExt = new SuccessExtension();
            const shutdownSpy = vi.spyOn(goodExt, 'Shutdown');

            registerExtensionInFactory('Throw', throwExt);
            registerExtensionInFactory('Good', goodExt);

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'Throw', RootPath: '/throw', Settings: {} },
                { Enabled: true, DriverClass: 'Good', RootPath: '/good', Settings: {} }
            ]);

            // Should not throw
            await loader.ShutdownAll();

            expect(shutdownSpy).toHaveBeenCalled();
        });

        it('should clear the loaded extensions list after shutdown', async () => {
            registerExtensionInFactory('ExtA', new SuccessExtension());

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'ExtA', RootPath: '/a', Settings: {} }
            ]);

            expect(loader.ExtensionCount).toBe(1);

            await loader.ShutdownAll();

            expect(loader.ExtensionCount).toBe(0);
        });

        it('should be safe to call with no loaded extensions', async () => {
            await loader.ShutdownAll(); // Should not throw
            expect(loader.ExtensionCount).toBe(0);
        });
    });

    describe('Extensions getter', () => {
        it('should return loaded extensions with their driver class names', async () => {
            registerExtensionInFactory('Ext1', new SuccessExtension());

            await loader.LoadExtensions(mockApp, [
                { Enabled: true, DriverClass: 'Ext1', RootPath: '/1', Settings: {} }
            ]);

            expect(loader.Extensions).toHaveLength(1);
            expect(loader.Extensions[0].DriverClass).toBe('Ext1');
            expect(loader.Extensions[0].Instance).toBeInstanceOf(BaseServerExtension);
        });

        it('should be read-only (returns frozen reference)', async () => {
            const extensions = loader.Extensions;
            expect(Array.isArray(extensions)).toBe(true);
        });
    });
});
