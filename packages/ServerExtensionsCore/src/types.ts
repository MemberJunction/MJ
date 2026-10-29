import type { Application } from 'express';
import type { Server as HttpServer } from 'http';
import type { DatabaseProviderBase, IMetadataProvider, UserInfo } from '@memberjunction/core';

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
     * When `true`, this extension owns the CORS policy for every request under its `RootPath`,
     * and MJServer's global CORS middleware skips those paths. Defaults to `false`.
     *
     * Without this, MJServer's global CORS runs ahead of every extension. It reflects any
     * allowed origin onto the extension's responses, including its refusals, and it answers
     * every preflight (`OPTIONS`) with `204` itself, so the extension's own `OPTIONS` handler
     * never runs. An extension with its own origin policy, such as a public pre-auth endpoint
     * whose allowed origins are set per resource, cannot enforce that policy.
     *
     * With `OwnsCORS: true`:
     * - no `Access-Control-*` header is added to any response under `RootPath` by MJServer;
     * - preflight requests reach the extension's routes, so the extension must answer
     *   `OPTIONS` itself (for example with the `cors` package and an origin callback);
     * - a path without CORS headers is not readable cross-origin, so an extension that
     *   forgets to answer is closed, not open.
     *
     * Matching follows Express mount semantics: case-insensitive, on a path-segment
     * boundary (`/ballot` owns `/ballot` and `/ballot/x`, not `/ballots`). Disabled entries
     * own nothing. MJServer's auth middleware passes `OPTIONS` through, so the flag also
     * works for `'post-auth'` extensions; their 401 responses then carry no CORS headers
     * unless the extension adds them.
     *
     * Open Apps can set this in their published `MJ_SERVER_EXTENSIONS` entries; the host
     * `mj.config.cjs` `serverExtensions[]` overlay can override it by `DriverClass`.
     */
    OwnsCORS?: boolean;

    /**
     * Extension-specific configuration. The shape varies by extension type.
     * For messaging adapters, this contains `AgentID`, `BotToken`, etc.
     * The extension is responsible for parsing and validating its own settings.
     */
    Settings: Record<string, unknown>;
}

/**
 * Well-known registry keys under which MJServer registers built-in host services on
 * {@link ServerExtensionServiceRegistry} (`context.services`). Extensions can retrieve them
 * via `context.services.GetMagicLinkService?.()` / `context.services.GetHostRuntimeService?.()`
 * or `context.services.GetService(SERVER_EXTENSION_CORE_SERVICE_KEYS.MagicLink)`.
 */
export const SERVER_EXTENSION_CORE_SERVICE_KEYS = {
    /** Programmatic magic-link invite creation, revocation, expiry management, and session verification. */
    MagicLink: 'MJ:MagicLinkService',
    /** Isolated database provider factory and server principal resolution helpers. */
    HostRuntime: 'MJ:HostRuntimeService',
} as const;

/** Parameters for creating a magic-link invite from a Server Extension. */
export interface ServerExtensionCreateMagicLinkParams {
    email: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteParams wire/API shape
    ApplicationId: string;
    RoleId?: string;
    ExpiresInHours?: number;
    MaxUses?: number;
    firstName?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteParams wire/API shape
    lastName?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteParams wire/API shape
    /**
     * Optional per-invite post-redemption redirect URL (must match the host's allowed frontend origins).
     * Cryptographically bound to the invite's token hash so it cannot be tampered with in transit.
     */
    RedirectUrl?: string;
    /**
     * When `false`, skips MJServer's default invite email delivery and returns `rawToken` + `redemptionUrl`
     * so the extension can send its own branded message. Defaults to `true` when a communication provider is configured.
     */
    SendEmail?: boolean;
}

/** Result returned when a Server Extension creates a magic-link invite. */
export interface ServerExtensionCreateMagicLinkResult {
    success: boolean; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    inviteId?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    redemptionUrl?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    rawToken?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    emailSent?: boolean; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    expiresAt?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    error?: string; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
    errorCode?: 'forbidden' | 'invalid_role' | 'invalid_redirect_url'; // case-violation-ok-legacy-back-compat: matches MJServer CreateMagicLinkInviteResult shape
}

/** Result returned when a Server Extension revokes or updates expiry on a magic-link invite. */
export interface ServerExtensionManageMagicLinkResult {
    success: boolean; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions
    inviteId?: string; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions
    status?: string; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions (tracks MJMagicLinkInviteEntity['Status'])
    expiresAt?: string; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions
    error?: string; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions
    errorCode?: 'forbidden' | 'not_found' | 'invalid_state' | 'invalid_expiry' | 'server_error'; // case-violation-ok-legacy-back-compat: matches MJServer MagicLink result conventions
}

