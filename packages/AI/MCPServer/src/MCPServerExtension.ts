/**
 * @fileoverview Serves the MCP server from inside MJAPI, as a server extension.
 *
 * Enable it by adding the package to MJAPI's dependencies and listing it in `mj.config.cjs`:
 *
 * ```javascript
 * dynamicPackages: {
 *     server: [{ PackageName: '@memberjunction/ai-mcp-server', Processes: ['mjapi'] }],
 * },
 * ```
 *
 * MJAPI then imports the package at boot and mounts {@link MJ_SERVER_EXTENSIONS} (MCP at `/mcp`
 * under MJAPI's base path). Override any field with a host `serverExtensions[]` entry whose
 * `DriverClass` is `'MCPServerExtension'` — e.g. a different `RootPath`, or `Settings.IncludeTools`.
 * `Processes: ['mjapi']` keeps the standalone server (process `mcp`) from loading it too.
 *
 * The standalone server (`InitializeServer`, the package's CLI) is unchanged and still supported.
 *
 * @module @memberjunction/ai-mcp-server/MCPServerExtension
 */

import type { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerExtension } from '@memberjunction/server-extensions-core';
import type {
    ExtensionHealthResult, ExtensionInitResult, ServerExtensionConfig, ServerExtensionInitContext, ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { CreateMCPRouters, MCPCorsMiddleware, ToolFilterOptions } from './Server.js';
import type { MCPTransportRouter } from './Server.js';
import { GetResourceIdentifier, SetHostedResourceIdentifier } from './auth/OAuthConfig.js';
import { InitConfig, McpServerSettings } from './config.js';

/**
 * The extension entry MJAPI mounts when this package is listed in `dynamicPackages.server[]`.
 * `OwnsCORS` is set because the MCP routes answer their own preflights.
 */
export const MJ_SERVER_EXTENSIONS: ServerExtensionConfig[] = [
    { Enabled: true, DriverClass: 'MCPServerExtension', RootPath: '/mcp', OwnsCORS: true, Settings: {} },
];

/** Where the MCP routes are mounted, and where clients reach them. */
export interface MCPMount {
    /** The Express mount path, base path included (e.g. `/api/mcp`). */
    MountPath: string;
    /** The public URL of the MCP endpoint — the OAuth resource identifier (e.g. `https://host/api/mcp`). */
    PublicEndpointUrl: string;
    /** The SSE messages path as clients see it (e.g. `/api/mcp/messages`). */
    SSEMessagesPath: string;
}

/**
 * Works out the mount and public URLs from the extension context.
 *
 * `RootPath` arrives already composed under MJAPI's base path, so it is mounted as-is. The public
 * URL is the root relative to `apiRootPath`, made absolute by `absoluteApiRoute` — MJServer's
 * `ApiRoute(subpath, { absolute: true })`, which uses `MJAPI_PUBLIC_URL` (prefix included) or,
 * without it, `baseUrl:port` + the base path. The context's `publicUrl` is not used: without
 * `MJAPI_PUBLIC_URL` it falls back to `baseUrl:port` + `GRAPHQL_ROOT_PATH` and loses the base path.
 * The mount path and the public path can differ when a proxy rewrites the prefix.
 */
export function ResolveMCPMount(rootPath: string, apiRootPath: string | undefined, absoluteApiRoute: (subpath: string) => string): MCPMount {
    const mountPath = trimTrailingSlashes(rootPath);
    const basePath = trimTrailingSlashes(apiRootPath ?? '');
    if (!mountPath.startsWith('/')) {
        throw new Error(`MCPServerExtension RootPath must start with '/', got '${rootPath}'`);
    }
    if (basePath && mountPath !== basePath && !mountPath.startsWith(`${basePath}/`)) {
        throw new Error(`MCPServerExtension RootPath '${rootPath}' is not under MJAPI's base path '${basePath}'`);
    }
    const relativeRoot = mountPath.slice(basePath.length);
    if (!relativeRoot) {
        throw new Error(`MCPServerExtension RootPath '${rootPath}' must be below MJAPI's base path, not equal to it`);
    }
    const publicEndpointUrl = trimTrailingSlashes(absoluteApiRoute(relativeRoot));
    const publicPath = trimTrailingSlashes(new URL(publicEndpointUrl).pathname);
    return { MountPath: mountPath, PublicEndpointUrl: publicEndpointUrl, SSEMessagesPath: `${publicPath}/messages` };
}

/**
 * Reads the optional tool filter from the extension's `Settings`:
 * `{ IncludeTools?: string[], ExcludeTools?: string[] }` — the same patterns as the CLI's
 * `--include` / `--exclude` (wildcards allowed, e.g. `Get_*`).
 */
export function ParseMCPExtensionToolFilter(settings: Record<string, unknown> | undefined): ToolFilterOptions {
    const include = readPatternList(settings, 'IncludeTools');
    const exclude = readPatternList(settings, 'ExcludeTools');
    return {
        ...(include ? { includePatterns: include } : {}),
        ...(exclude ? { excludePatterns: exclude } : {}),
    };
}

function readPatternList(settings: Record<string, unknown> | undefined, key: string): string[] | undefined {
    const value = settings?.[key];
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
        throw new Error(`MCPServerExtension Settings.${key} must be an array of strings`);
    }
    return value;
}

