/**
 * Unit tests for the BaseServerExtension abstract class.
 *
 * Since BaseServerExtension is abstract, we test via a concrete subclass
 * that provides minimal implementations of the abstract methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Application } from 'express';
import { BaseServerExtension } from '../BaseServerExtension.js';
import { ServerExtensionConfig, ExtensionInitResult, ExtensionHealthResult } from '../types.js';

/** Concrete test double for BaseServerExtension. */
class TestExtension extends BaseServerExtension {
    public InitializeCalled = false;
    public ShutdownCalled = false;
    public HealthCheckCalled = false;
    public LastApp: Application | null = null;
    public LastConfig: ServerExtensionConfig | null = null;
    public ShouldFail = false;

    async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.InitializeCalled = true;
        this.LastApp = app;
        this.LastConfig = config;
        if (this.ShouldFail) {
            return { Success: false, Message: 'Forced failure' };
        }
        return { Success: true, Message: 'Test extension initialized', RegisteredRoutes: ['GET /test'] };
    }

    async Shutdown(): Promise<void> {
        this.ShutdownCalled = true;
    }

    async HealthCheck(): Promise<ExtensionHealthResult> {
        this.HealthCheckCalled = true;
        return { Healthy: true, Name: 'TestExtension' };
    }
}

/** Extension with optional OnConfigurationChange. */
class ConfigChangeExtension extends TestExtension {
    public NewConfigReceived: ServerExtensionConfig | null = null;

    async OnConfigurationChange(newConfig: ServerExtensionConfig): Promise<void> {
        this.NewConfigReceived = newConfig;
    }
}

describe('BaseServerExtension', () => {
    let mockApp: Application;
    let config: ServerExtensionConfig;

    beforeEach(() => {
        mockApp = { get: vi.fn(), post: vi.fn(), use: vi.fn() } as unknown as Application;
        config = {
            Enabled: true,
            DriverClass: 'TestExtension',
            RootPath: '/test',
            Settings: { someSetting: 'value' }
        };
    });

    describe('Initialize', () => {
        it('should receive the Express app and config', async () => {
            const ext = new TestExtension();
            await ext.Initialize(mockApp, config);
            expect(ext.InitializeCalled).toBe(true);
            expect(ext.LastApp).toBe(mockApp);
            expect(ext.LastConfig).toBe(config);
        });

        it('should return success result with registered routes', async () => {
            const ext = new TestExtension();
            const result = await ext.Initialize(mockApp, config);
            expect(result.Success).toBe(true);
            expect(result.Message).toBe('Test extension initialized');
            expect(result.RegisteredRoutes).toEqual(['GET /test']);
        });

        it('should return failure result when initialization fails', async () => {
            const ext = new TestExtension();
            ext.ShouldFail = true;
            const result = await ext.Initialize(mockApp, config);
            expect(result.Success).toBe(false);
            expect(result.Message).toBe('Forced failure');
        });
    });

    describe('Shutdown', () => {
        it('should be callable after initialization', async () => {
            const ext = new TestExtension();
            await ext.Initialize(mockApp, config);
            await ext.Shutdown();
            expect(ext.ShutdownCalled).toBe(true);
        });

        it('should be callable without prior initialization', async () => {
            const ext = new TestExtension();
            await ext.Shutdown();
            expect(ext.ShutdownCalled).toBe(true);
        });
    });

    describe('HealthCheck', () => {
        it('should return health status', async () => {
            const ext = new TestExtension();
            const result = await ext.HealthCheck();
            expect(result.Healthy).toBe(true);
            expect(result.Name).toBe('TestExtension');
            expect(ext.HealthCheckCalled).toBe(true);
        });
    });

    describe('OnConfigurationChange', () => {
        it('should be optional and callable when implemented', async () => {
            const ext = new ConfigChangeExtension();
            const newConfig: ServerExtensionConfig = {
                Enabled: true,
                DriverClass: 'ConfigChangeExtension',
                RootPath: '/changed',
                Settings: { newSetting: 'new-value' }
            };
            await ext.OnConfigurationChange!(newConfig);
            expect(ext.NewConfigReceived).toBe(newConfig);
        });

        it('should not exist on base implementations without it', () => {
            const ext = new TestExtension();
            expect(ext.OnConfigurationChange).toBeUndefined();
        });
    });
});
