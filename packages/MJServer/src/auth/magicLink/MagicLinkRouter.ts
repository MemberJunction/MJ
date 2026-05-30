/**
 * @fileoverview Express wiring + auth-provider registration for magic links.
 *
 * Mirrors the OAuth handler pattern: a public router (unauthenticated — JWKS +
 * redeem) mounted BEFORE the unified auth middleware, and an authenticated
 * router (invite creation) mounted AFTER it so `req.userPayload` is available.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import { Router, json, type Request, type Response } from 'express';
import { LogError, LogStatus, type AuthProviderConfig } from '@memberjunction/core';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { configInfo, type MagicLinkConfig } from '../../config.js';
import { MagicLinkKeyManager } from './MagicLinkKeys.js';
import { MagicLinkService } from './MagicLinkService.js';
import type { CreateMagicLinkInviteParams } from './types.js';

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

  // ── Public (unauthenticated) ──────────────────────────────────────────────
  const publicRouter = Router();

  publicRouter.get('/jwks.json', (_req: Request, res: Response) => {
    res.status(200).json(MagicLinkKeyManager.Instance.GetJWKS());
  });

  publicRouter.get('/redeem', async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const wantsJson = req.query.format === 'json';
    const explorerUrl = config.explorerUrl?.replace(/\/$/, '');

    if (!token) {
      res.status(400).json({ success: false, error: 'Missing token.' });
      return;
    }

    const result = await service.redeemInvite(token);

    // Browser flow: redirect into Explorer with the session token in the URL
    // fragment (Explorer's magic-link provider reads it). The fragment is never
    // sent to a server, so the token stays out of server/proxy logs.
    if (explorerUrl && !wantsJson) {
      if (result.success && result.token) {
        // Deep-link into the invited app's route (e.g. /app/data-explorer) rather
        // than Explorer's root — root falls through to Explorer's default resource,
        // which isn't the scoped app. The app slug mirrors Explorer's convention:
        // lowercased, spaces → hyphens (e.g. "Data Explorer" → "data-explorer").
        const appSlug = result.applicationName
          ? result.applicationName.trim().toLowerCase().replace(/\s+/g, '-')
          : '';
        const path = appSlug ? `/app/${appSlug}` : '/';
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
  });

  // ── Authenticated (invite creation) ───────────────────────────────────────
  const authenticatedRouter = Router();

  authenticatedRouter.post('/create', json(), async (req: Request, res: Response) => {
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

    const result = await service.createInvite(
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
    res.status(result.success ? 200 : 400).json(result);
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
