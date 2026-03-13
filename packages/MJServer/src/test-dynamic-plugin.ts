/**
 * Test Dynamic Plugin for Phase 2 DynamicPackageLoader testing.
 *
 * This simple plugin validates the DynamicPackageLoader → MJServer pipeline:
 * - Startup function is called and returns extensibility config
 * - Post-auth middleware is injected and runs on each authenticated request
 * - Middleware has access to the authenticated user via req.userPayload
 *
 * To enable: add to dynamicPackages.server in packages/MJAPI/mj.config.cjs
 * To disable: set Enabled: false or remove the entry
 */
import type { RequestHandler } from 'express';

interface UserPayload {
  email?: string;
  userRecord?: { ID?: string };
}

/** Post-auth middleware that logs authenticated requests */
const testPostAuthMiddleware: RequestHandler = (req, _res, next) => {
  const userPayload = (req as { userPayload?: UserPayload }).userPayload;
  const email = userPayload?.email ?? 'unknown';
  console.log(`[TestPlugin] Post-auth middleware: ${req.method} ${req.path} (user: ${email})`);
  next();
};

/**
 * Startup function called by DynamicPackageLoader.
 * Returns extensibility config that gets merged into server options.
 */
export function LoadTestPlugin(): Record<string, unknown> {
  console.log('[TestPlugin] Startup function called');
  return {
    ExpressMiddlewarePostAuth: [testPostAuthMiddleware],
  };
}
