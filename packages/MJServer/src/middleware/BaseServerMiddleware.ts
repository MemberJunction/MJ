/**
 * Base class for server middleware that intercepts the MJServer request pipeline.
 *
 * Subclasses register via @RegisterClass(BaseServerMiddleware, key) and are
 * discovered by serve() via ClassFactory.GetAllRegistrations().
 *
 * Key-based deduplication: If two middleware classes register with the same key,
 * ClassFactory returns the highest-priority one -- the other is replaced.
 * This is how BCSaaS replaces MJ's built-in tenant filtering.
 *
 * For adding new routes/endpoints (webhooks, bot endpoints), see
 * ServerExtensionsCore and BaseServerExtension (PR #2037).
 * BaseServerMiddleware is for intercepting the existing pipeline, not adding to it.
 */

import type { RequestHandler, ErrorRequestHandler, Application } from 'express';
import type { ApolloServerPlugin } from '@apollo/server';
import type { GraphQLSchema } from 'graphql';
import type { RunViewParams, UserInfo, BaseEntity, RunViewResult } from '@memberjunction/core';

export abstract class BaseServerMiddleware {
    // --- Identity ---

    /**
     * Human-readable label for logging (e.g., 'mj:tenantFilter', 'bcsaas').
     */
    abstract get Label(): string;

    /**
     * Whether this middleware is active. Override to check config, env vars, etc.
     * Disabled middleware classes are never instantiated or activated by serve().
     * Default: true.
     */
    get Enabled(): boolean { return true; }

    // --- Lifecycle ---

    /**
     * Optional async initialization (read config, warm caches, etc.).
     * Called by serve() after instantiation, before middleware/hooks are extracted.
     */
    async Initialize(): Promise<void> { /* no-op by default */ }

    // --- Express Middleware ---
    // Each method corresponds to a named slot in the request pipeline.
    // Override to contribute middleware at that stage.
    // Default implementations return empty arrays (no-op).

    /**
     * Express middleware applied BEFORE authentication.
     * Runs after compression but before OAuth/REST/GraphQL routes.
     * Use for: rate limiting, request logging, custom headers.
     */
    GetPreAuthMiddleware(): RequestHandler[] { return []; }

    /**
     * Express middleware that runs AFTER authentication has resolved UserInfo.
     * The authenticated user payload is available at req.userPayload.
     * Use for: tenant context resolution, org membership loading.
     */
    GetPostAuthMiddleware(): RequestHandler[] { return []; }

    /**
     * Express middleware/error handlers applied AFTER all routes.
     * Use for: catch-all error handlers, response logging.
     */
    GetPostRouteMiddleware(): (RequestHandler | ErrorRequestHandler)[] { return []; }

    // --- Express App Configuration ---

    /**
     * Optional escape hatch for advanced Express app configuration.
     * Called once during server setup with the Express app instance.
     * Use for: trust proxy settings, custom CORS, body parser config.
     * Return undefined to skip (default).
     */
    ConfigureExpressApp?(app: Application): void | Promise<void>;

    // --- Apollo / GraphQL Extensions ---

    /**
     * Additional Apollo Server plugins merged with built-in plugins.
     * Use for: query tracing, caching, custom error formatting.
     */
    GetApolloPlugins(): ApolloServerPlugin[] { return []; }

    /**
     * Schema transformers applied after built-in directive transformers.
     * Use for: custom directives, schema stitching, field-level auth.
     */
    GetSchemaTransformers(): ((schema: GraphQLSchema) => GraphQLSchema)[] { return []; }

    // --- Data Hooks ---
    // Override any of these to intercept data operations.
    // Default implementations are pass-through (no-op).

    /**
     * Hook that runs before a RunView operation. Can modify the RunViewParams
     * (e.g., injecting tenant filters) before execution.
     */
    PreRunView(params: RunViewParams, contextUser: UserInfo | undefined): RunViewParams | Promise<RunViewParams> {
        return params;
    }

    /**
     * Hook that runs after a RunView operation completes. Can modify the result
     * (e.g., filtering or augmenting data) before it is returned to the caller.
     */
    PostRunView(params: RunViewParams, results: RunViewResult, contextUser: UserInfo | undefined): RunViewResult | Promise<RunViewResult> {
        return results;
    }

    /**
     * Hook that runs before a Save operation on a BaseEntity.
     * Return true to allow, false to reject silently, or a string to reject with that error message.
     */
    PreSave(entity: BaseEntity, contextUser: UserInfo | undefined): boolean | string | Promise<boolean | string> {
        return true;
    }
}
