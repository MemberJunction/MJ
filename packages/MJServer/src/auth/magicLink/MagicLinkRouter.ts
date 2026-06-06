/**
 * @fileoverview Express wiring + auth-provider registration for magic links.
 *
 * Mirrors the OAuth handler pattern: a public router (unauthenticated — JWKS +
 * redeem) mounted BEFORE the unified auth middleware, and an authenticated
 * router (invite creation) mounted AFTER it so `req.userPayload` is available.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import { Router, json, urlencoded, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogError, LogStatus, type AuthProviderConfig } from '@memberjunction/core';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { configInfo, type MagicLinkConfig } from '../../config.js';
import { MagicLinkKeyManager } from './MagicLinkKeys.js';
import { MagicLinkService } from './MagicLinkService.js';
import { buildRedeemLandingHtml } from './redeemLanding.js';
import type { CreateMagicLinkInviteParams, RedeemMagicLinkResult } from './types.js';

/** The mount path for both routers (`/magic-link`). */
export const MAGIC_LINK_MOUNT_PATH = '/magic-link';

/** Path of the JWKS endpoint relative to the public URL. */
export const MAGIC_LINK_JWKS_PATH = `${MAGIC_LINK_MOUNT_PATH}/jwks.json`;

/**
 * Builds the magic-link routers. The caller mounts `publicRouter` before the
 * auth middleware and `authenticatedRouter` after it (both at MAGIC_LINK_MOUNT_PATH).
 */