function trimTrailingSlashes(value: string): string {
    let trimmed = value.trim();
    while (trimmed.length > 1 && trimmed.endsWith('/')) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed === '/' ? '' : trimmed;
}

/**
 * Mounts the MCP server's routes (Streamable HTTP, legacy SSE, OAuth discovery and the optional
 * OAuth proxy) under `RootPath`, before MJAPI's own authentication: MCP authenticates every
 * request itself (API key and/or OAuth, per `mcpServerSettings.auth`).
 *
 * Uses MJAPI's database provider and caches — no second connection pool. `mcpServerSettings`
 * still configures auth and tools; `mcpServerSettings.enableMCPServer` and `port` apply only to
 * the standalone server.
 */
@RegisterClass(BaseServerExtension, 'MCPServerExtension')
export class MCPServerExtension extends BaseServerExtension {
    private transport: MCPTransportRouter | null = null;
    private routes: string[] = [];

    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    public async Initialize(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): Promise<ExtensionInitResult> {
        try {
            const context = requireContext(contextOrApp, config);
            // Dynamic import, as in auth/TokenValidator.ts: @memberjunction/server reads process.env when
            // first evaluated, and the standalone server (which also loads this module) must load its .env
            // first. Inside MJAPI the module is already loaded, so this costs nothing.
            const { ApiRoute } = await import('@memberjunction/server');
            const mount = ResolveMCPMount(context.config.RootPath, context.apiRootPath, sub => ApiRoute(sub, { absolute: true }));

            await InitConfig();
            SetHostedResourceIdentifier(mount.PublicEndpointUrl);
            warnAboutHostedSettings(context.config, mount);
            const routers = await CreateMCPRouters({
                SSEMessagesPath: mount.SSEMessagesPath,
                filterOptions: ParseMCPExtensionToolFilter(context.config.Settings),
            });
            // Transport before Discovery: see MCPRouters.Discovery
            context.app.use(mount.MountPath, MCPCorsMiddleware, routers.Transport.Router, routers.Discovery);

            this.transport = routers.Transport;
            this.routes = [`ALL ${mount.MountPath}`, `GET ${mount.MountPath}/sse`, `POST ${mount.MountPath}/messages`];
            return {
                Success: true,
                Message: `MCP server mounted at ${mount.MountPath} (public endpoint ${mount.PublicEndpointUrl})`,
                RegisteredRoutes: [...this.routes],
            };
        } catch (error) {
            SetHostedResourceIdentifier(undefined);
            return { Success: false, Message: error instanceof Error ? error.message : String(error) };
        }
    }

    public async Shutdown(): Promise<void> {
        await this.transport?.Shutdown();
        this.transport = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this.transport !== null,
            Name: 'MCPServerExtension',
            Details: { Routes: [...this.routes], OpenSessions: this.transport?.SessionCount() ?? 0 },
        };
    }
}

/** Logs settings that don't behave inside MJAPI the way they do on the standalone server. */
function warnAboutHostedSettings(config: ServerExtensionConfig, mount: MCPMount): void {
    if (config.OwnsCORS !== true) {
        console.warn('[MCPServerExtension] OwnsCORS is not true: MJAPI\'s CORS answers preflights for the MCP routes, so browser-based MCP clients may be refused. Set OwnsCORS: true on the serverExtensions entry.');
    }
    const advertised = GetResourceIdentifier();
    if (advertised !== mount.PublicEndpointUrl) {
        console.warn(`[MCPServerExtension] mcpServerSettings.auth.resourceIdentifier (${advertised}) overrides the URL MCP is served at (${mount.PublicEndpointUrl}). OAuth clients will look for metadata under ${advertised}; remove the setting unless a proxy maps it here.`);
    }
    if (McpServerSettings?.trustProxy !== undefined) {
        console.warn('[MCPServerExtension] mcpServerSettings.trustProxy has no effect inside MJAPI: Express reads trust proxy from MJAPI\'s app, which the extension does not change. Set it with an MJAPI server middleware if the OAuth proxy rate limit needs real client IPs.');
    }
}

/** MCP needs the modern context: the legacy `(app, config)` form carries no public URL or base path. */
function requireContext(contextOrApp: ServerExtensionInitContext | Application, config?: ServerExtensionConfig): ServerExtensionInitContext {
    if (typeof contextOrApp === 'function' || config !== undefined) {
        throw new Error('MCPServerExtension requires the context form of Initialize (MJServer 6.x passes it)');
    }
    return contextOrApp;
}
