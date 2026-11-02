/**
 * @fileoverview Local Development Mock/Test JWT Authentication (`local`).
 *
 * Provides a zero-external-IdP local development login flow backed by MJ's
 * in-memory RS256 `MagicLinkKeyManager` and JWKS endpoint.
 *
 * HARD SECURITY INVARIANTS:
 * 1. Fail loud in production: If `MJ_DEV_AUTH_ENABLED` (or `configInfo.devAuth?.enabled`)
 *    is enabled while `NODE_ENV === 'production'`, server startup throws a fatal error
 *    and refuses to boot.
 * 2. Strict localhost-only guard: Every request to `/auth/dev-login` and `/auth/dev-users`
 *    verifies that:
 *    - `NODE_ENV !== 'production'` and local dev auth is enabled.
 *    - `X-Forwarded-For` (if present) contains only loopback addresses.
 *    - `Host` header is `localhost`, `127.0.0.1`, or `::1`.
 *    - `Origin` / `Referer` headers (if present) resolve to `localhost`, `127.0.0.1`, or `::1`.
 *    - Socket remote address is loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) or local
 *      Docker bridge/host-gateway when no external `X-Forwarded-For` is present.
 *    Any request failing these checks is denied with `403 Forbidden` and logged.
 *
 * @module @memberjunction/server/auth/localDevAuth
 */

import * as fs from 'node:fs';
import { Router, json, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  AuthProviderConfig,
  DatabaseProviderBase,
  IMetadataProvider,
  LogError,
  LogStatusEx,
  Metadata,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AuthProviderFactory, LocalDevProvider } from '@memberjunction/auth-providers';
import { UserCache } from '@memberjunction/generic-database-provider';
import { configInfo } from '../config.js';
import { ApiRoute } from '../apiRoot.js';
import { MagicLinkKeyManager } from './magicLink/MagicLinkKeys.js';
import { MAGIC_LINK_JWKS_PATH } from './magicLink/MagicLinkRouter.js';
import { AssertLocalDevAuthAllowed, IsLocalDevAuthEnabled } from './initializeProviders.js';

export { AssertLocalDevAuthAllowed, IsLocalDevAuthEnabled };

/** Claims embedded in a local development JWT. */
interface LocalDevJWTClaims extends Record<string, unknown> {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  name: string;
  preferred_username: string;
  iat: number;
  exp: number;
}

/** Result of the localhost-only request guard. */
export interface LocalhostGuardResult {
  Allowed: boolean;
  Reason?: string;
}

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function TrimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
}

/**
 * Checks whether an IP address is a loopback address, or (when `allowDockerBridge` is true)
 * a local Docker bridge / Docker Desktop host-gateway address.
 */
export function IsLoopbackAddress(rawIp: string | undefined, allowDockerBridge: boolean): boolean {
  if (!rawIp) {
    return false;
  }
  const normalized = rawIp.trim().toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return true;
  }
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (allowDockerBridge) {
    // Docker Desktop macOS/Windows host-gateway IPs (192.168.65.0/24) and local
    // Docker bridge gateway (.1) addresses when a host browser connects to a
    // port-forwarded container bound to 127.0.0.1 on the host.
    if (/^192\.168\.65\.\d{1,3}$/.test(normalized)) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.1$/.test(normalized)) {
      return true;
    }
    if (normalized === '10.0.2.2') {
      return true;
    }
  }
  return false;
}

function isRunningInsideContainer(env: NodeJS.ProcessEnv): boolean {
  if (env.MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE === 'true') {
    return true;
  }
  if (env.MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE === 'false') {
    return false;
  }
  return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
}

/** Extracts the hostname (without port) from a raw HTTP `Host` header value. */
function extractHostnameFromHostHeader(hostHeader: string | undefined): string {
  if (!hostHeader) {
    return '';
  }
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    return closeIdx >= 0 ? trimmed.slice(1, closeIdx) : trimmed;
  }
  const colonIdx = trimmed.indexOf(':');
  return colonIdx >= 0 ? trimmed.slice(0, colonIdx) : trimmed;
}