export function createMagicLinkHandler(publicUrl: string, config: MagicLinkConfig): {
  publicRouter: Router;
  authenticatedRouter: Router;
} {
  // Initialize the signing keypair once.
  MagicLinkKeyManager.Instance.Initialize(config.rsaPrivateKey);

  const service = new MagicLinkService(publicUrl, config);

  // Throttle the unauthenticated redemption endpoint and the authenticated
  // create endpoint. /redeem is a public surface that does a DB lookup +
  // (on a hit) user provisioning + token minting, so it must be rate-limited
  // against guessing/enumeration/resource-exhaustion. Keyed by IP.
  const redeemLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.redeemRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, errorCode: 'invalid', error: 'Too many redemption attempts. Try again later.' },
  });
  const createLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.createRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: 'Too many invite requests. Try again later.' },
  });

  // ── Public (unauthenticated) ──────────────────────────────────────────────
  const publicRouter = Router();

  publicRouter.get('/jwks.json', (_req: Request, res: Response) => {
    res.status(200).json(MagicLinkKeyManager.Instance.GetJWKS());
  });

  // Sends a completed redemption result: browser flow → 302 into Explorer with
  // the session token in the URL fragment (never sent to a server, so it stays
  // out of access/proxy logs); API flow → JSON with an appropriate status.
  const sendRedeemResult = (res: Response, result: RedeemMagicLinkResult, wantsJson: boolean): void => {
    const explorerUrl = config.explorerUrl?.replace(/\/$/, '');
    if (explorerUrl && !wantsJson) {
      if (result.success && result.token) {
        // Deep-link into the invited app's route (e.g. /app/data-explorer) rather
        // than Explorer's root — root falls through to Explorer's default resource,
        // which isn't the scoped app. Use the app's URL Path (what Explorer's
        // GetAppByPath matches on); fall back to a name-slug only when Path is
        // absent. Do NOT hand-roll a slug from the name when Path exists — the two
        // can diverge and Explorer would fail to resolve the app.
        const appSlug = result.applicationPath
          ? result.applicationPath
          : result.applicationName
          ? result.applicationName.trim().toLowerCase().replace(/\s+/g, '-')
          : '';
        const path = appSlug ? `/app/${encodeURIComponent(appSlug)}` : '/';
        res.redirect(302, `${explorerUrl}${path}#token=${encodeURIComponent(result.token)}`);
      } else {
        res.redirect(302, `${explorerUrl}/?mlError=${encodeURIComponent(result.errorCode ?? 'invalid')}`);
      }
      return;
    }
    // API/JSON flow.
    // not_found / expired / consumed / revoked are client-side conditions (410 Gone);
    // server_error / provisioning_failed are 500.
    const status = result.success ? 200 : result.errorCode === 'server_error' || result.errorCode === 'provisioning_failed' ? 500 : 410;
    res.status(status).json(result);
  };

  // GET /redeem is SAFE (no side effects). Link prefetchers and email security
  // scanners routinely fetch URLs; a side-effectful GET would let them burn the
  // single-use token before the human clicks. So GET renders an interstitial and
  // the actual redemption happens only on POST (below), gated by a user click.
  publicRouter.get('/redeem', redeemLimiter, (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(400).json({ success: false, error: 'Missing token.' });
      return;
    }
    // API callers must POST — GET never redeems.
    if (req.query.format === 'json') {
      res.status(405).json({ success: false, error: 'Redemption requires POST.', method: 'POST', path: `${MAGIC_LINK_MOUNT_PATH}/redeem` });
      return;
    }
    res
      .status(200)
      .type('html')
      .send(buildRedeemLandingHtml(token, `${MAGIC_LINK_MOUNT_PATH}/redeem`));
  });

  // POST /redeem performs the actual (side-effectful) redemption. Token arrives
  // from the interstitial form body, an API client's JSON body, or the query.
  publicRouter.post('/redeem', redeemLimiter, urlencoded({ extended: false }), json(), async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { token?: string };
    const token =
      (typeof body.token === 'string' && body.token) ||
      (typeof req.query.token === 'string' ? req.query.token : '');
    const wantsJson = req.query.format === 'json' || req.is('application/json') === 'application/json';

    if (!token) {
      res.status(400).json({ success: false, error: 'Missing token.' });
      return;
    }

    // Forensic context for the redemption audit trail. `req.ip` honors the app's
    // trust-proxy setting; headers are best-effort and may be absent for API clients.
    const result = await service.RedeemInvite(token, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      origin: req.get('origin') ?? undefined,
    });
    sendRedeemResult(res, result, wantsJson);
  });

  // ── Authenticated (invite creation) ───────────────────────────────────────
  const authenticatedRouter = Router();

  authenticatedRouter.post('/create', createLimiter, json(), async (req: Request, res: Response) => {
    const creatingUser = req.userPayload?.userRecord;
    if (!creatingUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<CreateMagicLinkInviteParams>;
    if (!body.email || !body.applicationId) {
      res.status(400).json({ success: false, error: 'email and applicationId are required.' });
      return;
    }

    const result = await service.CreateInvite(
      {
        email: body.email,
        applicationId: body.applicationId,
        roleId: body.roleId,
        expiresInHours: body.expiresInHours,
        maxUses: body.maxUses,
        firstName: body.firstName,
        lastName: body.lastName,
      },
      creatingUser,
    );
    // forbidden → 403 (caller not allowed to issue invites); invalid_role and
    // other validation failures → 400.
    const status = result.success ? 200 : result.errorCode === 'forbidden' ? 403 : 400;
    res.status(status).json(result);
  });

  return { publicRouter, authenticatedRouter };
}

/**
 * Registers the `magic-link` auth provider so MJServer's issuer-driven JWT
 * validation accepts MJ-issued session tokens. Issuer = public URL, JWKS URL =
 * the public JWKS endpoint, audience = configured magic-link audience.
 *
 * Also appends the provider to `configInfo.authProviders` so a later
 * `initializeAuthProviders()` (which clears + repopulates from config) keeps it.
 */
export function registerMagicLinkAuthProvider(publicUrl: string, config: MagicLinkConfig): void {
  const base = publicUrl.replace(/\/$/, '');
  const providerConfig: AuthProviderConfig = {
    name: 'magic-link',
    type: 'magic-link',
    issuer: publicUrl,
    audience: config.audience,
    jwksUri: `${base}${MAGIC_LINK_JWKS_PATH}`,
  };

  try {
    configInfo.authProviders = configInfo.authProviders ?? [];
    if (!configInfo.authProviders.some((p) => p.type === 'magic-link')) {
      configInfo.authProviders.push(providerConfig);
    }
    const factory = AuthProviderFactory.Instance;
    factory.register(AuthProviderFactory.createProvider(providerConfig));
    LogStatus(`[MagicLink] Registered auth provider (issuer: ${publicUrl}, jwks: ${providerConfig.jwksUri})`);
  } catch (e) {
    LogError(`[MagicLink] Failed to register auth provider: ${e instanceof Error ? e.message : String(e)}`);
  }
}
