/**
 * @fileoverview Express wiring for the public web widget guest-session endpoints.
 *
 * Mirrors the magic-link public-router pattern: a single PUBLIC router
 * (unauthenticated) mounted BEFORE the unified auth middleware. The widget reuses
 * the magic-link RS256 key + the registered `magic-link` auth provider for token
 * validation, so this module ensures both are initialized (idempotently) even when
 * `magicLink.enabled` is false — the widget can stand on its own.
 *
 * @module @memberjunction/server/widget
 */

import { Router, json, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogStatus } from '@memberjunction/core';
import { configInfo, type WidgetConfig } from '../config.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { registerMagicLinkAuthProvider } from '../auth/magicLink/MagicLinkRouter.js';
import { WidgetSessionService, type MintGuestSessionResult } from './WidgetSessionService.js';

/** The mount path for the widget public router (`/widget`). */
export const WIDGET_MOUNT_PATH = '/widget';

/**
 * Ensures the magic-link signing key is initialized and the `magic-link` auth
 * provider is registered, so widget tokens (signed with that key) validate. Safe to
 * call when magic-link is already enabled — both operations are idempotent.
 */
function ensureWidgetSigning(publicUrl: string, widgetConfig: WidgetConfig): void {
  const mlConfig = configInfo.magicLink;
  // The widget shares the magic-link audience so the same provider validates its
  // tokens; surface a clear log if a deployment diverged them.
  if (mlConfig?.audience && mlConfig.audience !== widgetConfig.audience) {
    LogStatus(
      `[Widget] WARNING: widget.audience ('${widgetConfig.audience}') != magicLink.audience ('${mlConfig.audience}'). ` +
      `Widget tokens will not validate unless an auth provider is registered for the widget audience.`,
    );
  }
  MagicLinkKeyManager.Instance.Initialize(mlConfig?.rsaPrivateKey);
  // Register the magic-link provider against the magic-link config (its audience),
  // which is what validates widget tokens. No-op if already registered.
  if (mlConfig) {
    registerMagicLinkAuthProvider(publicUrl, mlConfig);
  }
}

/**
 * Builds the widget public router. Mount it at WIDGET_MOUNT_PATH BEFORE the unified
 * auth middleware (the mint endpoint is public — visitors have no MJ JWT yet).
 */
export function createWidgetHandler(publicUrl: string, config: WidgetConfig): { publicRouter: Router } {
  ensureWidgetSigning(publicUrl, config);

  const service = new WidgetSessionService(publicUrl, config);

  // Public mint surface: a DB lookup + token mint, keyed by IP. The per-instance
  // RateLimitPerMinute is stored on the widget and enforced in hardening (W6); this
  // is the coarse server-wide guard against enumeration/exhaustion.
  const mintLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.defaultRateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, errorCode: 'rate_limited', error: 'Too many widget session requests. Try again later.' },
  });

  const publicRouter = Router();

  publicRouter.post('/session', mintLimiter, json(), async (req: Request, res: Response) => {
    await handleMint(service, req, res, false);
  });

  publicRouter.post('/session/refresh', mintLimiter, json(), async (req: Request, res: Response) => {
    await handleMint(service, req, res, true);
  });

  return { publicRouter };
}

/** Shared mint/refresh handler — parses the request, calls the service, maps the status. */
async function handleMint(service: WidgetSessionService, req: Request, res: Response, refresh: boolean): Promise<void> {
  const body = (req.body ?? {}) as { widgetKey?: string; hostAssertion?: string };
  const widgetKey = typeof body.widgetKey === 'string' ? body.widgetKey : '';
  if (!widgetKey) {
    res.status(400).json({ success: false, errorCode: 'not_found', error: 'widgetKey is required.' });
    return;
  }

  const origin = req.get('origin') ?? undefined;
  const input = {
    widgetKey,
    origin,
    hostAssertion: typeof body.hostAssertion === 'string' ? body.hostAssertion : undefined,
    audit: { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined, origin },
  };
  const result = refresh ? await service.RefreshGuestSession(input) : await service.MintGuestSession(input);
  res.status(statusForResult(result)).json(result);
}

/**
 * Maps a mint result to an HTTP status. All client-side rejections (unknown key,
 * disabled widget, disallowed origin, modality off) return 403 — deliberately
 * uniform so a probe cannot distinguish "no such widget" from "wrong origin" and
 * enumerate valid keys. Only true server faults return 500.
 */
function statusForResult(result: MintGuestSessionResult): number {
  if (result.success) {
    return 200;
  }
  return result.errorCode === 'server_error' ? 500 : 403;
}
