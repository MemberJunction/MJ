/**
 * @fileoverview Reverse-proxy and OAuth-proxy rate-limit settings for the MCP server's Express app (#6497).
 *
 * The OAuth proxy router is mounted at the app root and rate-limits every request that passes through
 * it per client IP, so `/mcp` traffic counts against the limit as well as the `/oauth/*` routes. Behind
 * CloudFront, a load balancer or any other reverse proxy, Express reports the proxy's address as
 * `req.ip` unless `trust proxy` is set, and every client then shares one bucket. These settings let a
 * deployment say how many proxy hops to trust and how large the limit is.
 *
 * Kept free of side effects (unlike `config.ts`, which loads dotenv and cosmiconfig when imported) so
 * the schemas and {@link ApplyTrustProxy} can be unit-tested directly.
 */
import type { Application } from 'express';
import { z } from 'zod';

/**
 * `mcpServerSettings.trustProxy`: the value given to Express's `trust proxy` setting.
 * - a number: how many proxy hops in front of the server to trust (`1` for CloudFront or a load
 *   balancer talking straight to the server);
 * - `true`: trust every hop. Only safe when nothing can reach the server except through the proxy,
 *   because a client can otherwise choose its own `X-Forwarded-For`;
 * - a string: Express's comma-separated list of trusted addresses, subnets or names
 *   (`'loopback'`, `'10.0.0.0/8'`, ...).
 *
 * Leave it unset when clients connect to the server directly.
 */
export const TrustProxySettingSchema = z.union([
  z.boolean(),
  z.number().int().min(0),
  z.string().trim().min(1),
]);

/** A valid `mcpServerSettings.trustProxy` value. */
export type TrustProxySetting = z.infer<typeof TrustProxySettingSchema>;

/**
 * `mcpServerSettings.auth.proxy.rateLimit`: the OAuth proxy router's per-client-IP limit. A field
 * left out keeps the router's default (60 requests per 60-second window).
 */
export const OAuthProxyRateLimitSchema = z.object({
  /** Window length in milliseconds. */
  windowMs: z.number().int().positive().optional(),
  /** Maximum requests per client IP per window. */
  limit: z.number().int().positive().optional(),
});

/** A valid `mcpServerSettings.auth.proxy.rateLimit` value. */
export type OAuthProxyRateLimitSettings = z.infer<typeof OAuthProxyRateLimitSchema>;

/**
 * Applies `mcpServerSettings.trustProxy` to the Express app. Call it right after `express()` creates
 * the app, before any middleware reads `req.ip`. When the setting is absent the app keeps Express's
 * default, which trusts no proxy.
 *
 * @param app - the MCP server's Express app
 * @param setting - the configured `trustProxy` value, or `undefined` when not configured
 * @returns `true` when the setting was applied
 */
export function ApplyTrustProxy(app: Application, setting: TrustProxySetting | undefined): boolean {
  if (setting === undefined) {
    return false;
  }
  app.set('trust proxy', setting);
  return true;
}
