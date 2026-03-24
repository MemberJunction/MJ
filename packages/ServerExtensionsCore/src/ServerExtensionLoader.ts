/**
 * @module @memberjunction/server-extensions-core
 * @description Discovers, initializes, and manages server extensions.
 */

import { Application } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseServerExtension } from './BaseServerExtension.js';
import {
    ServerExtensionConfig,
    ExtensionHealthResult,
} from './types.js';

/**
 * Tracks a loaded extension instance along with its configuration and identity.
 */
interface LoadedExtension {
    /** The instantiated extension. */
    Instance: BaseServerExtension;

    /** The configuration that was used to initialize this extension. */
    Config: ServerExtensionConfig;

    /** The DriverClass name used for ClassFactory lookup. */
    DriverClass: string;
}

/**
 * Discovers, initializes, and manages the lifecycle of server extensions.
 *
 * Called by MJServer's `serve()` function during startup. The loader reads the
 * `serverExtensions` array from `mj.config.cjs`, uses MJ's `ClassFactory` to
 * find registered extension classes, and calls `Initialize()` on each.
 *
 * ## Discovery Flow
 *
 * 1. Reads `serverExtensions[]` array from `mj.config.cjs`
 * 2. For each enabled entry, uses `ClassFactory.CreateInstance(BaseServerExtension, driverClass)`
 * 3. Creates an instance and calls `Initialize(app, config)`
 * 4. Tracks all loaded extensions for health checks and shutdown
 *
 * ## Usage
 *
 * ```typescript
 * import { ServerExtensionLoader } from '@memberjunction/server-extensions-core';
 *
 * const loader = new ServerExtensionLoader();
 * await loader.LoadExtensions(app, configInfo.serverExtensions);
 *
 * // Health check
 * const health = await loader.HealthCheckAll();
 *
 * // Graceful shutdown
 * await loader.ShutdownAll();
 * ```
 */
export class ServerExtensionLoader {
    private _loadedExtensions: LoadedExtension[] = [];

    /**
     * Load and initialize all enabled extensions from config.
     *
     * Extensions that fail to initialize are logged and skipped — they do not
     * prevent other extensions from loading. This ensures one broken extension
     * doesn't take down the entire server.
     *
     * @param app - Express application for route registration.
     * @param extensionConfigs - Array of extension configs from `mj.config.cjs`.
     */
    public async LoadExtensions(
        app: Application,
        extensionConfigs: ServerExtensionConfig[]
    ): Promise<void> {
        if (!extensionConfigs || extensionConfigs.length === 0) {
            LogStatus('No server extensions configured');
            return;
        }

        for (const config of extensionConfigs) {
            if (!config.Enabled) {
                LogStatus(`Server extension '${config.DriverClass}' is disabled, skipping`);
                continue;
            }

            await this.loadSingleExtension(app, config);
        }

        LogStatus(`Loaded ${this._loadedExtensions.length} server extension(s)`);
    }

    /**
     * Run health checks on all loaded extensions.
     *
     * Each extension's `HealthCheck()` is called independently. If one extension's
     * health check throws, it is reported as unhealthy without affecting others.
     *
     * @returns Array of health results, one per loaded extension.
     */
    public async HealthCheckAll(): Promise<ExtensionHealthResult[]> {
        const results: ExtensionHealthResult[] = [];

        for (const ext of this._loadedExtensions) {
            try {
                const health = await ext.Instance.HealthCheck();
                results.push(health);
            } catch (error) {
                results.push({
                    Healthy: false,
                    Name: ext.DriverClass,
                    Details: { error: error instanceof Error ? error.message : String(error) }
                });
            }
        }

        return results;
    }

    /**
     * Shut down all loaded extensions gracefully.
     *
     * Called during MJServer's shutdown sequence (SIGTERM/SIGINT).
     * Extensions are shut down in reverse order of loading.
     * Errors during shutdown are logged but do not prevent other extensions from shutting down.
     */
    public async ShutdownAll(): Promise<void> {
        // Shut down in reverse order of loading (LIFO)
        for (let i = this._loadedExtensions.length - 1; i >= 0; i--) {
            const ext = this._loadedExtensions[i];
            try {
                await ext.Instance.Shutdown();
                LogStatus(`Server extension '${ext.DriverClass}' shut down`);
            } catch (error) {
                LogError(`Error shutting down extension '${ext.DriverClass}':`, undefined, error);
            }
        }
        this._loadedExtensions = [];
    }

    /**
     * Get all loaded extension instances for inspection or testing.
     *
     * @returns Read-only array of loaded extensions with their driver class names.
     */
    public get Extensions(): ReadonlyArray<{ Instance: BaseServerExtension; DriverClass: string }> {
        return this._loadedExtensions;
    }

    /**
     * Get the number of currently loaded extensions.
     */
    public get ExtensionCount(): number {
        return this._loadedExtensions.length;
    }

    /**
     * Load and initialize a single extension from config.
     *
     * Uses MJ's `ClassFactory` to look up the registered class by `DriverClass` name,
     * creates an instance, and calls `Initialize()`. On failure, logs the error and
     * continues without throwing.
     */
    private async loadSingleExtension(
        app: Application,
        config: ServerExtensionConfig
    ): Promise<void> {
        const driverClass = config.DriverClass;

        if (!driverClass) {
            LogError('Server extension config missing DriverClass, skipping');
            return;
        }

        try {
            // Use MJ's ClassFactory to find the registered extension class
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseServerExtension>(
                BaseServerExtension,
                driverClass
            );

            if (!instance) {
                LogError(
                    `Server extension '${driverClass}' not found in ClassFactory. ` +
                    `Ensure the package is imported and the class uses ` +
                    `@RegisterClass(BaseServerExtension, '${driverClass}')`
                );
                return;
            }

            const result = await instance.Initialize(app, config);

            if (result.Success) {
                this._loadedExtensions.push({ Instance: instance, Config: config, DriverClass: driverClass });
                LogStatus(`Server extension '${driverClass}' initialized: ${result.Message}`);
                if (result.RegisteredRoutes && result.RegisteredRoutes.length > 0) {
                    LogStatus(`  Routes: ${result.RegisteredRoutes.join(', ')}`);
                }
            } else {
                LogError(`Server extension '${driverClass}' failed to initialize: ${result.Message}`);
            }
        } catch (error) {
            LogError(`Error loading server extension '${driverClass}':`, undefined, error);
        }
    }
}
