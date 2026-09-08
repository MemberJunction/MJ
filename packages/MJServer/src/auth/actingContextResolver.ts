/**
 * Deployment extension point for the API-key acting context (plan §5.8).
 *
 * MJ defines the CARRIER and the CONTRACT for `{{Acting*}}` row-filter tokens
 * (`UserInfo.APIKeyActingContext`); the VALUES are deployment-specific — a
 * verified session token, a server-side session lookup, a trusted upstream
 * assertion. A deployment registers a resolver at startup and `context.ts`
 * invokes it after API-key validation, stamping the result onto the CLONED
 * per-request UserInfo.
 *
 * TRUST BOUNDARY (load-bearing): the resolver runs server-side and its return
 * value flows straight into row-filter SQL token substitution. Resolver
 * implementations MUST derive every value server-side — never from a
 * client-supplied header, argument, or GraphQL variable. A client-settable
 * acting context is a total bypass of API-key row filtering. Validation of the
 * value SHAPES (GUID / bounded identifier) happens downstream in
 * `APIKeyEngine.Authorize()` and fails closed, but shape validation cannot
 * detect a forged-but-well-formed value — provenance is the resolver's job.
 */
import type { IncomingMessage } from 'http';
import type { APIKeyActingContext, UserInfo } from '@memberjunction/core';

/**
 * Resolves the acting context for one API-key request. Return `undefined` when
 * the request carries no acting identity — filters requiring `{{Acting*}}`
 * tokens then fail closed (match nothing / deny) by design.
 *
 * @param req - The incoming HTTP request (undefined on transports without one, e.g. WebSocket connects)
 * @param user - The per-request session UserInfo (already cloned; safe to read, do not mutate)
 * @param apiKeyId - The validated API key's ID
 */
export type APIKeyActingContextResolver = (
  req: IncomingMessage | undefined,
  user: UserInfo,
  apiKeyId: string
) => Promise<APIKeyActingContext | undefined> | APIKeyActingContext | undefined;

let registeredResolver: APIKeyActingContextResolver | undefined;

/**
 * Registers the deployment's acting-context resolver. Call once at server
 * startup, before requests are served. Registering again replaces the previous
 * resolver (last write wins); pass `undefined` to clear.
 */
export function RegisterAPIKeyActingContextResolver(fn: APIKeyActingContextResolver | undefined): void {
  registeredResolver = fn;
}

/**
 * Returns the registered acting-context resolver, or `undefined` when the
 * deployment has not registered one (the default — API-key sessions then carry
 * no acting context, and any filter requiring `{{Acting*}}` tokens fails closed).
 */
export function GetAPIKeyActingContextResolver(): APIKeyActingContextResolver | undefined {
  return registeredResolver;
}