/** Extracts the hostname from an `Origin` or `Referer` URL header. */
function extractHostnameFromUrlHeader(urlHeader: string): string | null {
  try {
    const parsed = new URL(urlHeader);
    return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

/**
 * Verifies that an incoming HTTP request to a local-dev auth endpoint originated
 * strictly from localhost (`localhost`, `127.0.0.1`, or `::1`).
 */
export function VerifyLocalhostRequest(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): LocalhostGuardResult {
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
    return {
      Allowed: false,
      Reason: 'Local dev auth is strictly forbidden when NODE_ENV=production.',
    };
  }

  // 1. Inspect X-Forwarded-For / Forwarded / X-Real-IP / CF-Connecting-IP if present — every hop must be pure loopback
  const xffRaw = req.headers['x-forwarded-for'];
  const xffValue = Array.isArray(xffRaw) ? xffRaw.join(',') : xffRaw;
  if (xffValue && xffValue.trim().length > 0) {
    const hops = xffValue.split(',').map((h) => h.trim()).filter(Boolean);
    for (const hop of hops) {
      if (!IsLoopbackAddress(hop, false)) {
        return {
          Allowed: false,
          Reason: `Non-loopback X-Forwarded-For address '${hop}' rejected.`,
        };
      }
    }
  }

  for (const proxyHeader of ['x-real-ip', 'cf-connecting-ip'] as const) {
    const rawHeader = req.headers[proxyHeader];
    const headerVal = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (headerVal && headerVal.trim().length > 0 && !IsLoopbackAddress(headerVal, false)) {
      return {
        Allowed: false,
        Reason: `Non-loopback ${proxyHeader} address '${headerVal}' rejected.`,
      };
    }
  }

  const forwardedHeader = req.headers['forwarded'];
  const forwardedVal = Array.isArray(forwardedHeader) ? forwardedHeader.join(',') : forwardedHeader;
  if (forwardedVal && forwardedVal.trim().length > 0) {
    const forMatches = forwardedVal.matchAll(/for=\s*"?\[?([^;,"\]]+)\]?"?/gi);
    for (const match of forMatches) {
      const candidateIp = match[1]?.split(':')[0]?.trim();
      if (candidateIp && !IsLoopbackAddress(candidateIp, false)) {
        return {
          Allowed: false,
          Reason: `Non-loopback Forwarded address '${candidateIp}' rejected.`,
        };
      }
    }
  }

  // 1b. Reject browser cross-site requests via Sec-Fetch-Site
  const secFetchSite = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].trim().toLowerCase() : undefined;
  if (secFetchSite === 'cross-site') {
    return {
      Allowed: false,
      Reason: `Cross-site request (Sec-Fetch-Site: ${secFetchSite}) rejected.`,
    };
  }

  // 2. Inspect Host header — must be localhost, 127.0.0.1, or ::1
  const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : req.hostname;
  const hostName = extractHostnameFromHostHeader(hostHeader);
  if (!hostName || !LOCALHOST_HOSTNAMES.has(hostName)) {
    return {
      Allowed: false,
      Reason: `Non-localhost Host header '${hostHeader ?? 'missing'}' rejected.`,
    };
  }

  // 3. Inspect Origin header if present
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (originHeader) {
    const originHost = extractHostnameFromUrlHeader(originHeader);
    if (!originHost || !LOCALHOST_HOSTNAMES.has(originHost)) {
      return {
        Allowed: false,
        Reason: `Non-localhost Origin header '${originHeader}' rejected.`,
      };
    }
  }

  // 4. Inspect Referer header if present
  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
  if (refererHeader) {
    const refererHost = extractHostnameFromUrlHeader(refererHeader);
    if (!refererHost || !LOCALHOST_HOSTNAMES.has(refererHost)) {
      return {
        Allowed: false,
        Reason: `Non-localhost Referer header '${refererHeader}' rejected.`,
      };
    }
  }

  // 5. Inspect socket remote address (allow Docker local bridge ONLY when running in a container and no proxy header is present)
  const hasProxyHeader = Boolean(
    (xffValue && xffValue.trim().length > 0) ||
    (forwardedVal && forwardedVal.trim().length > 0) ||
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip']
  );
  const allowDockerBridge = !hasProxyHeader && isRunningInsideContainer(env);
  const remoteAddress = req.socket?.remoteAddress || req.ip;
  if (!IsLoopbackAddress(remoteAddress, allowDockerBridge)) {
    return {
      Allowed: false,
      Reason: `Non-loopback socket remote address '${remoteAddress ?? 'unknown'}' rejected.`,
    };
  }

  return { Allowed: true };
}

/**
 * Registers the `local` auth provider in `AuthProviderFactory` and `configInfo.authProviders`
 * using the server's configured public URL and the shared `MagicLinkKeyManager` JWKS endpoint.
 */
