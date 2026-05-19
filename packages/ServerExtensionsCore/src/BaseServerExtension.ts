/**
 * @module @memberjunction/server-extensions-core
 * @description Abstract base class for MJServer extensions.
 */

import { Application } from 'express';
import { ServerExtensionConfig, ExtensionInitResult, ExtensionHealthResult } from './types.js';

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
 * 1. MJServer reads `serverExtensions[]` from `mj.config.cjs`
 * 2. For each enabled entry, looks up `@RegisterClass(BaseServerExtension, driverClass)`
 * 3. Creates instance via `ClassFactory.CreateInstance()`
 * 4. Calls `Initialize(app, config)` — extension registers routes
 * 5. Periodic `HealthCheck()` calls for monitoring
 * 6. On server shutdown, calls `Shutdown()` for cleanup
 *
 * ## Usage
 *
 * ```typescript
 * import { RegisterClass } from '@memberjunction/global';
 * import { BaseServerExtension, ServerExtensionConfig, ExtensionInitResult } from '@memberjunction/server-extensions-core';
 *
 * @RegisterClass(BaseServerExtension, 'MyCustomExtension')
 * export class MyCustomExtension extends BaseServerExtension {
 *     async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
 *         app.get(config.RootPath + '/hello', (_req, res) => {
 *             res.json({ message: 'Hello from my extension!' });
 *         });
 *         return { Success: true, Message: 'Custom extension loaded', RegisteredRoutes: [`GET ${config.RootPath}/hello`] };
 *     }
 *
 *     async Shutdown(): Promise<void> {
 *         // Clean up resources
 *     }
 *
 *     async HealthCheck(): Promise<ExtensionHealthResult> {
 *         return { Healthy: true, Name: 'MyCustomExtension' };
 *     }
 * }
 * ```
 *
 * ## Auth Middleware
 *
 * Extensions handle their own authentication by default. If you want to leverage
 * MJServer's built-in auth middleware, import it from `@memberjunction/server`:
 *
 * ```typescript
 * import { getSystemUser, verifyUserRecord } from '@memberjunction/server';
 * ```
 *
 * This is opt-in — extensions like Slack/Teams use platform-specific auth
 * (signature verification, Bot Framework JWT) instead.
 */
export abstract class BaseServerExtension {
    /**
     * Initialize the extension. Called once during MJServer startup.
     *
     * Use this to register Express routes, set up WebSocket handlers,
     * initialize connections, and prepare the extension for operation.
     *
     * @param app - The Express application instance to register routes on.
     *              Routes should be registered under `config.RootPath`.
     * @param config - Extension-specific configuration from `mj.config.cjs`.
     *                 The `Settings` object contains extension-specific config.
     * @returns A result indicating whether initialization succeeded.
     *          On failure, the extension is skipped but other extensions still load.
     */
    abstract Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult>;

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
