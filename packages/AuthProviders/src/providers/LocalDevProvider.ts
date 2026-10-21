import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/**
 * Local development authentication provider (`local`).
 *
 * Validates short-lived RS256 development JWTs minted by MJAPI's local-only
 * `/auth/dev-login` endpoint (backed by MJ's ephemeral `MagicLinkKeyManager`
 * keypair and JWKS endpoint).
 *
 * SECURITY INVARIANT:
 * - Strictly for local development (`localhost` / `127.0.0.1`) when
 *   `MJ_DEV_AUTH_ENABLED=true`.
 * - Must NEVER be enabled when `NODE_ENV=production` — `ConfigFromEnvironment`
 *   throws a fatal startup error if `MJ_DEV_AUTH_ENABLED` is truthy in production.
 */
@RegisterClass(BaseAuthProvider, 'local')
export class LocalDevProvider extends BaseAuthProvider {
  public static readonly DEFAULT_AUDIENCE = 'mj-local-dev';

  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Configures the local development auth provider when `MJ_DEV_AUTH_ENABLED`
   * is explicitly enabled (`'true'` or `'1'`).
   *
   * Fails loudly if `NODE_ENV === 'production'`.
   */
  static ConfigFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
    const rawEnabled = env.MJ_DEV_AUTH_ENABLED?.trim().toLowerCase();
    const isEnabled = rawEnabled === 'true' || rawEnabled === '1';
    if (!isEnabled) {
      return null;
    }

    if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
      throw new Error(
        '[SECURITY] Local dev auth (MJ_DEV_AUTH_ENABLED) is strictly forbidden when NODE_ENV=production. Refusing to start.'
      );
    }

    const rawPublicUrl = env.MJAPI_PUBLIC_URL?.trim().replace(/\/+$/, '');
    const rawBaseUrl = (env.GRAPHQL_BASE_URL ?? 'http://localhost').trim().replace(/\/+$/, '');
    const port = env.GRAPHQL_PORT?.trim() || '4000';
    const base = rawPublicUrl || `${rawBaseUrl}:${port}`;
    const rawBasePath = (env.MJAPI_BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
    const pathPrefix = rawBasePath ? `/${rawBasePath}` : '';

    return {
      name: 'local',
      type: 'local',
      issuer: `${base}/local-dev`,
      audience: LocalDevProvider.DEFAULT_AUDIENCE,
      jwksUri: `${base}${pathPrefix}/magic-link/jwks.json`,
    };
  }

  /**
   * Extracts user identity from a local-dev JWT payload.
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    const email = payload.email as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ').slice(1).join(' ') || fullName?.split(' ')[0],
      fullName: fullName || [firstName, lastName].filter(Boolean).join(' ') || undefined,
      preferredUsername: (payload.preferred_username as string | undefined) || email,
    };
  }
}