/** Scope entry carried inside a verified magic-link session JWT. */
export interface ServerExtensionMagicLinkScopeEntry {
    inviteId: string; // case-violation-ok-legacy-back-compat: matches MagicLinkScopeEntry JWT claim shape
    appId: string; // case-violation-ok-legacy-back-compat: matches MagicLinkScopeEntry JWT claim shape
    role?: string; // case-violation-ok-legacy-back-compat: matches MagicLinkScopeEntry JWT claim shape
    resourceType?: string; // case-violation-ok-legacy-back-compat: matches MagicLinkScopeEntry JWT claim shape
    resourceId?: string; // case-violation-ok-legacy-back-compat: matches MagicLinkScopeEntry JWT claim shape
}

/** Verified JWT claims returned by {@link IServerExtensionMagicLinkService.VerifySessionToken}. */
export interface ServerExtensionMagicLinkClaims {
    iss: string; // case-violation-ok-legacy-back-compat: standard JWT claim name
    aud: string; // case-violation-ok-legacy-back-compat: standard JWT claim name
    sub: string; // case-violation-ok-legacy-back-compat: standard JWT claim name
    iat: number; // case-violation-ok-legacy-back-compat: standard JWT claim name
    exp: number; // case-violation-ok-legacy-back-compat: standard JWT claim name
    email: string; // case-violation-ok-legacy-back-compat: standard OIDC claim name
    mj_app_id: string; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_role: string; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_invited_by?: string; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_scopes?: ServerExtensionMagicLinkScopeEntry[]; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_anon?: boolean; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_sid?: string; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
    mj_magic_link: true; // case-violation-ok-legacy-back-compat: matches MagicLinkJWTClaims wire claim
}

/**
 * Host-provided magic-link service exposed to `BaseServerExtension` implementations via
 * `context.services.GetMagicLinkService?.()` (when magic links are enabled on the host).
 */
export interface IServerExtensionMagicLinkService {
    CreateInvite(
        params: ServerExtensionCreateMagicLinkParams,
        creatingUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<ServerExtensionCreateMagicLinkResult>;

    RevokeInvite(
        inviteId: string,
        actingUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<ServerExtensionManageMagicLinkResult>;

    UpdateInviteExpiry(
        inviteId: string,
        expiresAt: Date,
        actingUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<ServerExtensionManageMagicLinkResult>;

    VerifySessionToken(token: string): ServerExtensionMagicLinkClaims | null;
}

/**
 * Host-provided database provider & principal resolution utilities exposed to `BaseServerExtension`
 * implementations via `context.services.GetHostRuntimeService?.()`.
 */
export interface IServerExtensionHostRuntimeService {
    /** Creates an isolated per-operation `DatabaseProviderBase` sharing cached metadata without sharing transactions. */
    CreateIsolatedProvider(): Promise<DatabaseProviderBase>;
    /** Resolves the MJServer system user (`UserInfo`). */
    GetSystemUser(): Promise<UserInfo>;
    /** Resolves a configured service principal by email or User ID from the host `UserCache`. */
    ResolvePrincipal(configuredEmailOrId: string | undefined, subsystemLabel: string): UserInfo | null;
}

/**
 * Service registry shared among server extensions, enabling cross-extension
 * service registration and consumption as well as typed access to MJServer host services.
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

    /**
     * Convenience typed accessor for MJServer's built-in {@link IServerExtensionMagicLinkService}
     * (present when `magicLink.enabled` is true on the host).
     */
    GetMagicLinkService?(): IServerExtensionMagicLinkService | undefined;

    /**
     * Convenience typed accessor for MJServer's built-in {@link IServerExtensionHostRuntimeService}
     * (`CreateIsolatedProvider`, `GetSystemUser`, `ResolvePrincipal`).
     */
    GetHostRuntimeService?(): IServerExtensionHostRuntimeService | undefined;
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

    /**
     * Where the world reaches MJAPI (`MJAPI_PUBLIC_URL`), prefix included (e.g. 'https://example.com/api').
     * Build outward URLs as `publicUrl` + a path relative to `apiRootPath` — never by appending the
     * already-composed `config.RootPath` to it.
     */
    publicUrl?: string;

    /**
     * MJAPI's base path (`MJAPI_BASE_PATH`, no trailing slash; `''` at `/`): the prefix every MJAPI route is
     * mounted under. `config.RootPath` is already composed under it, so mount on `config.RootPath` as-is.
     * Not related to `GRAPHQL_ROOT_PATH`, which is only Apollo's path. Browser bundles are given the MJAPI
     * URL explicitly; they never derive it from `window.location` or by stripping `/graphql`.
     */
    apiRootPath?: string; // case-violation-ok-legacy-back-compat: matches this context's existing camelCase members

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
