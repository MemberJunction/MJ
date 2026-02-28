/**
 * @module @memberjunction/server-extensions-core
 * @description Core types for the MJServer extension framework.
 */

/**
 * Configuration for a server extension instance, loaded from the `serverExtensions`
 * array in `mj.config.cjs`.
 *
 * Each entry in the array corresponds to one extension instance. The `DriverClass`
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
     * Extension-specific configuration. The shape varies by extension type.
     * For messaging adapters, this contains `AgentID`, `BotToken`, etc.
     * The extension is responsible for parsing and validating its own settings.
     */
    Settings: Record<string, unknown>;
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
