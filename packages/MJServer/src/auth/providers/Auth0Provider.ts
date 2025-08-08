import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { BaseAuthProvider } from '../BaseAuthProvider.js';
import { AuthProviderConfig } from '../IAuthProvider.js';

/**
 * Auth0 authentication provider implementation
 */
@RegisterClass(BaseAuthProvider, 'auth0')
export class Auth0Provider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user information from Auth0 JWT payload
   */
  extractUserInfo(payload: JwtPayload): {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  } {
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