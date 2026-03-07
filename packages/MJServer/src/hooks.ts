/**
 * Server-level extensibility types for MJServer.
 *
 * Provider-level hook types (PreRunViewHook, PostRunViewHook, PreSaveHook)
 * are defined and exported from @memberjunction/core (hookRegistry.ts) so
 * that ProviderBase and BaseEntity can reference them without depending
 * on @memberjunction/server.
 *
 * This file re-exports those types for convenience and adds the
 * server-specific extensibility options (Express middleware, Apollo plugins,
 * schema transformers).
 */

export type { PreRunViewHook, PostRunViewHook, PreSaveHook, HookName, HookRegistrationOptions } from '@memberjunction/core';

import type { PreRunViewHook, PostRunViewHook, PreSaveHook, HookRegistrationOptions } from '@memberjunction/core';
import type { RequestHandler, ErrorRequestHandler, Application } from 'express';
import type { ApolloServerPlugin } from '@apollo/server';
import type { GraphQLSchema } from 'graphql';

/**
 * A hook entry that includes the hook function plus optional registration metadata.
 * Dynamic packages use this format to declare hooks with priority and namespace.
 */
export interface HookWithOptions<T> {
  hook: T;
  Priority?: number;
  Namespace?: string;
}

/** A hook value is either a plain function or a function with registration options */
export type HookOrEntry<T> = T | HookWithOptions<T>;

/**
 * Extensibility options that can be passed to `serve()` (via MJServerOptions)
 * or to `createMJServer()` (via MJServerConfig).
 *
 * All properties are optional — when omitted, zero behavior change (backward compatible).
 */
export interface ServerExtensibilityOptions {
  /** Express middleware applied after compression but before OAuth/REST/GraphQL routes */
  ExpressMiddlewareBefore?: RequestHandler[];

  /** Express middleware/error handlers applied after all routes (catch-alls, error handlers) */
  ExpressMiddlewareAfter?: (RequestHandler | ErrorRequestHandler)[];

  /** Escape hatch for advanced Express app configuration (CORS, trust proxy, etc.) */
  ConfigureExpressApp?: (app: Application) => void | Promise<void>;

  /** Additional Apollo Server plugins merged with the built-in drain/cleanup plugins */
  ApolloPlugins?: ApolloServerPlugin[];

  /** Schema transformers applied after built-in directive transformers */
  SchemaTransformers?: ((schema: GraphQLSchema) => GraphQLSchema)[];

  /**
   * Express middleware that runs AFTER authentication has resolved UserInfo
   * onto the request. Use this for middleware that needs the authenticated
   * user (e.g., tenant context resolution, org membership loading).
   *
   * The authenticated user payload is available at `req.userPayload`.
   * Middleware in this array runs in registration order.
   */
  ExpressMiddlewarePostAuth?: RequestHandler[];

  /** Hooks that modify RunViewParams before query execution (e.g., tenant filter injection).
   * Each entry can be a plain hook function or a `{ hook, Priority, Namespace }` object. */
  PreRunViewHooks?: HookOrEntry<PreRunViewHook>[];

  /** Hooks that modify RunViewResult after query execution (e.g., data masking).
   * Each entry can be a plain hook function or a `{ hook, Priority, Namespace }` object. */
  PostRunViewHooks?: HookOrEntry<PostRunViewHook>[];

  /** Hooks that validate/reject Save operations before they hit the database.
   * Each entry can be a plain hook function or a `{ hook, Priority, Namespace }` object. */
  PreSaveHooks?: HookOrEntry<PreSaveHook>[];
}
