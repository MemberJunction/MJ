/**
 * @module @memberjunction/server-extensions-core
 * @description Abstract base class for MJServer extensions.
 */

import { Application } from 'express';
import {
    ServerExtensionConfig,
    ServerExtensionPhase,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
} from './types.js';

/**
 * Abstract base class for MJServer extensions.
 *
 * Extensions are discovered via `@RegisterClass(BaseServerExtension, 'DriverClassName')`
 * and matched to config entries in `mj.config.cjs` by their `DriverClass` name.
 *
 * MJServer calls `Initialize()` during startup, passing the Express app so the
 * extension can register its own routes, middleware, and lifecycle hooks.
 *
 * ## Lifecycle
 *
 * 1. MJServer loads the merged `serverExtensions[]` (Open App packages + host overlay)
 * 2. For each enabled entry, looks up `@RegisterClass(BaseServerExtension, driverClass)`
 * 3. Creates instance via `ClassFactory.CreateInstance()`
 * 4. Calls `Initialize(context)` (or legacy `Initialize(app, config)`) — extension registers routes
 * 5. After all extensions across both pre-auth and post-auth phases are mounted,
 *    calls `OnAllExtensionsMounted(context)` if implemented
 * 6. Periodic `HealthCheck()` calls for monitoring
 * 7. On server shutdown, calls `Shutdown()` for cleanup
 */
export abstract class BaseServerExtension {
    /**
     * Default lifecycle phase for this extension when unspecified in configuration.
     * Defaults to `'pre-auth'` for backwards compatibility.
     */
    public get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    /**
     * Initialize the extension. Called once during MJServer startup.
     *
     * Supports both modern context-based signature:
     *   `Initialize(context: ServerExtensionInitContext): Promise<ExtensionInitResult>`
     * and legacy 2-argument signature:
     *   `Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult>`
     */
    abstract Initialize(
        contextOrApp: ServerExtensionInitContext | Application,
        config?: ServerExtensionConfig
    ): Promise<ExtensionInitResult>;

    /**
     * Optional lifecycle hook called after ALL extensions have been mounted across all phases.
     * Ideal for cross-extension service wiring (e.g. connecting a webhook router to a telephony service).
     */
    OnAllExtensionsMounted?(context: ServerExtensionInitContext): Promise<void>;

    /**
     * Graceful shutdown. Called when MJServer is shutting down (SIGTERM/SIGINT).
     *
     * Clean up connections, drain in-flight requests, close WebSocket connections,
     * and release any resources held by the extension.
     *
     * This method should complete within a reasonable timeout (< 5 seconds).
     * MJServer enforces a 10-second forced shutdown if graceful shutdown hangs.
     */
    abstract Shutdown(): Promise<void>;

    /**
     * Health check for this extension.
     *
     * Called by MJServer's aggregate `/health/extensions` endpoint.
     * Should be fast (< 100ms) and non-blocking.
     *
     * @returns Health status including whether the extension is operational.
     */
    abstract HealthCheck(): Promise<ExtensionHealthResult>;

    /**
     * Optional: Called when configuration changes at runtime.
     *
     * Not all extensions need to support hot-reloading of configuration.
     * Override this method if your extension can dynamically adjust its
     * behavior without a full restart.
     *
     * @param newConfig - The updated configuration from `mj.config.cjs`.
     */
    OnConfigurationChange?(newConfig: ServerExtensionConfig): Promise<void>;
}
