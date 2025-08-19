import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/**
 * Microsoft Authentication Library (MSAL) provider implementation
 */
@RegisterClass(BaseAuthProvider, 'msal')
export class MSALProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user information from MSAL/Azure AD JWT payload
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    // MSAL/Azure AD uses some custom claims
    const email = payload.email as string | undefined || payload.preferred_username as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = payload.preferred_username as string | undefined;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates MSAL-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    const hasTenantId = !!this.config.tenantId;
    
    return baseValid && hasClientId && hasTenantId;
  }
}