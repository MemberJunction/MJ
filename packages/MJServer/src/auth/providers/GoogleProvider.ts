import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { BaseAuthProvider } from '../BaseAuthProvider.js';
import { AuthProviderConfig } from '../IAuthProvider.js';

/**
 * Google Identity Platform authentication provider implementation
 */
@RegisterClass(BaseAuthProvider, 'google')
export class GoogleProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user information from Google JWT payload
   */
  extractUserInfo(payload: JwtPayload): {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  } {
    // Google uses standard OIDC claims
    const email = payload.email as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = email; // Google typically uses email as username

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates Google-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    
    return baseValid && hasClientId;
  }
}