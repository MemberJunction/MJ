import { Application } from 'express';
import type { Server as HttpServer } from 'http';
import { MJGlobal } from '@memberjunction/global';
import { LogError, LogStatus, LogStatusEx } from '@memberjunction/core';
import { BaseServerExtension } from './BaseServerExtension.js';
import {
    ServerExtensionConfig,
    ServerExtensionPhase,
    ServerExtensionServiceRegistry,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
} from './types.js';

/**
 * In-memory implementation of the ServerExtensionServiceRegistry.
 */
export class DefaultServerExtensionServiceRegistry implements ServerExtensionServiceRegistry {
    private _services = new Map<string, object>();

    public RegisterService<T extends object>(key: string, service: T): void {
        const trimmed = key.trim();
        if (!trimmed) {
            throw new Error('Service key cannot be empty');
        }
        if (this._services.has(trimmed)) {
            LogStatus(`Service '${trimmed}' is already registered in ServerExtensionServiceRegistry; replacing with new instance`);
        }
        this._services.set(trimmed, service);
    }

    public GetService<T extends object>(key: string): T | undefined {
        return this._services.get(key.trim()) as T | undefined;
    }

    public HasService(key: string): boolean {
        return this._services.has(key.trim());
    }

    public GetAllServices(): ReadonlyMap<string, object> {
        return this._services;
    }
}

/**
 * Options passed to `ServerExtensionLoader.LoadExtensions()`.
 */
export interface LoadExtensionsOptions {
    /**
     * Optional filter for lifecycle phase.
     * When provided, only extensions matching this phase are initialized.
     * An extension's phase is `config.Phase ?? instance.DefaultPhase`.
     */
    phase?: ServerExtensionPhase;

    /** Node HTTP/HTTPS server instance (for WebSockets, media streaming, etc.). */
    httpServer?: HttpServer;

    /** Canonical public base URL of the MJ server. */
    publicUrl?: string;

    /** Custom service registry if not using the loader's default. */
    services?: ServerExtensionServiceRegistry;
}

/**
 * Tracks a loaded extension instance along with its configuration, identity, and context.
 */
interface LoadedExtension {
    /** The instantiated extension. */
    Instance: BaseServerExtension;

    /** The configuration that was used to initialize this extension. */
    Config: ServerExtensionConfig;

    /** The DriverClass name used for ClassFactory lookup. */
    DriverClass: string;

    /** The context used to initialize this extension. */
    Context: ServerExtensionInitContext;
}

/**
 * Discovers, initializes, and manages the lifecycle of server extensions.
 *
 * Called by MJServer's `serve()` function during startup. The loader receives
 * the merged extension list (Open App–discovered configs overlaid by host
 * `mj.config.cjs` `serverExtensions[]`), uses MJ's `ClassFactory` to find
 * registered extension classes, and calls `Initialize()` on each.
 *
 * Supports phased loading (pre-auth ahead of JWT middleware, post-auth behind it)
 * and cross-extension service lookup and registration.
 */
export class ServerExtensionLoader {
    private _loadedExtensions: LoadedExtension[] = [];
    private _services: ServerExtensionServiceRegistry = new DefaultServerExtensionServiceRegistry();

    /**
     * The shared service registry for cross-extension service lookup and registration.
     */
    public get Services(): ServerExtensionServiceRegistry {
        return this._services;
    }

    /**
     * Load and initialize all enabled extensions from config.
     *
     * Extensions that fail to initialize are logged and skipped — they do not
     * prevent other extensions from loading. This ensures one broken extension
     * doesn't take down the entire server.
     *
     * @param app - Express application for route registration.
     * @param extensionConfigs - Array of extension configs from `mj.config.cjs`.
     * @param options - Phased loading, HTTP server, and URL options.
     */
    public async LoadExtensions(
        app: Application,
        extensionConfigs: ServerExtensionConfig[],
        options?: LoadExtensionsOptions
    ): Promise<void> {
        if (!extensionConfigs || extensionConfigs.length === 0) {
            return;
        }

        let loadedCountThisPass = 0;

        for (const config of extensionConfigs) {
            if (!config.Enabled) {
                LogStatus(`Server extension '${config.DriverClass}' is disabled, skipping`);
                continue;
            }

            const loaded = await this.loadSingleExtension(app, config, options);
            if (loaded) {
                loadedCountThisPass++;
            }
        }

        if (loadedCountThisPass > 0) {
            const phaseLabel = options?.phase ? ` (${options.phase})` : '';
            LogStatus(`Loaded ${loadedCountThisPass} server extension(s)${phaseLabel}`);
        }
    }