export function RegisterLocalDevAuthProvider(publicUrl?: string): void {
  AssertLocalDevAuthAllowed();
  MagicLinkKeyManager.Instance.Initialize(configInfo.magicLink?.rsaPrivateKey);

  const base = publicUrl ? TrimTrailingSlashes(publicUrl) : undefined;
  const issuer = base ? `${base}/local-dev` : ApiRoute('/local-dev', { absolute: true });
  const jwksUri = base ? `${base}${MAGIC_LINK_JWKS_PATH}` : ApiRoute(MAGIC_LINK_JWKS_PATH, { absolute: true });
  const providerConfig: AuthProviderConfig = {
    name: 'local',
    type: 'local',
    issuer,
    audience: LocalDevProvider.DEFAULT_AUDIENCE,
    jwksUri,
  };

  try {
    const factory = AuthProviderFactory.Instance;
    const existingProvider = factory.getByName('local');
    if (existingProvider && existingProvider.issuer === issuer && existingProvider.jwksUri === jwksUri) {
      return;
    }

    configInfo.authProviders = configInfo.authProviders ?? [];
    const existingIdx = configInfo.authProviders.findIndex((p) => p.type === 'local' || p.name === 'local');
    if (existingIdx >= 0) {
      configInfo.authProviders[existingIdx] = providerConfig;
    } else {
      configInfo.authProviders.push(providerConfig);
    }
    factory.register(AuthProviderFactory.createProvider(providerConfig));
    LogStatusEx({
      message: `[LocalDevAuth] Registered local dev auth provider (issuer: ${providerConfig.issuer}, jwks: ${providerConfig.jwksUri})`,
      verboseOnly: true,
    });
  } catch (e) {
    LogError(`[LocalDevAuth] Failed to register local dev auth provider: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Resolves the active local MJ user to sign in as for local development.
 */
export async function ResolveLocalDevUser(
  requestedEmail?: string,
  provider?: IMetadataProvider
): Promise<UserInfo | null> {
  const effectiveProvider = provider ?? Metadata.Provider;
  if ((!UserCache.Instance.Users || UserCache.Instance.Users.length === 0) && effectiveProvider) {
    try {
      await UserCache.Instance.Refresh(effectiveProvider as DatabaseProviderBase);
    } catch (err) {
      LogError(`[LocalDevAuth] Failed to refresh UserCache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const allUsers = UserCache.Instance.Users ?? [];
  const activeUsers = allUsers.filter(
    (u) =>
      u.IsActive &&
      !UUIDsEqual(u.ID, UserCache.Instance.SYSTEM_USER_ID) &&
      u.Name?.trim().toLowerCase() !== 'system'
  );

  const targetEmail =
    requestedEmail?.trim() ||
    process.env.MJ_DEV_AUTH_DEFAULT_EMAIL?.trim() ||
    configInfo?.devAuth?.defaultEmail?.trim();
  if (targetEmail) {
    const matched = activeUsers.find((u) => u.Email?.trim().toLowerCase() === targetEmail.toLowerCase());
    if (matched) {
      return matched;
    }
    // If an explicit email was requested on the call and doesn't exist, return null
    if (requestedEmail?.trim()) {
      return null;
    }
  }

  // 1. Default MJ installer admin email
  const defaultAdmin = activeUsers.find((u) => u.Email?.trim().toLowerCase() === 'admin@memberjunction.org');
  if (defaultAdmin) {
    return defaultAdmin;
  }

  // 2. First active user holding the Developer role
  const developerUser = activeUsers.find(
    (u) =>
      u.Email?.trim().toLowerCase() !== 'not.set@nowhere.com' &&
      u.UserRoles?.some((r) => r.Role?.trim().toLowerCase() === 'developer')
  );
  if (developerUser) {
    return developerUser;
  }

  // 3. First active Owner user with a real email
  const ownerUser = activeUsers.find(
    (u) =>
      u.Email?.trim().toLowerCase() !== 'not.set@nowhere.com' &&
      u.Type?.trim().toLowerCase() === 'owner'
  );
  if (ownerUser) {
    return ownerUser;
  }

  return activeUsers[0] ?? null;
}

/**
 * Mints a signed RS256 local-dev JWT for the given `UserInfo`.
 */
export function MintLocalDevJwt(
  user: UserInfo,
  publicUrl?: string,
  ttlSeconds = 8 * 3600
): { token: string; expiresAt: string; claims: LocalDevJWTClaims } {
  AssertLocalDevAuthAllowed();
  MagicLinkKeyManager.Instance.Initialize(configInfo.magicLink?.rsaPrivateKey);

  const base = publicUrl ? TrimTrailingSlashes(publicUrl) : undefined;
  const issuer = base ? `${base}/local-dev` : ApiRoute('/local-dev', { absolute: true });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + ttlSeconds;
  const firstName = user.FirstName?.trim() || 'Admin';
  const lastName = user.LastName?.trim() || 'User';
  const fullName =
    [user.FirstName?.trim(), user.LastName?.trim()].filter(Boolean).join(' ') ||
    user.Name?.trim() ||
    user.Email;

  const claims: LocalDevJWTClaims = {
    iss: issuer,
    aud: LocalDevProvider.DEFAULT_AUDIENCE,
    sub: `local-dev|${user.ID}`,
    email: user.Email,
    given_name: firstName,
    family_name: lastName,
    name: fullName,
    preferred_username: user.Email,
    iat: nowSeconds,
    exp: expSeconds,
  };

  const token = MagicLinkKeyManager.Instance.Sign(claims);
  return {
    token,
    expiresAt: new Date(expSeconds * 1000).toISOString(),
    claims,
  };
}

/**
 * Attaches `/dev-login` and `/dev-users` routes onto the `/auth` router.
 *
 * When local dev auth is disabled, these routes respond with `404`.
 * When enabled, every request is gated by {@link VerifyLocalhostRequest}.
 */
export function AttachLocalDevAuthRoutes(router: Router): void {
  const devAuthLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  router.post('/dev-login', devAuthLimiter, json(), async (req: Request, res: Response) => {
    if (!IsLocalDevAuthEnabled()) {
      res.status(404).json({
        success: false,
        error: 'Local dev auth is not enabled. Set MJ_DEV_AUTH_ENABLED=true in local development.',
      });
      return;
    }

    const guard = VerifyLocalhostRequest(req);
    if (!guard.Allowed) {
      LogError(`[SECURITY] Blocked /auth/dev-login request: ${guard.Reason}`);
      res.status(403).json({
        success: false,
        error: 'Forbidden: /auth/dev-login is restricted to localhost only.',
      });
      return;
    }

    try {
      RegisterLocalDevAuthProvider();

      const body = (req.body ?? {}) as { email?: string };
      const requestedEmail = typeof body.email === 'string' ? body.email.trim() : undefined;
      const user = await ResolveLocalDevUser(requestedEmail);

      if (!user) {
        const availableEmails = (UserCache.Instance.Users ?? [])
          .filter((u) => u.IsActive && !UUIDsEqual(u.ID, UserCache.Instance.SYSTEM_USER_ID))
          .map((u) => u.Email);
        res.status(404).json({
          success: false,
          error: requestedEmail
            ? `No active MJ user found matching email '${requestedEmail}'.`
            : 'No active non-System MJ user found in UserCache.',
          availableUsers: availableEmails,
        });
        return;
      }

      const { token, expiresAt, claims } = MintLocalDevJwt(user);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({
        success: true,
        token,
        expiresAt,
        user: {
          id: user.ID,
          email: user.Email,
          name: claims.name,
          firstName: claims.given_name,
          lastName: claims.family_name,
          roles: (user.UserRoles ?? []).map((r) => r.Role),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`[LocalDevAuth] /auth/dev-login error: ${message}`);
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  router.get('/dev-users', devAuthLimiter, async (req: Request, res: Response) => {
    if (!IsLocalDevAuthEnabled()) {
      res.status(404).json({
        success: false,
        error: 'Local dev auth is not enabled.',
      });
      return;
    }

    const guard = VerifyLocalhostRequest(req);
    if (!guard.Allowed) {
      LogError(`[SECURITY] Blocked /auth/dev-users request: ${guard.Reason}`);
      res.status(403).json({
        success: false,
        error: 'Forbidden: /auth/dev-users is restricted to localhost only.',
      });
      return;
    }

    const users = (UserCache.Instance.Users ?? [])
      .filter((u) => u.IsActive && !UUIDsEqual(u.ID, UserCache.Instance.SYSTEM_USER_ID) && u.Name?.trim().toLowerCase() !== 'system')
      .map((u) => ({
        id: u.ID,
        email: u.Email,
        name: u.Name,
        firstName: u.FirstName,
        lastName: u.LastName,
        type: u.Type,
        roles: (u.UserRoles ?? []).map((r) => r.Role),
      }));

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, users });
  });
}
