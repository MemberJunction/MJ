import type { Application } from 'express';
import type { Server as HttpServer } from 'http';

/**
 * Lifecycle phase for a server extension.
 * - 'pre-auth': Mounted before JWT authentication middleware. Used for webhooks,
 *   health checks, media stream endpoints, SSO handshakes, etc.
 * - 'post-auth': Mounted after JWT authentication middleware. Protected by default.
 */
export type ServerExtensionPhase = 'pre-auth' | 'post-auth';

/**
 * Configuration for a server extension instance.
 *
 * Loaded from the host `serverExtensions[]` in `mj.config.cjs`, and/or discovered
 * from installed Open App server packages (`MJ_SERVER_EXTENSIONS` export or
 * `package.json` `memberjunction.serverExtensions`). Host entries overlay
 * discovered ones by `DriverClass`.
 *
 * Each entry corresponds to one extension instance. The `DriverClass`
 * field is used to look up the registered class via `ClassFactory.CreateInstance()`.
 *
 * @example
 * ```javascript
 * // mj.config.cjs
 * module.exports = {
 *     serverExtensions: [
 *         {
 *             Enabled: true,
 *             DriverClass: 'SlackMessagingExtension',
 *             RootPath: '/webhook/slack',
 *             Phase: 'pre-auth',
 *             Settings: {
 *                 AgentID: '...',
 *                 BotToken: process.env.SLACK_BOT_TOKEN,
 *             }
 *         }
 *     ]
 * };
 * ```
 */
export interface ServerExtensionConfig {
    /** Whether this extension is enabled. Disabled extensions are skipped during loading. */
    Enabled: boolean;

    /**
     * The `@RegisterClass` key used to look up this extension in ClassFactory.
     * Must match the second argument of `@RegisterClass(BaseServerExtension, 'DriverClass')`.
     */
    DriverClass: string;

    /**
     * URL path prefix for this extension's routes (e.g., `'/webhook/slack'`).
     * The extension registers its routes under this prefix on the Express app.
     */
    RootPath: string;

    /**
     * Lifecycle phase for this extension. Defaults to the extension class's `DefaultPhase`
     * (usually `'pre-auth'`) when not specified.
     */
    Phase?: ServerExtensionPhase;

    /**
     * Extension-specific configuration. The shape varies by extension type.
     * For messaging adapters, this contains `AgentID`, `BotToken`, etc.
     * The extension is responsible for parsing and validating its own settings.
     */
    Settings: Record<string, unknown>;
}

/**
 * Service registry shared among server extensions, enabling cross-extension
 * service registration and consumption.
 */
export interface ServerExtensionServiceRegistry {
    /**
     * Register a service instance under a unique key.
     * Throws or logs if a service with the same key is already registered.
     */
    RegisterService<T extends object>(key: string, service: T): void;

    /**
     * Retrieve a registered service instance by key.
     * Returns undefined if no service is registered under that key.
     */
    GetService<T extends object>(key: string): T | undefined;

    /**
     * Check if a service is registered under the given key.
     */
    HasService(key: string): boolean;

    /**
     * Optional accessor returning all registered services as a read-only map.
     */
    GetAllServices?(): ReadonlyMap<string, object>;
}

/**
 * Context passed to `BaseServerExtension.Initialize()` and `OnAllExtensionsMounted()`.
 */
export interface ServerExtensionInitContext {
    /** Express application instance to mount routes on. */
    app: Application;

    /** Node HTTP/HTTPS server instance, if available (e.g. for WebSocket attachment). */
    httpServer?: HttpServer;

    /** Extension configuration from mj.config.cjs or Open App metadata. */
    config: ServerExtensionConfig;

    /** Canonical public base URL of the MJ server (e.g. 'https://api.example.com'). */
    publicUrl?: string;

    /** Shared service registry for cross-extension service lookup and registration. */
    services: ServerExtensionServiceRegistry;

    /** Current lifecycle phase being mounted ('pre-auth' | 'post-auth'). */
    phase: ServerExtensionPhase;
}

/**
 * Result returned from extension initialization.
 * Extensions report whether startup succeeded and what routes they registered.
 */
export interface ExtensionInitResult {
    /** Whether initialization succeeded. If `false`, the extension is not loaded. */
    Success: boolean;

    /** Human-readable status message, logged by the extension loader. */
    Message: string;

    /**
     * Routes registered by this extension. Used for logging and health check reporting.
     * @example `['POST /webhook/slack', 'GET /webhook/slack/health']`
     */
    RegisteredRoutes?: string[];

    /**
     * Indicates the extension chose not to load because it isn't actually configured
     * (e.g., missing required secrets, placeholder defaults still in place). When `true`,
     * the loader treats this as a quiet, expected condition rather than an error: no
     * `LogError` is emitted, and the skip line itself is verbose-only (only printed when
     * `MJ_VERBOSE` is enabled). Implies `Success: false`.
     */
    Skipped?: boolean;

    /**
     * Optional service instance provided by this extension to be registered in the shared
     * service registry (under `config.DriverClass` and/or a custom key).
     */
    Service?: object;
}

/**
 * Health check result for a single extension.
 * Returned by `BaseServerExtension.HealthCheck()` and aggregated by `ServerExtensionLoader`.
 */
export interface ExtensionHealthResult {
    /** Whether the extension is healthy and able to process requests. */
    Healthy: boolean;

    /** Human-readable name of the extension (typically the DriverClass). */
    Name: string;

    /** Optional details about the health status (uptime, last error, queue depth, etc.). */
    Details?: Record<string, unknown>;
}