    /**
     * Notify all loaded extensions across all phases that all extensions have been mounted.
     * Calls `OnAllExtensionsMounted(context)` on each extension that implements it.
     */
    public async NotifyAllExtensionsMounted(options?: {
        httpServer?: HttpServer;
        publicUrl?: string;
    }): Promise<void> {
        for (const ext of this._loadedExtensions) {
            if (typeof ext.Instance.OnAllExtensionsMounted === 'function') {
                try {
                    const context: ServerExtensionInitContext = {
                        app: ext.Context.app,
                        httpServer: options?.httpServer ?? ext.Context.httpServer,
                        config: ext.Config,
                        publicUrl: options?.publicUrl ?? ext.Context.publicUrl,
                        services: this._services,
                        phase: ext.Config.Phase ?? ext.Instance.DefaultPhase ?? 'pre-auth',
                    };
                    await ext.Instance.OnAllExtensionsMounted(context);
                    LogStatus(`Server extension '${ext.DriverClass}' OnAllExtensionsMounted completed`);
                } catch (error) {
                    LogError(`Error in OnAllExtensionsMounted for extension '${ext.DriverClass}':`, undefined, error);
                }
            }
        }
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
    public get Extensions(): ReadonlyArray<{ Instance: BaseServerExtension; DriverClass: string; Config: ServerExtensionConfig }> {
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
        config: ServerExtensionConfig,
        options?: LoadExtensionsOptions
    ): Promise<boolean> {
        const driverClass = config.DriverClass;

        if (!driverClass) {
            LogError('Server extension config missing DriverClass, skipping');
            return false;
        }

        // Avoid re-loading an extension that was already loaded in a previous phase
        if (this._loadedExtensions.some((e) => e.DriverClass === driverClass)) {
            return false;
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
                return false;
            }

            const effectivePhase: ServerExtensionPhase = config.Phase ?? instance.DefaultPhase ?? 'pre-auth';

            // If a specific phase filter is requested and this extension doesn't match, skip for now
            if (options?.phase && options.phase !== effectivePhase) {
                return false;
            }

            const services = options?.services ?? this._services;
            const context: ServerExtensionInitContext = {
                app,
                httpServer: options?.httpServer,
                config: { ...config, Phase: effectivePhase },
                publicUrl: options?.publicUrl,
                services,
                phase: effectivePhase,
            };

            let result: ExtensionInitResult;
            if (instance.Initialize.length >= 2) {
                result = await (instance.Initialize as (app: Application, config: ServerExtensionConfig) => Promise<ExtensionInitResult>)(app, config);
            } else {
                result = await (instance.Initialize as (ctx: ServerExtensionInitContext) => Promise<ExtensionInitResult>)(context);
            }

            if (result.Success) {
                if (result.Service) {
                    services.RegisterService(driverClass, result.Service);
                }
                this._loadedExtensions.push({
                    Instance: instance,
                    Config: { ...config, Phase: effectivePhase },
                    DriverClass: driverClass,
                    Context: context,
                });
                LogStatus(`Server extension '${driverClass}' initialized (${effectivePhase}): ${result.Message}`);
                if (result.RegisteredRoutes && result.RegisteredRoutes.length > 0) {
                    LogStatus(`  Routes: ${result.RegisteredRoutes.join(', ')}`);
                }
                return true;
            } else if (result.Skipped) {
                LogStatusEx({
                    message: `Server extension '${driverClass}' skipped: ${result.Message}`,
                    verboseOnly: true
                });
                return false;
            } else {
                LogError(`Server extension '${driverClass}' failed to initialize: ${result.Message}`);
                return false;
            }
        } catch (error) {
            LogError(`Error loading server extension '${driverClass}':`, undefined, error);
            return false;
        }
    }
}
