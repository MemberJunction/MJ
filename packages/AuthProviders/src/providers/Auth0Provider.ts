import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/**
 * Auth0 authentication provider implementation
 */
@RegisterClass(BaseAuthProvider, 'auth0')
export class Auth0Provider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Configures Auth0 from AUTH0_DOMAIN + AUTH0_CLIENT_ID (AUTH0_CLIENT_SECRET optional).
   *
   * Mapping preserved byte-for-byte from the env block that previously lived in MJServer's
   * config, so a deployment upgrading to the hook-based discovery sees no change.
   */
  static configFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
    if (!env.AUTH0_DOMAIN || !env.AUTH0_CLIENT_ID) {
      return null;
    }
    return {
      name: 'auth0',
      type: 'auth0',
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_CLIENT_ID,
      jwksUri: `https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`,
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      domain: env.AUTH0_DOMAIN
    };
  }

  /**
   * Extracts user information from Auth0 JWT payload
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    // Auth0 uses standard OIDC claims
    const email = payload.email as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = payload.preferred_username as string | undefined || email;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates Auth0-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    const hasDomain = !!this.config.domain;
    
    return baseValid && hasClientId && hasDomain;
  }
}