/**
 * @fileoverview Unauthenticated provider-catalog endpoint.
 *
 * The browser must know which identity providers exist BEFORE it can authenticate, so this
 * router is mounted ahead of the unified auth middleware — the same pattern the magic-link JWKS
 * and widget-session routes already use.
 *
 * @module @memberjunction/server/auth
 */

import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogError, type PublicAuthProviderCatalog } from '@memberjunction/core';
import { AuthProviderEngine } from './AuthProviderEngine.js';

/** Mount path for the public catalog router. */
export const AUTH_CATALOG_MOUNT_PATH = '/auth';

/** Requests per window per IP. Generous — a browser makes one call per page load. */
const DEFAULT_RATE_LIMIT_MAX = 60;

/** Rate-limit window. */
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * How long a browser may cache the catalog.
 *
 * Short by design: this drives the login screen, so an admin who enables a provider expects to
 * see it without telling users to hard-refresh. A minute keeps the endpoint cheap without making
 * configuration changes feel stuck.
 */
const CACHE_MAX_AGE_SECONDS = 60;

/**
 * Builds the unauthenticated `GET /auth/providers` router.
 *
 * **What it exposes.** Only `Active` + `ClientVisible` rows, projected to the public allow-list
 * by {@link AuthProviderEngine.GetPublicCatalog}. Secret material is structurally unable to reach
 * this response: `CredentialID` and `AdditionalConfiguration` are not part of the public shape,
 * and non-primitive `ClientConfiguration` values are dropped rather than serialized.
 *
 * **Why publishing this is safe.** Every value here was already shipped to anonymous users — a
 * single-provider SPA compiled its client ID, domain and issuer straight into its JavaScript
 * bundle. This endpoint moves that same data behind one source of truth; it does not widen what
 * an anonymous caller can learn.
 *
 * **Failure is empty, not an error.** If the catalog cannot be read, the endpoint returns an empty
 * list so the browser falls back to its compiled `AUTH_TYPE` and the user can still sign in.
 * Returning 500 would take the login screen down for a problem the client can route around.
 */
export function createAuthProviderCatalogRouter(): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: DEFAULT_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { providers: [] }
  });

  router.get('/providers', limiter, (_req: Request, res: Response) => {
    try {
      const body: PublicAuthProviderCatalog = { providers: AuthProviderEngine.Instance.GetPublicCatalog() };
      res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
      res.status(200).json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`[Auth] Failed to serve the public provider catalog: ${message}`);
      const empty: PublicAuthProviderCatalog = { providers: [] };
      res.status(200).json(empty);
    }
  });

  return router;
}
